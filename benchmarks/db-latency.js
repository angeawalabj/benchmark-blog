#!/usr/bin/env node
/**
 * Benchmark : latence de lecture SQLite vs PostgreSQL
 *
 * Usage :
 *   node benchmarks/db-latency.js                        # SQLite only (pas de PG requis)
 *   PG_URL=postgres://user:pass@localhost/db node ...     # SQLite + PostgreSQL
 *   node benchmarks/db-latency.js --runs 100 --rows 500000
 *
 * Output : JSON structuré sur stdout, logs sur stderr
 * Compatible : Node.js 18+, CI sans PG (skip automatique si PG_URL absent)
 */

"use strict";

const { performance } = require("perf_hooks");

// ─── Configuration ──────────────────────────────────────────────────────────

const CONFIG = parseArgs({
    runs: 50,          // nombre de runs par requête pour la médiane
    warmup: 5,         // runs d'échauffement ignorés dans les stats
    rows: 100_000,     // taille de la table de test
    userSample: 1_000, // nombre d'user_id distincts dans les données
    limitClause: 100,  // LIMIT de la requête SELECT
});

// ─── Utilitaires statistiques ────────────────────────────────────────────────

function percentile(sortedArr, p) {
    const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
    return sortedArr[Math.max(0, idx)];
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

function round(ms) {
    return Math.round(ms * 100) / 100;
}

function log(msg) {
    process.stderr.write(`[benchmark] ${msg}\n`);
}

function parseArgs(defaults) {
    const args = process.argv.slice(2);
    const cfg = { ...defaults };
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i].replace(/^--/, "");
        if (key in cfg) cfg[key] = Number(args[i + 1]);
    }
    return cfg;
}

// ─── Génération de données de test ──────────────────────────────────────────

function generateRows(count, userSample) {
    const rows = [];
    const topics = ["auth", "payment", "search", "view", "click", "error"];
    for (let i = 0; i < count; i++) {
        rows.push({
            id: i + 1,
            user_id: Math.floor(Math.random() * userSample) + 1,
            event_type: topics[i % topics.length],
            payload: JSON.stringify({ value: Math.random() * 1000, seq: i }),
            created_at: Date.now() - Math.floor(Math.random() * 86_400_000 * 30),
        });
    }
    return rows;
}

// ─── Requêtes testées ────────────────────────────────────────────────────────
// Chaque scénario représente un pattern réel d'accès aux données

const SCENARIOS = [
    {
        id: "indexed_user_lookup",
        label: "Lecture par user_id (index)",
        description: `SELECT avec filtre sur colonne indexée, ORDER BY, LIMIT ${CONFIG.limitClause}`,
        sqliteSql: `SELECT id, user_id, event_type, payload, created_at
                FROM events
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT ${CONFIG.limitClause}`,
        pgSql: `SELECT id, user_id, event_type, payload, created_at
            FROM events
            WHERE user_id = $1
            ORDER BY created_at DESC
            LIMIT ${CONFIG.limitClause}`,
        paramFn: (userSample) => [Math.floor(Math.random() * userSample) + 1],
    },
    {
        id: "full_table_scan",
        label: "Scan complet sans index",
        description: "SELECT sans WHERE sur colonne non indexée (worst-case)",
        sqliteSql: `SELECT COUNT(*) as cnt, event_type
                FROM events
                GROUP BY event_type`,
        pgSql: `SELECT COUNT(*) as cnt, event_type
            FROM events
            GROUP BY event_type`,
        paramFn: () => [],
    },
    {
        id: "point_lookup",
        label: "Lecture par clé primaire",
        description: "SELECT par id (PK lookup, cache-friendly)",
        sqliteSql: `SELECT * FROM events WHERE id = ?`,
        pgSql: `SELECT * FROM events WHERE id = $1`,
        paramFn: (_, rowCount) => [Math.floor(Math.random() * rowCount) + 1],
    },
];

// ─── Driver SQLite (sql.js — WebAssembly, zéro dépendance native) ────────────

