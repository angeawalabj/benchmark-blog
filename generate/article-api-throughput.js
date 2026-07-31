#!/usr/bin/env node
/**
 * Générateur d'article Markdown — benchmark api-throughput
 *
 * Usage :
 *   node benchmarks/api-throughput.js | node generate/article-api-throughput.js
 *   node benchmarks/api-throughput.js | node generate/article-api-throughput.js --out content/posts
 */

"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const outDir = argVal(args, "--out") || "content/posts";
const historyFile = argVal(args, "--history") || "data/history-api.json";

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

// ─── Lecture stdin ────────────────────────────────────────────────────────────

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

/** Barre ASCII proportionnelle — largeur fixe pour alignement colonne */
function reqBar(value, max, width = 28) {
    const filled = Math.max(1, Math.round((value / max) * width));
    return "█".repeat(filled) + "░".repeat(width - filled);
}

/** Emoji podium */
function medal(rank) {
    return rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
}

/** Tendance historique d'un framework sur un scénario */
function trend(history, scenarioId, framework) {
    const vals = history.runs
        .flatMap((r) => r.summary || [])
        .filter((s) => s.scenario_id === scenarioId)
        .map((s) => s.ranking?.find((r) => r.framework === framework)?.req_per_sec)
        .filter((v) => v != null)
        .slice(-2);
    if (vals.length < 2) return "";
    const delta = ((vals[1] - vals[0]) / vals[0]) * 100;
    if (delta > 5) return " ↗ +régression";
    if (delta < -5) return " ↘ amélioration";
    return " → stable";
}

/** Sparkline SVG inline */
function sparklineSvg(history, scenarioId, framework) {
    const points = history.runs
        .flatMap((r) => r.summary || [])
        .filter((s) => s.scenario_id === scenarioId)
        .map((s) => s.ranking?.find((r) => r.framework === framework)?.req_per_sec)
        .filter((v) => v != null)
        .slice(-16);

    if (points.length < 2) return "";

    const W = 200, H = 36, P = 4;
    const min = Math.min(...points), max = Math.max(...points);
    const range = max - min || 1;
    const xs = points.map((_, i) => P + i * ((W - P * 2) / (points.length - 1)));
    const ys = points.map((v) => P + ((max - v) / range) * (H - P * 2));
    const pts = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    const color = framework === "fastify" ? "#6366f1" : framework === "hono" ? "#10b981" : "#f59e0b";

    return [
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
        `  <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>`,
        `  <circle cx="${xs[xs.length - 1].toFixed(1)}" cy="${ys[ys.length - 1].toFixed(1)}" r="2.5" fill="${color}"/>`,
        `</svg>`,
    ].join("\n");
}

// ─── Génération Markdown ──────────────────────────────────────────────────────

