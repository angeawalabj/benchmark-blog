#!/usr/bin/env node
/**
 * Benchmark : lecture de fichiers — 6 méthodes Node.js comparées
 *
 * Méthodes testées :
 *   readFileCallback  — fs.readFile (callback)
 *   readFilePromise   — fs.promises.readFile
 *   readStream        — fs.createReadStream (chunks)
 *   readlineInterface — readline ligne par ligne
 *   readManualBuffer  — fs.read() low-level avec buffer fixe
 *   readPipeline      — stream.pipeline() composition
 *
 * Tailles de fichiers testées :
 *   small  — 256 KB  (config, petits CSV)
 *   medium — 4 MB    (logs journaliers, JSON dumps)
 *   large  — 32 MB   (exports, datasets)
 *   xlarge — 128 MB  (gros fichiers de données)
 *
 * Usage :
 *   node benchmarks/file-io.js
 *   node benchmarks/file-io.js --runs 20 --sizes small,medium
 *   node benchmarks/file-io.js --methods readFilePromise,readStream
 *   node benchmarks/file-io.js --chunk-size 65536
 *
 * Output : JSON structuré sur stdout (compatible generate/article.js)
 */

"use strict";

const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const os = require("os");
const { Worker } = require("worker_threads");
const { performance } = require("perf_hooks");

// ─── Configuration ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const CONFIG = {
    runs: Number(argVal(args, "--runs")) || 15,
    warmup: Number(argVal(args, "--warmup")) || 3,
    chunkSize: Number(argVal(args, "--chunk-size")) || 65536, // 64 KB
    sizes: (argVal(args, "--sizes") || "small,medium,large,xlarge").split(","),
    methods: (argVal(args, "--methods") ||
        "readFileCallback,readFilePromise,readStream,readlineInterface,readManualBuffer,readPipeline"
    ).split(","),
};

function argVal(arr, flag) {
    const i = arr.indexOf(flag);
    return i !== -1 ? arr[i + 1] : null;
}

function log(msg) { process.stderr.write(`[benchmark] ${msg}\n`); }
function round(v, d = 2) { return Math.round(v * 10 ** d) / 10 ** d; }

// ─── Tailles de fichiers ──────────────────────────────────────────────────────

const FILE_SIZES = {
    small: 256 * 1024,        //   256 KB
    medium: 4 * 1024 * 1024, //     4 MB
    large: 32 * 1024 * 1024, //    32 MB
    xlarge: 128 * 1024 * 1024, //   128 MB
};

const FILE_LABELS = {
    small: "256 KB",
    medium: "4 MB",
    large: "32 MB",
    xlarge: "128 MB",
};

// ─── Génération des fichiers de test ─────────────────────────────────────────

/**
 * Génère un fichier de texte réaliste (NDJSON-like) à la taille cible.
 * Le contenu simule des lignes de logs structurés — pattern courant en prod.
 */
async function generateTestFile(targetBytes) {
    const tmpPath = path.join(os.tmpdir(), `bench-fileio-${targetBytes}.txt`);

    // Réutilise le fichier s'il existe déjà (évite de régénérer à chaque run)
    try {
        const stat = await fsp.stat(tmpPath);
        if (Math.abs(stat.size - targetBytes) < 1024) {
            return tmpPath; // fichier déjà bon
        }
    } catch { /* n'existe pas encore */ }

    log(`  Génération fichier de test (${formatBytes(targetBytes)})…`);

    const CHUNK_SIZE = 256 * 1024; // écriture par chunks de 256KB
    const handle = await fsp.open(tmpPath, "w");
    let written = 0;

    // Ligne template de ~120 bytes (JSON de log réaliste)
    const lineTemplate = (i) =>
        `{"ts":${Date.now()},"level":"info","svc":"api","req_id":"req-${String(i).padStart(8, '0')}","msg":"GET /users/${i % 10000} 200 ${12 + (i % 200)}ms","user_id":${i % 50000}}\n`;

    let lineIdx = 0;
    let buf = "";

    while (written < targetBytes) {
        buf += lineTemplate(lineIdx++);
        if (buf.length >= CHUNK_SIZE || written + buf.length >= targetBytes) {
            const slice = buf.slice(0, Math.min(buf.length, targetBytes - written));
            const bytes = Buffer.from(slice);
            await handle.write(bytes);
            written += bytes.length;
            buf = buf.slice(slice.length);
        }
    }

    await handle.close();
    return tmpPath;
}

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
}