async function runSQLiteBenchmarks() {
    log("Initialisation SQLite (sql.js WebAssembly)…");
    const initSqlJs = require("sql.js");
    const SQL = await initSqlJs();
    const db = new SQL.Database();

    // Schéma
    db.run(`
    CREATE TABLE events (
      id         INTEGER PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      event_type TEXT    NOT NULL,
      payload    TEXT,
      created_at INTEGER NOT NULL
    )
  `);
    db.run("CREATE INDEX idx_events_user_id    ON events (user_id)");
    db.run("CREATE INDEX idx_events_created_at ON events (created_at)");

    // Insertion en batch (sqlite.js n'a pas de bulk insert natif, on insère par blocs)
    log(`Insertion de ${CONFIG.rows.toLocaleString()} lignes dans SQLite…`);
    const rows = generateRows(CONFIG.rows, CONFIG.userSample);
    const CHUNK = 5_000;
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        db.run("BEGIN");
        const stmt = db.prepare(
            "INSERT INTO events (id, user_id, event_type, payload, created_at) VALUES (?,?,?,?,?)"
        );
        for (const r of chunk) {
            stmt.run([r.id, r.user_id, r.event_type, r.payload, r.created_at]);
        }
        stmt.free();
        db.run("COMMIT");
    }
    log("SQLite prêt.");

    const results = [];

    for (const scenario of SCENARIOS) {
        log(`  SQLite — ${scenario.label} (${CONFIG.warmup} warmup + ${CONFIG.runs} runs)…`);
        const stmt = db.prepare(scenario.sqliteSql);
        const timings = [];

        const totalRuns = CONFIG.warmup + CONFIG.runs;
        for (let i = 0; i < totalRuns; i++) {
            const params = scenario.paramFn(CONFIG.userSample, CONFIG.rows);
            const t0 = performance.now();
            stmt.bind(params);
            // Consomme tous les résultats (comme le ferait un vrai client)
            while (stmt.step()) { }
            stmt.reset();
            const elapsed = performance.now() - t0;
            if (i >= CONFIG.warmup) timings.push(elapsed);
        }
        stmt.free();

        results.push({
            scenario_id: scenario.id,
            label: scenario.label,
            description: scenario.description,
            engine: "sqlite",
            engine_version: "sql.js (WebAssembly)",
            ...stats(timings),
        });
    }

    db.close();
    return results;
}

// ─── Driver PostgreSQL ───────────────────────────────────────────────────────

async function runPostgresBenchmarks() {
    const pgUrl = process.env.PG_URL;
    if (!pgUrl) {
        log("PG_URL absent — skip PostgreSQL (export PG_URL=postgres://... pour l'activer)");
        return null;
    }

    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: pgUrl, max: 1 });

    try {
        await pool.query("SELECT 1"); // test connexion
    } catch (e) {
        log(`PostgreSQL inaccessible (${e.message}) — skip`);
        await pool.end();
        return null;
    }

    log("Initialisation PostgreSQL…");

    // Nettoyage + création
    await pool.query("DROP TABLE IF EXISTS bench_events");
    await pool.query(`
    CREATE TABLE bench_events (
      id         SERIAL PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      event_type TEXT    NOT NULL,
      payload    TEXT,
      created_at BIGINT  NOT NULL
    )
  `);

    // Insertion rapide via COPY simulé avec multi-VALUES
    log(`Insertion de ${CONFIG.rows.toLocaleString()} lignes dans PostgreSQL…`);
    const rows = generateRows(CONFIG.rows, CONFIG.userSample);
    const CHUNK = 1_000;
    for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const values = chunk
            .map(
                (r, j) =>
                    `($${j * 4 + 1}, $${j * 4 + 2}, $${j * 4 + 3}, $${j * 4 + 4})`
            )
            .join(", ");
        const flat = chunk.flatMap((r) => [
            r.user_id,
            r.event_type,
            r.payload,
            r.created_at,
        ]);
        await pool.query(
            `INSERT INTO bench_events (user_id, event_type, payload, created_at) VALUES ${values}`,
            flat
        );
    }

    await pool.query(
        "CREATE INDEX idx_bench_user_id    ON bench_events (user_id)"
    );
    await pool.query(
        "CREATE INDEX idx_bench_created_at ON bench_events (created_at)"
    );

    // ANALYZE pour que le planner ait des stats à jour
    await pool.query("ANALYZE bench_events");
    log("PostgreSQL prêt.");

    const results = [];

    for (const scenario of SCENARIOS) {
        log(`  PostgreSQL — ${scenario.label} (${CONFIG.warmup} warmup + ${CONFIG.runs} runs)…`);
        const timings = [];

        // Remplace les ? SQLite par $N pour PG
        const pgSql = scenario.pgSql;
        const totalRuns = CONFIG.warmup + CONFIG.runs;

        for (let i = 0; i < totalRuns; i++) {
            const params = scenario.paramFn(CONFIG.userSample, CONFIG.rows);
            const t0 = performance.now();
            await pool.query(pgSql, params);
            const elapsed = performance.now() - t0;
            if (i >= CONFIG.warmup) timings.push(elapsed);
        }

        results.push({
            scenario_id: scenario.id,
            label: scenario.label,
            description: scenario.description,
            engine: "postgresql",
            engine_version: await getPostgresVersion(pool),
            ...stats(timings),
        });
    }

    await pool.query("DROP TABLE IF EXISTS bench_events");
    await pool.end();
    return results;
}

