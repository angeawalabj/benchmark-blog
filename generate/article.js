#!/usr/bin/env node
/**
 * Générateur d'article Markdown depuis un JSON de benchmark
 *
 * Usage :
 *   node benchmarks/db-latency.js | node generate/article.js
 *   node benchmarks/db-latency.js | node generate/article.js --out content/posts/
 *
 * Produit :
 *   - Un fichier .md avec frontmatter YAML (compatible Astro / Eleventy / Hugo)
 *   - Un SVG sparkline inline par scénario
 *   - Une section "verdict" auto-générée
 *   - Met à jour data/history.json
 */

"use strict";

const fs = require("fs");
const path = require("path");

// ─── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const outDir = argVal(args, "--out") || "content/posts";
const historyFile = argVal(args, "--history") || "data/history.json";

function argVal(args, flag) {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : null;
}

// ─── Lecture stdin ────────────────────────────────────────────────────────────

async function readStdin() {
    return new Promise((resolve, reject) => {
        let data = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => (data += chunk));
        process.stdin.on("end", () => {
            try { resolve(JSON.parse(data)); }
            catch (e) { reject(new Error("JSON invalide sur stdin : " + e.message)); }
        });
        process.stdin.on("error", reject);
    });
}

// ─── Historique ───────────────────────────────────────────────────────────────

function loadHistory(file) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
        return { runs: [] };
    }
}

function saveHistory(file, history) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(history, null, 2) + "\n");
}

function appendToHistory(history, benchData) {
    history.runs.push({
        run_id: history.runs.length + 1,
        started_at: benchData.meta.started_at,
        duration_ms: benchData.meta.duration_ms,
        config: benchData.meta.config,
        summary: benchData.summary,
    });
    // Garde les 52 derniers runs (1 an si hebdo)
    if (history.runs.length > 52) history.runs = history.runs.slice(-52);
    return history;
}

// ─── Rendu visuel ─────────────────────────────────────────────────────────────

/** Barre de progression ASCII proportionnelle */
function bar(value, max, width = 24) {
    const filled = Math.round((value / max) * width);
    return "█".repeat(filled) + "░".repeat(width - filled);
}

