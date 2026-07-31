#!/usr/bin/env node
/**
 * Générateur d'article Markdown — benchmark file-io
 *
 * Usage :
 *   node benchmarks/file-io.js | node generate/article-file-io.js
 *   node benchmarks/file-io.js | node generate/article-file-io.js --out content/posts
 */

"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const outDir = argVal(args, "--out") || "content/posts";
const historyFile = argVal(args, "--history") || "data/history-fileio.json";

function argVal(arr, flag) {
    const i = arr.indexOf(flag);
    return i !== -1 ? arr[i + 1] : null;
}

// ─── Historique ───────────────────────────────────────────────────────────────

function loadHistory(file) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return { runs: [] }; }
}

function saveHistory(file, history) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(history, null, 2) + "\n");
}

function appendToHistory(history, data) {
    history.runs.push({
        run_id: history.runs.length + 1,
        started_at: data.meta.started_at,
        duration_ms: data.meta.duration_ms,
        summary: data.summary,
    });
    if (history.runs.length > 52) history.runs = history.runs.slice(-52);
    return history;
}

async function readStdin() {
    return new Promise((resolve, reject) => {
        let buf = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (c) => (buf += c));
        process.stdin.on("end", () => { try { resolve(JSON.parse(buf)); } catch (e) { reject(e); } });
        process.stdin.on("error", reject);
    });
}

// ─── Visuels ─────────────────────────────────────────────────────────────────

function throughputBar(value, max, width = 26) {
    const filled = Math.max(1, Math.round((value / max) * width));
    return "█".repeat(filled) + "░".repeat(width - filled);
}

function medal(rank) {
    return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
}

/** Emoji mémoire */
function memEmoji(usage) {
    return usage === "high" ? "🔴" : usage === "low" ? "🟢" : "🟡";
}

/** Sparkline SVG de l'évolution du throughput d'une méthode */
function sparkline(history, methodId, sizeKey) {
    const points = history.runs
        .map((r) => r.summary?.by_size?.find((s) => s.size === sizeKey)
            ?.ranking?.find((m) => m.method === methodId)?.throughput_mb_s)
        .filter((v) => v != null)
        .slice(-16);

    if (points.length < 2) return "";

    const W = 180, H = 32, P = 3;
    const min = Math.min(...points), max = Math.max(...points);
    const range = max - min || 1;
    const xs = points.map((_, i) => P + i * ((W - P * 2) / (points.length - 1)));
    const ys = points.map((v) => P + ((max - v) / range) * (H - P * 2));
    const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    const colors = {
        readFileCallback: "#6366f1", readFilePromise: "#8b5cf6",
        readStream: "#10b981", readlineInterface: "#f59e0b",
        readManualBuffer: "#ef4444", readPipeline: "#3b82f6",
    };
    const color = colors[methodId] || "#888";

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
        `  <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`,
        `  <circle cx="${xs[xs.length - 1].toFixed(1)}" cy="${ys[ys.length - 1].toFixed(1)}" r="2" fill="${color}"/>`,
        `</svg>`,
    ].join("\n");
}

// ─── Génération Markdown ──────────────────────────────────────────────────────