async function getPostgresVersion(pool) {
    const { rows } = await pool.query("SELECT version()");
    const match = rows[0].version.match(/PostgreSQL ([\d.]+)/);
    return match ? `PostgreSQL ${match[1]}` : "PostgreSQL";
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

async function main() {
    const startedAt = new Date().toISOString();
    const t0 = performance.now();

    log("=== Benchmark DB latency démarré ===");
    log(`Config : ${JSON.stringify(CONFIG)}`);

    const [sqliteResults, pgResults] = await Promise.all([
        runSQLiteBenchmarks(),
        runPostgresBenchmarks(),
    ]);

    const duration_ms = Math.round(performance.now() - t0);
    log(`=== Terminé en ${(duration_ms / 1000).toFixed(1)}s ===`);

    // Comparaisons cross-engine (uniquement si les deux ont tourné)
    const comparisons = [];
    if (pgResults) {
        for (const s of SCENARIOS) {
            const sq = sqliteResults.find((r) => r.scenario_id === s.id);
            const pg = pgResults.find((r) => r.scenario_id === s.id);
            if (sq && pg) {
                comparisons.push({
                    scenario_id: s.id,
                    faster_engine: sq.p50 <= pg.p50 ? "sqlite" : "postgresql",
                    p50_ratio: round(pg.p50 / sq.p50), // ratio PG/SQLite (>1 = SQLite plus rapide)
                    p95_ratio: round(pg.p95 / sq.p95),
                });
            }
        }
    }

    // Sortie JSON structurée sur stdout
    const output = {
        meta: {
            benchmark: "db-latency",
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
        },
        results: [
            ...sqliteResults,
            ...(pgResults || []),
        ],
        comparisons,
        // Résumé rapide pour le générateur d'articles
        summary: buildSummary(sqliteResults, pgResults),
    };

    process.stdout.write(JSON.stringify(output, null, 2) + "\n");
}

function buildSummary(sqliteResults, pgResults) {
    const best = (results, scenario_id) =>
        results?.find((r) => r.scenario_id === scenario_id);

    return SCENARIOS.map((s) => {
        const sq = best(sqliteResults, s.id);
        const pg = best(pgResults, s.id);
        return {
            scenario_id: s.id,
            label: s.label,
            sqlite_p50_ms: sq?.p50 ?? null,
            postgres_p50_ms: pg?.p50 ?? null,
            winner:
                sq && pg
                    ? sq.p50 <= pg.p50
                        ? "sqlite"
                        : "postgresql"
                    : sq
                        ? "sqlite"
                        : "postgresql",
        };
    });
}

main().catch((err) => {
    process.stderr.write(`[benchmark] ERREUR FATALE : ${err.message}\n`);
    process.stderr.write(err.stack + "\n");
    process.exit(1);
});