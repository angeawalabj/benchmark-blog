#!/usr/bin/env node
/**
 * Benchmark : throughput & latence HTTP — Fastify vs Express vs Hono
 *
 * Usage :
 *   node benchmarks/api-throughput.js
 *   node benchmarks/api-throughput.js --duration 10 --connections 50
 *   node benchmarks/api-throughput.js --frameworks fastify,express
 *
 * Output : JSON structuré sur stdout (compatible generate/article.js)
 * Chaque framework tourne dans un sous-processus isolé pour éviter
 * toute interférence (event loop, module cache, GC).
 *
 * Métriques collectées par scénario :
 *   - Requêtes/s (throughput)
 *   - Latence p50 / p95 / p99 (ms)
 *   - Erreurs HTTP et erreurs réseau
 *   - Throughput données (MB/s)
 */

"use strict";

const { spawn } = require("child_process");
const { performance } = require("perf_hooks");
const autocannon = require("autocannon");
const path = require("path");

// ─── Configuration ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const CONFIG = {
    duration: Number(argVal(args, "--duration")) || 8,   // secondes par scénario
    connections: Number(argVal(args, "--connections")) || 25,  // connexions concurrentes
    pipelining: Number(argVal(args, "--pipelining")) || 1,   // requêtes pipeline
    warmupSecs: Number(argVal(args, "--warmup")) || 2,   // warmup ignoré
    frameworks: (argVal(args, "--frameworks") || "fastify,express,hono").split(","),
    basePort: Number(argVal(args, "--base-port")) || 3100,
};

function argVal(arr, flag) {
    const i = arr.indexOf(flag);
    return i !== -1 ? arr[i + 1] : null;
}

function log(msg) {
    process.stderr.write(`[benchmark] ${msg}\n`);
}

function round(v, d = 2) {
    return Math.round(v * 10 ** d) / 10 ** d;
}

// ─── Scénarios ────────────────────────────────────────────────────────────────

const SCENARIOS = [
    {
        id: "ping",
        label: "Latence pure — GET /ping",
        description: "Réponse JSON minimale { ok: true }, mesure le overhead pur du framework",
        path: "/ping",
    },
    {
        id: "json_serialization",
        label: "Sérialisation JSON — GET /json",
        description: "Objet JSON ~500 bytes avec types imbriqués, mesure le coût de sérialisation",
        path: "/json",
    },
    {
        id: "cpu_bound",
        label: "CPU-bound — GET /cpu",
        description: "fibonacci(28) par requête, mesure l'impact d'un calcul synchrone sur le throughput",
        path: "/cpu",
    },
    {
        id: "query_string",
        label: "Query string parsing — GET /echo",
        description: "Parsing et echo d'un paramètre, mesure le coût du routing + parsing",
        path: "/echo?msg=benchmark-test-payload",
    },
];

// ─── Gestion des workers ──────────────────────────────────────────────────────

function startWorker(framework, port) {
    return new Promise((resolve, reject) => {
        const worker = spawn(
            process.execPath,
            [
                path.join(__dirname, "_http-worker.js"),
                "--framework", framework,
                "--port", String(port),
            ],
            { stdio: ["ignore", "pipe", "pipe"] }
        );

        let ready = false;
        const timeout = setTimeout(() => {
            if (!ready) {
                worker.kill("SIGTERM");
                reject(new Error(`[${framework}] Timeout démarrage (5s)`));
            }
        }, 5000);

        // Écoute "READY\n" sur stdout du worker
        worker.stdout.on("data", (chunk) => {
            if (!ready && chunk.toString().includes("READY")) {
                ready = true;
                clearTimeout(timeout);
                resolve(worker);
            }
        });

        // Forward stderr du worker vers notre stderr
        worker.stderr.on("data", (d) => process.stderr.write(d));

        worker.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        worker.on("exit", (code) => {
            if (!ready) {
                clearTimeout(timeout);
                reject(new Error(`[${framework}] Processus terminé (code ${code}) avant READY`));
            }
        });
    });
}

function stopWorker(worker) {
    return new Promise((resolve) => {
        worker.on("exit", resolve);
        worker.kill("SIGTERM");
        // Force kill après 3s si SIGTERM ignoré
        setTimeout(() => { try { worker.kill("SIGKILL"); } catch { } }, 3000);
    });
}

// ─── Autocannon wrapper ───────────────────────────────────────────────────────

function runAutocannon(url, { duration, connections, pipelining }) {
    return new Promise((resolve, reject) => {
        const instance = autocannon(
            {
                url,
                duration,
                connections,
                pipelining,
                // Timeout par requête : évite que des lenteurs bloquent le benchmark
                timeout: 5,
            },
            (err, result) => {
                if (err) reject(err);
                else resolve(result);
            }
        );
        // Silence les logs internes d'autocannon
        autocannon.track(instance, { renderProgressBar: false });
    });
}

function extractMetrics(result, framework, scenario) {
    const { latency, requests, throughput, errors, non2xx } = result;
    return {
        scenario_id: scenario.id,
        label: scenario.label,
        description: scenario.description,
        framework,
        // Throughput
        req_per_sec: round(requests.average),
        req_per_sec_p1: round(requests.p1 || requests.min),
        req_per_sec_p99: round(requests.p99 || requests.max),
        // Latence (ms)
        p50: round(latency.p50),
        p75: round(latency.p75 || latency.p90),
        p95: round(latency.p95 || latency.p99),
        p99: round(latency.p99),
        min: round(latency.min),
        max: round(latency.max),
        mean: round(latency.average),
        // Qualité
        errors: (errors || 0) + (non2xx || 0),
        // Bande passante
        throughput_mb_s: round(throughput.average / 1024 / 1024),
        // Meta
        duration_s: result.duration,
        connections: result.connections,
        total_requests: result.requests.total,
    };
}