/** Sparkline SVG inline des p50 historiques pour un scénario */
function sparklineSvg(history, scenarioId, engine) {
    const points = history.runs
        .map((r) => r.summary?.find((s) => s.scenario_id === scenarioId))
        .filter(Boolean)
        .map((s) => (engine === "sqlite" ? s.sqlite_p50_ms : s.postgres_p50_ms))
        .filter((v) => v !== null && v !== undefined)
        .slice(-20); // 20 derniers points max

    if (points.length < 2) return "";

    const W = 200, H = 40, PAD = 4;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const xStep = (W - PAD * 2) / (points.length - 1);

    const coords = points.map((v, i) => {
        const x = PAD + i * xStep;
        const y = PAD + ((max - v) / range) * (H - PAD * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
        `  <polyline points="${coords.join(" ")}" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>`,
        `  <circle cx="${coords[coords.length - 1].split(",")[0]}" cy="${coords[coords.length - 1].split(",")[1]}" r="2.5" fill="#6366f1"/>`,
        `</svg>`,
    ].join("\n");
}

/** Emoji tendance basée sur l'évolution des deux derniers runs */
function trendEmoji(history, scenarioId, engine) {
    const vals = history.runs
        .map((r) => r.summary?.find((s) => s.scenario_id === scenarioId))
        .filter(Boolean)
        .map((s) => (engine === "sqlite" ? s.sqlite_p50_ms : s.postgres_p50_ms))
        .filter((v) => v !== null && v !== undefined)
        .slice(-2);

    if (vals.length < 2) return "";
    const delta = ((vals[1] - vals[0]) / vals[0]) * 100;
    if (delta < -5) return " ↘ amélioration";
    if (delta > 5) return " ↗ régression";
    return " → stable";
}

// ─── Génération Markdown ──────────────────────────────────────────────────────

function engineLabel(engine) {
    return engine === "sqlite" ? "SQLite" : "PostgreSQL";
}

function formatMs(v) {
    if (v === null || v === undefined) return "—";
    return v < 1 ? `${v} ms _(< 1 ms)_` : `${v} ms`;
}

function generateMarkdown(data, history, runNumber) {
    const { meta, results, comparisons, summary } = data;
    const date = new Date(meta.started_at).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
    });

    // Groupe les résultats par scénario
    const byScenario = {};
    for (const r of results) {
        if (!byScenario[r.scenario_id]) byScenario[r.scenario_id] = {};
        byScenario[r.scenario_id][r.engine] = r;
    }

    const engines = [...new Set(results.map((r) => r.engine))];
    const hasComparison = comparisons.length > 0;

    // ── Frontmatter ────────────────────────────────────────────────────────────
    const slug = `db-latency-${String(runNumber).padStart(3, "0")}`;
    const lines = [
        "---",
        `title: "SQLite vs PostgreSQL — Benchmark de latence #${runNumber}"`,
        `description: "p50/p95/p99 de lecture sur ${meta.config.rows.toLocaleString()} lignes, ${meta.config.runs} runs, environnement ${meta.environment.runner}"`,
        `date: "${meta.started_at}"`,
        `slug: "${slug}"`,
        `benchmark: "db-latency"`,
        `run_number: ${runNumber}`,
        `duration_ms: ${meta.duration_ms}`,
        `engines: [${engines.map((e) => `"${e}"`).join(", ")}]`,
        `tags: ["benchmark", "database", "sqlite", "postgresql", "performance"]`,
        `generated: true`,
        "---",
        "",
    ];

    // ── En-tête ────────────────────────────────────────────────────────────────
    lines.push(`# SQLite vs PostgreSQL — Benchmark de latence \\#${runNumber}`);
    lines.push("");
    lines.push(
        `> Article généré automatiquement · Run du ${date} · Durée : ${(meta.duration_ms / 1000).toFixed(1)}s · Node.js ${meta.environment.node}`
    );
    lines.push("");

    // ── Contexte ───────────────────────────────────────────────────────────────
    lines.push("## Contexte");
    lines.push("");
    lines.push(
        `Benchmark de latence de lecture sur une table de **${meta.config.rows.toLocaleString()} lignes** ` +
        `avec **${meta.config.userSample.toLocaleString()} user\_id distincts**. ` +
        `Chaque mesure est la médiane de **${meta.config.runs} runs consécutifs** ` +
        `après ${meta.config.warmup} runs d'échauffement ignorés.`
    );
    lines.push("");
    lines.push("| Paramètre | Valeur |");
    lines.push("|-----------|--------|");
    lines.push(`| Lignes dans la table | ${meta.config.rows.toLocaleString()} |`);
    lines.push(`| user_id distincts | ${meta.config.userSample.toLocaleString()} |`);
    lines.push(`| Runs mesurés | ${meta.config.runs} |`);
    lines.push(`| Warmup ignoré | ${meta.config.warmup} runs |`);
    lines.push(`| LIMIT (SELECT) | ${meta.config.limitClause} |`);
    lines.push(`| Environnement | ${meta.environment.runner} · ${meta.environment.platform}/${meta.environment.arch} |`);
    lines.push("");

    // ── Résultats par scénario ─────────────────────────────────────────────────
    lines.push("## Résultats");
    lines.push("");

    for (const [scenarioId, engineResults] of Object.entries(byScenario)) {
        const first = Object.values(engineResults)[0];
        lines.push(`### ${first.label}`);
        lines.push("");
        lines.push(`_${first.description}_`);
        lines.push("");

        // Tableau des percentiles
        lines.push("| Moteur | p50 | p75 | p95 | p99 | min | max |");
        lines.push("|--------|-----|-----|-----|-----|-----|-----|");

        const maxP99 = Math.max(...Object.values(engineResults).map((r) => r.p99));

        for (const [engine, r] of Object.entries(engineResults)) {
            lines.push(
                `| **${engineLabel(engine)}** ${r.engine_version ? `_(${r.engine_version})_` : ""} ` +
                `| ${r.p50} ms | ${r.p75} ms | ${r.p95} ms | ${r.p99} ms ` +
                `| ${r.min} ms | ${r.max} ms |`
            );
        }
        lines.push("");

        // Visualisation barre ASCII
        lines.push("**Distribution p99 (relative) :**");
        lines.push("");
        lines.push("```");
        for (const [engine, r] of Object.entries(engineResults)) {
            const b = bar(r.p99, maxP99);
            lines.push(`${engineLabel(engine).padEnd(12)} ${b} ${r.p99} ms`);
        }
        lines.push("```");
        lines.push("");

        // Sparkline SVG si historique disponible
        for (const engine of engines) {
            const svg = sparklineSvg(history, scenarioId, engine);
            if (svg) {
                const trend = trendEmoji(history, scenarioId, engine);
                lines.push(`**Tendance ${engineLabel(engine)} p50${trend} :**`);
                lines.push("");
                lines.push(svg);
                lines.push("");
            }
        }
    }

    // ── Comparaison cross-engine ───────────────────────────────────────────────
    if (hasComparison) {
        lines.push("## Comparaison directe");
        lines.push("");
        lines.push("| Scénario | Moteur le plus rapide | Ratio p50 PG/SQLite | Ratio p95 |");
        lines.push("|----------|-----------------------|---------------------|-----------|");
        for (const c of comparisons) {
            const label = summary.find((s) => s.scenario_id === c.scenario_id)?.label || c.scenario_id;
            lines.push(
                `| ${label} | **${engineLabel(c.faster_engine)}** ` +
                `| ${c.p50_ratio}× | ${c.p95_ratio}× |`
            );
        }
        lines.push("");
    }

    // ── Résumé rapide ─────────────────────────────────────────────────────────
    lines.push("## Résumé");
    lines.push("");
    lines.push("| Scénario | SQLite p50 | PostgreSQL p50 | Gagnant |");
    lines.push("|----------|------------|----------------|---------|");
    for (const s of summary) {
        lines.push(
            `| ${s.label} ` +
            `| ${s.sqlite_p50_ms !== null ? s.sqlite_p50_ms + " ms" : "—"} ` +
            `| ${s.postgres_p50_ms !== null ? s.postgres_p50_ms + " ms" : "—"} ` +
            `| **${engineLabel(s.winner)}** |`
        );
    }
    lines.push("");

    // ── Verdict auto-généré ────────────────────────────────────────────────────
    lines.push("## Verdict");
    lines.push("");

    const pkSummary = summary.find((s) => s.scenario_id === "point_lookup");
    const idxSummary = summary.find((s) => s.scenario_id === "indexed_user_lookup");
    const scanSummary = summary.find((s) => s.scenario_id === "full_table_scan");

    if (pkSummary) {
        lines.push(
            `- **PK lookup** : SQLite répond en ${pkSummary.sqlite_p50_ms ?? "??"} ms p50. ` +
            (pkSummary.postgres_p50_ms
                ? `PostgreSQL en ${pkSummary.postgres_p50_ms} ms — ` +
                (pkSummary.winner === "sqlite" ? "SQLite gagne en local." : "PostgreSQL gagne malgré le réseau.")
                : "PostgreSQL non testé dans ce run.")
        );
    }
    if (idxSummary) {
        lines.push(
            `- **Index lookup** : ${pkSummary?.sqlite_p50_ms && idxSummary?.sqlite_p50_ms
                ? `coût de la clause ORDER BY : +${((idxSummary.sqlite_p50_ms / pkSummary.sqlite_p50_ms) - 1).toFixed(0)}× vs PK pur.`
                : `p50 = ${idxSummary.sqlite_p50_ms ?? "??"} ms.`}`
        );
    }
    if (scanSummary) {
        lines.push(
            `- **Full scan** : ${scanSummary.sqlite_p50_ms ?? "??"} ms p50 — ` +
            `${pkSummary?.sqlite_p50_ms
                ? `soit ${Math.round(scanSummary.sqlite_p50_ms / pkSummary.sqlite_p50_ms)}× plus lent qu'un PK lookup. L'index change tout.`
                : "lourd sans index."}`
        );
    }
    lines.push("");

    // ── Footer ─────────────────────────────────────────────────────────────────
    lines.push("---");
    lines.push("");
    lines.push(
        `_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · ` +
        `[Code source du benchmark](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/db-latency.js) · ` +
        `[JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history.json)_`
    );
    lines.push("");

    return lines.join("\n");
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

async function main() {
    const data = await readStdin();

    // Historique
    const history = loadHistory(historyFile);
    const updatedHistory = appendToHistory(structuredClone(history), data);
    const runNumber = updatedHistory.runs.length;

    // Génération Markdown
    const markdown = generateMarkdown(data, history, runNumber);

    // Écriture fichier
    fs.mkdirSync(outDir, { recursive: true });
    const slug = `db-latency-${String(runNumber).padStart(3, "0")}`;
    const outPath = path.join(outDir, `${slug}.md`);
    fs.writeFileSync(outPath, markdown);

    // Sauvegarde historique après génération
    saveHistory(historyFile, updatedHistory);

    process.stderr.write(`[generate] Article écrit : ${outPath}\n`);
    process.stderr.write(`[generate] Historique mis à jour : ${historyFile} (${updatedHistory.runs.length} runs)\n`);

    // Stdout : chemin du fichier généré (utile pour les scripts CI)
    process.stdout.write(outPath + "\n");
}

main().catch((err) => {
    process.stderr.write(`[generate] ERREUR : ${err.message}\n`);
    process.stderr.write(err.stack + "\n");
    process.exit(1);
});