function generateMarkdown(data, history, runNumber) {
    const { meta, results, comparisons, summary } = data;
    const date = new Date(meta.started_at).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
    });

    const methods = meta.config.methods;
    const sizes = meta.config.sizes;
    const lines = [];

    // ── Frontmatter ─────────────────────────────────────────────────────────────
    const slug = `file-io-${String(runNumber).padStart(3, "0")}`;
    lines.push("---");
    lines.push(`title: "Lecture de fichiers Node.js — 6 méthodes comparées #${runNumber}"`);
    lines.push(`description: "fs.readFile vs streams vs readline vs buffer manuel — p50/p99 et throughput MB/s sur ${sizes.map(s => ({ small: "256KB", medium: "4MB", large: "32MB", xlarge: "128MB" }[s])).join(", ")}"`);
    lines.push(`date: "${meta.started_at}"`);
    lines.push(`slug: "${slug}"`);
    lines.push(`benchmark: "file-io"`);
    lines.push(`run_number: ${runNumber}`);
    lines.push(`duration_ms: ${meta.duration_ms}`);
    lines.push(`tags: ["benchmark", "nodejs", "filesystem", "streams", "performance"]`);
    lines.push(`generated: true`);
    lines.push("---");
    lines.push("");

    // ── Titre ───────────────────────────────────────────────────────────────────
    lines.push(`# Lecture de fichiers Node.js — 6 méthodes comparées \\#${runNumber}`);
    lines.push("");
    lines.push(`> Article généré automatiquement · Run du ${date} · ${(meta.duration_ms / 1000).toFixed(0)}s · Node.js ${meta.environment.node} · ${meta.environment.cpus} CPU · ${meta.environment.ram_gb} GB RAM`);
    lines.push("");

    // ── Contexte ────────────────────────────────────────────────────────────────
    lines.push("## Contexte");
    lines.push("");
    lines.push(
        `Comparaison de **${methods.length} méthodes de lecture** de fichiers Node.js sur **${sizes.length} tailles** ` +
        `(${sizes.map(s => ({ small: "256 KB", medium: "4 MB", large: "32 MB", xlarge: "128 MB" }[s])).join(", ")}). ` +
        `Chaque méthode tourne dans un **Worker Thread isolé** — heap et GC séparés — pour éviter toute contamination entre runs.`
    );
    lines.push("");
    lines.push("| Paramètre | Valeur |");
    lines.push("|-----------|--------|");
    lines.push(`| Runs mesurés | ${meta.config.runs} par méthode par taille |`);
    lines.push(`| Warmup ignoré | ${meta.config.warmup} runs |`);
    lines.push(`| Chunk size (streams) | ${meta.config.chunkSize / 1024} KB |`);
    lines.push(`| Contenu des fichiers | NDJSON logs structurés (~120 bytes/ligne) |`);
    lines.push(`| Isolation | Worker Thread par run |`);
    lines.push(`| Environnement | ${meta.environment.runner} · ${meta.environment.platform}/${meta.environment.arch} |`);
    lines.push("");

    // ── Tableau cheat sheet des méthodes ────────────────────────────────────────
    lines.push("## Les 6 méthodes en un coup d'œil");
    lines.push("");
    lines.push("| Méthode | Mémoire | Quand l'utiliser |");
    lines.push("|---------|---------|------------------|");

    const META = {
        readFileCallback: { label: "fs.readFile (callback)", mem: "high", use: "Petits fichiers, compat legacy" },
        readFilePromise: { label: "fs.promises.readFile", mem: "high", use: "Petits fichiers, code moderne" },
        readStream: { label: "fs.createReadStream", mem: "low", use: "Gros fichiers, pipeline" },
        readlineInterface: { label: "readline", mem: "low", use: "CSV, logs, NDJSON ligne/ligne" },
        readManualBuffer: { label: "fs.read() + buffer", mem: "constant", use: "Binaire, parsing custom, perf max" },
        readPipeline: { label: "stream.pipeline()", mem: "low", use: "Chaînes de transformation" },
    };

    for (const m of methods) {
        const info = META[m] || { label: m, mem: "?", use: "—" };
        lines.push(`| \`${info.label}\` | ${memEmoji(info.mem)} ${info.mem} | ${info.use} |`);
    }
    lines.push("");
    lines.push("_🔴 = charge tout en RAM · 🟢 = mémoire constante · 🟡 = buffer fixe_");
    lines.push("");

    // ── Résultats par taille de fichier ─────────────────────────────────────────
    lines.push("## Résultats par taille de fichier");
    lines.push("");

    for (const cmp of comparisons) {
        lines.push(`### ${cmp.size_label}`);
        lines.push("");
        lines.push(`Spread : méthode la plus rapide → la plus lente = **${cmp.spread_ratio}×**`);
        lines.push("");

        // Barres ASCII throughput
        const maxThroughput = Math.max(...cmp.ranking.map((r) => r.throughput_mb_s));
        lines.push("**Throughput (MB/s) :**");
        lines.push("");
        lines.push("```");
        for (const r of cmp.ranking) {
            const bar = throughputBar(r.throughput_mb_s, maxThroughput);
            const label = (META[r.method]?.label || r.method).padEnd(26);
            const thru = String(r.throughput_mb_s + " MB/s").padStart(12);
            const ratio = r.ratio_vs_winner > 1 ? ` (${r.ratio_vs_winner}× plus lent)` : "";
            lines.push(`${medal(r.rank)} ${label} ${bar} ${thru}${ratio}`);
        }
        lines.push("```");
        lines.push("");

        // Tableau latence complet
        lines.push("| Rang | Méthode | p50 | p95 | p99 | Throughput |");
        lines.push("|------|---------|-----|-----|-----|------------|");
        for (const r of cmp.ranking) {
            const res = results.find(
                (x) => x.size === cmp.size && x.method === r.method
            );
            if (!res) continue;
            const mark = r.rank === 1 ? " ✓" : "";
            lines.push(
                `| ${medal(r.rank)} | **${META[r.method]?.label || r.method}**${mark} ` +
                `| ${res.p50} ms | ${res.p95} ms | ${res.p99} ms | ${res.throughput_mb_s} MB/s |`
            );
        }
        lines.push("");

        // Sparklines si historique
        if (history.runs.length >= 2) {
            lines.push("**Évolution du throughput (runs précédents) :**");
            lines.push("");
            for (const r of cmp.ranking.slice(0, 3)) { // top 3 seulement
                const svg = sparkline(history, r.method, cmp.size);
                if (svg) {
                    lines.push(`_${META[r.method]?.label || r.method}_`);
                    lines.push("");
                    lines.push(svg);
                    lines.push("");
                }
            }
        }
    }

    // ── Tableau croisé taille × méthode ─────────────────────────────────────────
    lines.push("## Vue d'ensemble — throughput MB/s par taille");
    lines.push("");

    // Header dynamique selon les tailles testées
    const sizeLabels = comparisons.map((c) => c.size_label);
    lines.push(`| Méthode | ${sizeLabels.join(" | ")} |`);
    lines.push(`|---------|${sizeLabels.map(() => "---").join("|")}|`);

    for (const method of methods) {
        const cells = comparisons.map((cmp) => {
            const r = cmp.ranking.find((x) => x.method === method);
            if (!r) return "—";
            const mark = r.rank === 1 ? " ✓" : "";
            return `${r.throughput_mb_s} MB/s${mark}`;
        });
        lines.push(`| \`${META[method]?.label || method}\` | ${cells.join(" | ")} |`);
    }
    lines.push("");
    lines.push("_✓ = gagnant sur cette taille_");
    lines.push("");

    // ── Verdict ─────────────────────────────────────────────────────────────────
    lines.push("## Verdict");
    lines.push("");

    const winner = summary.overall_winner;
    const winCount = summary.wins_by_method[winner] || 0;
    lines.push(`**${META[winner]?.label || winner}** est le plus rapide sur ${winCount}/${comparisons.length} taille(s).`);
    lines.push("");

    // Observations clés tirées des données réelles
    const smallCmp = comparisons.find((c) => c.size === "small");
    const medCmp = comparisons.find((c) => c.size === "medium");
    const largeCmp = comparisons.find((c) => c.size === "large");
    const xlargeCmp = comparisons.find((c) => c.size === "xlarge");

    // Observation 1 : readline toujours dernier ?
    const readlineAlwaysLast = comparisons.every(
        (c) => c.ranking[c.ranking.length - 1].method === "readlineInterface"
    );
    if (readlineAlwaysLast) {
        const worstRatio = Math.max(...comparisons.map((c) => c.spread_ratio));
        lines.push(
            `- **readline est systématiquement le plus lent** (${worstRatio}× vs le gagnant au pire cas). ` +
            `L'overhead vient du parsing de lignes en JS et de l'async iterator — à réserver aux cas où on a besoin de chaque ligne individuellement.`
        );
    }

    // Observation 2 : readFile vs buffer selon la taille
    if (smallCmp && medCmp) {
        const smallWinner = smallCmp.ranking[0].method;
        const medWinner = medCmp.ranking[0].method;
        if (smallWinner !== medWinner) {
            lines.push(
                `- **Le gagnant change avec la taille** : \`${META[smallWinner]?.label}\` ` +
                `domine sur les petits fichiers, \`${META[medWinner]?.label}\` prend la tête sur les fichiers plus lourds. ` +
                `L'overhead de setup d'un stream devient négligeable quand le volume augmente.`
            );
        }
    }

    // Observation 3 : spread entre méthodes
    const avgSpread = comparisons.reduce((s, c) => s + c.spread_ratio, 0) / comparisons.length;
    lines.push(
        `- **Écart moyen entre méthodes** : ${avgSpread.toFixed(1)}×. ` +
        `Le choix de l'API de lecture a un impact réel — pas juste théorique.`
    );

    // Observation 4 : readStream vs readFilePromise en mémoire
    lines.push(
        `- **Mémoire vs vitesse** : \`fs.promises.readFile\` charge tout le fichier en RAM — ` +
        `plus rapide sur les petits fichiers mais risqué sur les gros. ` +
        `\`createReadStream\` est ~${smallCmp ? Math.round((smallCmp.ranking.find(r => r.method === "readStream")?.ratio_vs_winner || 1) * 100 - 100) : "?"
        }% plus lent sur 256 KB mais consomme une mémoire constante quelle que soit la taille du fichier.`
    );
    lines.push("");
    lines.push("> **Recommandation pratique** : utilise `fs.promises.readFile` par défaut pour les fichiers < 1 MB, `createReadStream` au-delà, et `readline` uniquement si tu dois traiter ligne par ligne. Évite le buffer manuel sauf si tu optimises un hot path mesuré.");
    lines.push("");

    // ── Footer ───────────────────────────────────────────────────────────────────
    lines.push("---");
    lines.push("");
    lines.push(
        `_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · ` +
        `[Code source](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/file-io.js) · ` +
        `[JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history-fileio.json)_`
    );
    lines.push("");

    return lines.join("\n");
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

async function main() {
    const data = await readStdin();
    const history = loadHistory(historyFile);
    const updated = appendToHistory(structuredClone(history), data);
    const runNum = updated.runs.length;

    const markdown = generateMarkdown(data, history, runNum);

    fs.mkdirSync(outDir, { recursive: true });
    const slug = `file-io-${String(runNum).padStart(3, "0")}`;
    const outPath = path.join(outDir, `${slug}.md`);
    fs.writeFileSync(outPath, markdown);

    saveHistory(historyFile, updated);

    process.stderr.write(`[generate] Article écrit : ${outPath}\n`);
    process.stderr.write(`[generate] Historique mis à jour : ${historyFile} (${updated.runs.length} runs)\n`);
    process.stdout.write(outPath + "\n");
}

main().catch((err) => {
    process.stderr.write(`[generate] ERREUR : ${err.message}\n${err.stack}\n`);
    process.exit(1);
});