// ─── Runner principal ─────────────────────────────────────────────────────────

async function benchmarkFramework(framework, port) {
    log(`\n${"─".repeat(50)}`);
    log(`Framework : ${framework.toUpperCase()} · port ${port}`);
    log(`${"─".repeat(50)}`);

    const worker = await startWorker(framework, port);
    const baseUrl = `http://127.0.0.1:${port}`;
    const results = [];

    try {
        // Warmup : GET /ping pendant quelques secondes pour chauffer l'event loop
        log(`  Warmup (${CONFIG.warmupSecs}s)…`);
        await runAutocannon(`${baseUrl}/ping`, {
            duration: CONFIG.warmupSecs,
            connections: CONFIG.connections,
            pipelining: CONFIG.pipelining,
        });

        for (const scenario of SCENARIOS) {
            log(`  Scénario : ${scenario.label} (${CONFIG.duration}s · ${CONFIG.connections} conn)…`);
            const t0 = performance.now();

            const raw = await runAutocannon(`${baseUrl}${scenario.path}`, {
                duration: CONFIG.duration,
                connections: CONFIG.connections,
                pipelining: CONFIG.pipelining,
            });

            const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
            const metrics = extractMetrics(raw, framework, scenario);

            log(
                `    → ${metrics.req_per_sec.toLocaleString()} req/s · p50=${metrics.p50}ms · p99=${metrics.p99}ms · errors=${metrics.errors} (${elapsed}s)`
            );

            results.push(metrics);
        }
    } finally {
        await stopWorker(worker);
        log(`  Worker ${framework} arrêté.`);
    }

    return results;
}

// ─── Comparaisons cross-framework ─────────────────────────────────────────────

function buildComparisons(allResults) {
    const comparisons = [];

    for (const scenario of SCENARIOS) {
        const scenarioResults = allResults.filter((r) => r.scenario_id === scenario.id);
        if (scenarioResults.length < 2) continue;

        const sorted = [...scenarioResults].sort((a, b) => b.req_per_sec - a.req_per_sec);
        const winner = sorted[0];
        const others = sorted.slice(1);

        comparisons.push({
            scenario_id: scenario.id,
            label: scenario.label,
            winner: winner.framework,
            winner_req_per_sec: winner.req_per_sec,
            winner_p99_ms: winner.p99,
            ranking: sorted.map((r, i) => ({
                rank: i + 1,
                framework: r.framework,
                req_per_sec: r.req_per_sec,
                p50_ms: r.p50,
                p99_ms: r.p99,
                // Ratio par rapport au gagnant (gagnant = 1.0)
                ratio_vs_winner: i === 0 ? 1.0 : round(r.req_per_sec / winner.req_per_sec),
                overhead_pct: i === 0 ? 0 : round((1 - r.req_per_sec / winner.req_per_sec) * 100),
            })),
        });
    }

    return comparisons;
}

function buildSummary(allResults, comparisons) {
    return SCENARIOS.map((s) => {
        const cmp = comparisons.find((c) => c.scenario_id === s.id);
        return {
            scenario_id: s.id,
            label: s.label,
            winner: cmp?.winner ?? null,
            ranking: cmp?.ranking ?? [],
        };
    });
}

// ─── Point d'entrée ───────────────────────────────────────────────────────────

async function main() {
    const startedAt = new Date().toISOString();
    const t0 = performance.now();

    log("=== Benchmark API throughput démarré ===");
    log(`Frameworks : ${CONFIG.frameworks.join(", ")}`);
    log(`Config     : ${JSON.stringify(CONFIG)}`);

    const allResults = [];

    // Run séquentiel : un framework à la fois (évite la contention CPU)
    for (let i = 0; i < CONFIG.frameworks.length; i++) {
        const framework = CONFIG.frameworks[i].trim();
        const port = CONFIG.basePort + i;

        try {
            const results = await benchmarkFramework(framework, port);
            allResults.push(...results);
        } catch (err) {
            log(`ERREUR ${framework} : ${err.message} — skipped`);
        }

        // Pause entre frameworks pour laisser le GC et l'OS se stabiliser
        if (i < CONFIG.frameworks.length - 1) {
            log("  Pause 1s entre frameworks…");
            await new Promise((r) => setTimeout(r, 1000));
        }
    }

    const duration_ms = Math.round(performance.now() - t0);
    const comparisons = buildComparisons(allResults);
    const summary = buildSummary(allResults, comparisons);

    log(`\n=== Terminé en ${(duration_ms / 1000).toFixed(1)}s ===`);

    const output = {
        meta: {
            benchmark: "api-throughput",
            version: "1.0.0",
            started_at: startedAt,
            duration_ms,
            environment: {
                node: process.version,
                platform: process.platform,
                arch: process.arch,
                ci: Boolean(process.env.CI),
                runner: process.env.RUNNER_NAME || "local",
            },
            config: CONFIG,
            framework_versions: getFrameworkVersions(CONFIG.frameworks),
        },
        results: allResults,
        comparisons,
        summary,
    };

    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

function getFrameworkVersions(frameworks) {
    const versions = {};
    for (const fw of frameworks) {
        try {
            versions[fw] = require(`${fw.trim() === "hono" ? "hono" : fw.trim()}/package.json`).version;
        } catch {
            versions[fw] = "unknown";
        }
    }
    return versions;
}

main().catch((err) => {
    process.stderr.write(`[benchmark] ERREUR FATALE : ${err.message}\n${err.stack}\n`);
    process.exit(1);
});