// ─── Runner d'une mesure unique via Worker Thread ────────────────────────────

function runWorker(method, filePath, chunkSize) {
    return new Promise((resolve, reject) => {
        const w = new Worker(
            path.join(__dirname, "_fileio-worker.js"),
            { workerData: { method, filePath, chunkSize } }
        );
        w.once("message", (msg) => {
            if (msg.ok) resolve(msg);
            else reject(new Error(msg.error));
        });
        w.once("error", reject);
        w.once("exit", (code) => {
            if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
        });
    });
}

// ─── Statistiques ─────────────────────────────────────────────────────────────

function percentile(sorted, p) {
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

function stats(timings) {
    const sorted = [...timings].sort((a, b) => a - b);
    return {
        p50: round(percentile(sorted, 50)),
        p75: round(percentile(sorted, 75)),
        p95: round(percentile(sorted, 95)),
        p99: round(percentile(sorted, 99)),
        min: round(sorted[0]),
        max: round(sorted[sorted.length - 1]),
        mean: round(sorted.reduce((s, v) => s + v, 0) / sorted.length),
        runs: sorted.length,
    };
}

// ─── Benchmark d'une méthode sur une taille ──────────────────────────────────

async function benchmarkMethod(method, filePath, fileSize) {
    const timings = [];
    const totalRuns = CONFIG.warmup + CONFIG.runs;

    for (let i = 0; i < totalRuns; i++) {
        // Flush du cache OS entre runs (best-effort — nécessite root sur Linux)
        // En CI on ne peut pas dropper le cache, mais on isole par Worker Thread
        try {
            if (process.platform === "linux" && i > 0) {
                // sync && echo 3 > /proc/sys/vm/drop_caches (nécessite sudo)
                // En pratique : le Worker Thread a un heap isolé, le cache FS varie
            }
        } catch { /* silencieux */ }

        const result = await runWorker(method, filePath, CONFIG.chunkSize);
        if (i >= CONFIG.warmup) timings.push(result.elapsed_ms);
    }

    const s = stats(timings);
    return {
        ...s,
        throughput_mb_s: round(fileSize / 1024 / 1024 / (s.p50 / 1000)),
        bytes_read: fileSize,
    };
}

// ─── Descriptions des méthodes ────────────────────────────────────────────────

const METHOD_META = {
    readFileCallback: {
        label: "fs.readFile (callback)",
        description: "Lecture complète en mémoire via l'API callback historique de Node.js",
        use_case: "Petits fichiers, code legacy, compat Node < 10",
        memory: "high",
    },
    readFilePromise: {
        label: "fs.promises.readFile",
        description: "Identique mais API Promises native — async/await friendly",
        use_case: "Petits fichiers, code moderne, one-liners",
        memory: "high",
    },
    readStream: {
        label: `fs.createReadStream (${CONFIG.chunkSize / 1024}KB chunks)`,
        description: `Lecture en chunks de ${CONFIG.chunkSize / 1024}KB — mémoire constante`,
        use_case: "Gros fichiers, transformations pipeline, upload/download",
        memory: "low",
    },
    readlineInterface: {
        label: "readline (ligne par ligne)",
        description: "Itération asynchrone sur chaque ligne via for-await-of",
        use_case: "CSV, logs, NDJSON, traitement ligne par ligne",
        memory: "low",
    },
    readManualBuffer: {
        label: `fs.read() manuel (buffer ${CONFIG.chunkSize / 1024}KB)`,
        description: "Lecture low-level avec contrôle total sur le buffer et la position",
        use_case: "Formats binaires, parsing custom, perfs maximales",
        memory: "constant",
    },
    readPipeline: {
        label: "stream.pipeline() composition",
        description: "Chaîne de streams avec backpressure et gestion d'erreurs intégrées",
        use_case: "Transformations chaînées, compression, encryption à la volée",
        memory: "low",
    },
};

// ─── Comparaisons ─────────────────────────────────────────────────────────────

function buildComparisons(allResults) {
    const comparisons = [];

    for (const size of CONFIG.sizes) {
        const sizeResults = allResults.filter((r) => r.size === size);
        if (sizeResults.length < 2) continue;

        const sorted = [...sizeResults].sort((a, b) => a.p50 - b.p50);
        const winner = sorted[0];
        const slowest = sorted[sorted.length - 1];

        comparisons.push({
            size,
            size_label: FILE_LABELS[size],
            winner: winner.method,
            winner_p50_ms: winner.p50,
            winner_throughput_mb_s: winner.throughput_mb_s,
            slowest: slowest.method,
            spread_ratio: round(slowest.p50 / winner.p50),
            ranking: sorted.map((r, i) => ({
                rank: i + 1,
                method: r.method,
                p50_ms: r.p50,
                p99_ms: r.p99,
                throughput_mb_s: r.throughput_mb_s,
                ratio_vs_winner: i === 0 ? 1.0 : round(r.p50 / winner.p50),
                overhead_pct: i === 0 ? 0 : round((r.p50 / winner.p50 - 1) * 100),
            })),
        });
    }

    return comparisons;
}

function buildSummary(allResults, comparisons) {
    // Gagnant global par méthode (nombre de victoires)
    const wins = {};
    for (const cmp of comparisons) {
        wins[cmp.winner] = (wins[cmp.winner] || 0) + 1;
    }

    return {
        wins_by_method: wins,
        overall_winner: Object.entries(wins).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
        by_size: comparisons.map((c) => ({
            size: c.size,
            size_label: c.size_label,
            winner: c.winner,
            ranking: c.ranking,
        })),
    };
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

async function main() {
    const startedAt = new Date().toISOString();
    const t0 = performance.now();

    log("=== Benchmark file I/O démarré ===");
    log(`Méthodes : ${CONFIG.methods.join(", ")}`);
    log(`Tailles  : ${CONFIG.sizes.join(", ")}`);
    log(`Config   : ${JSON.stringify(CONFIG)}`);

    // Génération des fichiers de test
    log("\nPréparation des fichiers de test…");
    const filePaths = {};
    for (const size of CONFIG.sizes) {
        filePaths[size] = await generateTestFile(FILE_SIZES[size]);
        log(`  ${size.padEnd(8)} → ${filePaths[size]}`);
    }

    const allResults = [];

    // Benchmark : taille par taille, méthode par méthode
    for (const size of CONFIG.sizes) {
        log(`\n${"─".repeat(52)}`);
        log(`Taille : ${FILE_LABELS[size]} (${FILE_SIZES[size].toLocaleString()} bytes)`);
        log(`${"─".repeat(52)}`);

        for (const method of CONFIG.methods) {
            const meta = METHOD_META[method];
            log(`  ${(meta?.label || method).padEnd(40)} (${CONFIG.warmup}w + ${CONFIG.runs} runs)…`);

            try {
                const result = await benchmarkMethod(method, filePaths[size], FILE_SIZES[size]);

                log(
                    `    → p50=${result.p50}ms · p99=${result.p99}ms · ${result.throughput_mb_s} MB/s`
                );

                allResults.push({
                    size,
                    size_label: FILE_LABELS[size],
                    size_bytes: FILE_SIZES[size],
                    method,
                    label: meta?.label || method,
                    description: meta?.description || "",
                    use_case: meta?.use_case || "",
                    memory_usage: meta?.memory || "unknown",
                    chunk_size_kb: CONFIG.chunkSize / 1024,
                    ...result,
                });
            } catch (err) {
                log(`    ERREUR : ${err.message} — skipped`);
            }
        }
    }

    // Nettoyage des fichiers temporaires
    log("\nNettoyage des fichiers de test…");
    for (const p of Object.values(filePaths)) {
        try { await fsp.unlink(p); } catch { /* silencieux */ }
    }

    const duration_ms = Math.round(performance.now() - t0);
    log(`\n=== Terminé en ${(duration_ms / 1000).toFixed(1)}s ===`);

    const comparisons = buildComparisons(allResults);
    const summary = buildSummary(allResults, comparisons);

    const output = {
        meta: {
            benchmark: "file-io",
            version: "1.0.0",
            started_at: startedAt,
            duration_ms,
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch,
                cpus: os.cpus().length,
                ram_gb: round(os.totalmem() / 1024 / 1024 / 1024, 1),
                ci: Boolean(process.env.CI),
                runner: process.env.RUNNER_NAME || "local",
            },
            config: CONFIG,
        },
        results: allResults,
        comparisons,
        summary,
    };

    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

main().catch((err) => {
    process.stderr.write(`[benchmark] ERREUR FATALE : ${err.message}\n${err.stack}\n`);
    process.exit(1);
});