function generateMarkdown(data, history, runNumber) {
    const { meta, results, comparisons, summary } = data;
    const date = new Date(meta.started_at).toLocaleDateString("fr-FR", {
        day: "numeric", month: "long", year: "numeric",
    });
    const fwVersions = meta.framework_versions || {};
    const frameworks = meta.config.frameworks;

    const lines = [];

    // ── Frontmatter ─────────────────────────────────────────────────────────────
    const slug = `api-throughput-${String(runNumber).padStart(3, "0")}`;
    lines.push("---");
    lines.push(`title: "Fastify vs Express vs Hono — Throughput HTTP #${runNumber}"`);
    lines.push(`description: "Benchmark req/s et latence p50/p99 sur ${meta.config.connections} connexions · ${meta.config.duration}s par scénario · 4 routes types"`);
    lines.push(`date: "${meta.started_at}"`);
    lines.push(`slug: "${slug}"`);
    lines.push(`benchmark: "api-throughput"`);
    lines.push(`run_number: ${runNumber}`);
    lines.push(`duration_ms: ${meta.duration_ms}`);
    lines.push(`frameworks: [${frameworks.map((f) => `"${f}"`).join(", ")}]`);
    lines.push(`tags: ["benchmark", "http", "nodejs", "fastify", "express", "hono", "performance"]`);
    lines.push(`generated: true`);
    lines.push("---");
    lines.push("");

    // ── Titre & meta ────────────────────────────────────────────────────────────
    lines.push(`# Fastify vs Express vs Hono — Throughput HTTP \\#${runNumber}`);
    lines.push("");
    lines.push(`> Article généré automatiquement · Run du ${date} · Durée totale : ${(meta.duration_ms / 1000).toFixed(0)}s · Node.js ${meta.environment.node}`);
    lines.push("");

    // ── Contexte ────────────────────────────────────────────────────────────────
    lines.push("## Contexte");
    lines.push("");
    lines.push(
        `Mesure du throughput et de la latence de trois frameworks HTTP Node.js sur **4 scénarios** représentatifs. ` +
        `Chaque framework tourne dans un **sous-processus isolé** pour éviter toute interférence de l'event loop. ` +
        `L'outil de charge est [autocannon](https://github.com/mcollina/autocannon).`
    );
    lines.push("");
    lines.push("| Paramètre | Valeur |");
    lines.push("|-----------|--------|");
    lines.push(`| Connexions concurrentes | ${meta.config.connections} |`);
    lines.push(`| Durée par scénario | ${meta.config.duration}s |`);
    lines.push(`| Warmup | ${meta.config.warmupSecs}s (ignoré) |`);
    lines.push(`| Pipelining | ${meta.config.pipelining} |`);
    lines.push(`| Environnement | ${meta.environment.runner} · ${meta.environment.platform}/${meta.environment.arch} |`);
    lines.push("");

    lines.push("**Versions :**");
    lines.push("");
    lines.push("| Framework | Version |");
    lines.push("|-----------|---------|");
    for (const [fw, ver] of Object.entries(fwVersions)) {
        lines.push(`| ${fw} | ${ver} |`);
    }
    lines.push("");

    // ── Résultats par scénario ───────────────────────────────────────────────────
    lines.push("## Résultats par scénario");
    lines.push("");

    for (const cmp of comparisons) {
        lines.push(`### ${cmp.label}`);
        lines.push("");

        // Récupère la description depuis results
        const desc = results.find((r) => r.scenario_id === cmp.scenario_id)?.description;
        if (desc) { lines.push(`_${desc}_`); lines.push(""); }

        // Classement + barres ASCII
        const maxReq = cmp.ranking[0].req_per_sec;
        lines.push("```");
        for (const r of cmp.ranking) {
            const bar = reqBar(r.req_per_sec, maxReq);
            const label = r.framework.padEnd(8);
            const rps = String(r.req_per_sec.toLocaleString()).padStart(8);
            const ratio = r.ratio_vs_winner < 1 ? ` (${r.ratio_vs_winner}× du gagnant)` : "";
            lines.push(`${medal(r.rank)} ${label} ${bar} ${rps} req/s${ratio}`);
        }
        lines.push("```");
        lines.push("");

        // Tableau latence détaillé
        lines.push("| Framework | req/s | p50 | p95 | p99 | Erreurs |");
        lines.push("|-----------|-------|-----|-----|-----|---------|");
        for (const r of cmp.ranking) {
            const res = results.find(
                (x) => x.scenario_id === cmp.scenario_id && x.framework === r.framework
            );
            if (!res) continue;
            const winner = r.rank === 1 ? " ✓" : "";
            lines.push(
                `| **${r.framework}**${winner} | ${r.req_per_sec.toLocaleString()} | ${res.p50} ms | ${res.p95} ms | ${res.p99} ms | ${res.errors} |`
            );
        }
        lines.push("");

        // Sparklines si historique
        const showSparklines = history.runs.length >= 2;
        if (showSparklines) {
            lines.push("**Tendance req/s (runs précédents) :**");
            lines.push("");
            for (const fw of frameworks) {
                const svg = sparklineSvg(history, cmp.scenario_id, fw);
                if (svg) {
                    const t = trend(history, cmp.scenario_id, fw);
                    lines.push(`_${fw}${t}_`);
                    lines.push("");
                    lines.push(svg);
                    lines.push("");
                }
            }
        }
    }

    // ── Tableau synthèse ────────────────────────────────────────────────────────
    lines.push("## Synthèse globale");
    lines.push("");
    lines.push("Gagnant par scénario :");
    lines.push("");
    lines.push("| Scénario | 🥇 Gagnant | req/s | p99 |");
    lines.push("|----------|-----------|-------|-----|");
    for (const cmp of comparisons) {
        const w = cmp.ranking[0];
        const res = results.find((r) => r.scenario_id === cmp.scenario_id && r.framework === w.framework);
        lines.push(`| ${cmp.label} | **${w.framework}** | ${w.req_per_sec.toLocaleString()} | ${res?.p99 ?? "—"} ms |`);
    }
    lines.push("");

    // ── Verdict ─────────────────────────────────────────────────────────────────
    lines.push("## Verdict");
    lines.push("");

    // Compte les victoires par framework
    const wins = {};
    for (const cmp of comparisons) {
        const w = cmp.ranking[0].framework;
        wins[w] = (wins[w] || 0) + 1;
    }
    const overallWinner = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];

    lines.push(`**${overallWinner[0]}** remporte ${overallWinner[1]}/${comparisons.length} scénarios.`);
    lines.push("");

    // Ratio Express vs les autres
    const pingCmp = comparisons.find((c) => c.scenario_id === "ping");
    const expressR = pingCmp?.ranking.find((r) => r.framework === "express");
    const fastifyR = pingCmp?.ranking.find((r) => r.framework === "fastify");
    const honoR = pingCmp?.ranking.find((r) => r.framework === "hono");

    if (fastifyR && expressR) {
        const ratio = (fastifyR.req_per_sec / expressR.req_per_sec).toFixed(1);
        lines.push(`- **Fastify vs Express** : ${ratio}× plus de req/s sur /ping. L'écart vient principalement du router et du parser HTTP de Fastify, optimisés à bas niveau.`);
    }
    if (honoR && expressR) {
        const ratio = (honoR.req_per_sec / expressR.req_per_sec).toFixed(1);
        lines.push(`- **Hono vs Express** : ${ratio}× plus de req/s. Hono est conçu pour les environnements edge (Web Standards API), mais reste très compétitif en Node.js.`);
    }
    if (fastifyR && honoR) {
        const diff = Math.abs(fastifyR.req_per_sec - honoR.req_per_sec);
        const pct = ((diff / fastifyR.req_per_sec) * 100).toFixed(0);
        lines.push(`- **Fastify vs Hono** : écart de ~${pct}% — négligeable en production réelle. Le choix entre les deux dépend de l'écosystème (plugins Fastify vs portabilité edge Hono).`);
    }
    lines.push("");
    lines.push("> **Note méthodologique** : les benchmarks mesurent le framework pur sans middleware métier (auth, validation, ORM). En production, l'écart se réduit quand le temps CPU est dominé par la logique applicative.");
    lines.push("");

    // ── Footer ───────────────────────────────────────────────────────────────────
    lines.push("---");
    lines.push("");
    lines.push(
        `_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · ` +
        `[Code source](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/api-throughput.js) · ` +
        `[JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history-api.json)_`
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
    const slug = `api-throughput-${String(runNum).padStart(3, "0")}`;
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