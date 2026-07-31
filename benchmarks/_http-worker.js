#!/usr/bin/env node
/**
 * Worker HTTP — lancé en sous-processus par api-throughput.js
 *
 * Usage (interne, ne pas appeler directement) :
 *   node benchmarks/_http-worker.js --framework fastify --port 3100
 *   node benchmarks/_http-worker.js --framework express --port 3101
 *   node benchmarks/_http-worker.js --framework hono    --port 3102
 *
 * Le worker démarre le serveur, envoie "READY\n" sur stdout,
 * puis attend SIGTERM pour s'arrêter proprement.
 *
 * Routes exposées (identiques sur chaque framework) :
 *   GET /ping          → { ok: true }                (latence pure, zéro travail)
 *   GET /json          → objet JSON ~500 bytes        (sérialisation)
 *   GET /cpu           → calcul fibonacci(28)         (CPU-bound)
 *   GET /echo?msg=...  → { msg, ts }                 (parsing query string)
 */

"use strict";

const { performance } = require("perf_hooks");

// ─── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const framework = argVal(args, "--framework") || "fastify";
const port = Number(argVal(args, "--port")) || 3100;

function argVal(arr, flag) {
    const i = arr.indexOf(flag);
    return i !== -1 ? arr[i + 1] : null;
}

// ─── Payload JSON réaliste (~500 bytes) ──────────────────────────────────────

function buildJsonPayload() {
    return {
        id: "usr_a1b2c3d4e5f6",
        name: "Alice Benchmark",
        email: "alice@example.com",
        role: "admin",
        createdAt: "2025-01-15T08:30:00.000Z",
        metadata: {
            plan: "pro",
            seats: 12,
            region: "eu-west-1",
            tags: ["backend", "node", "performance"],
            lastLogin: "2026-06-27T22:00:00.000Z",
        },
        preferences: {
            theme: "dark",
            language: "fr",
            timezone: "Africa/Porto-Novo",
            notifications: { email: true, sms: false, push: true },
        },
    };
}

// ─── CPU-bound : fibonacci itératif ──────────────────────────────────────────

function fibonacci(n) {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
    return b;
}

// ─── Serveurs ─────────────────────────────────────────────────────────────────

async function startFastify() {
    const fastify = require("fastify")({ logger: false });

    fastify.get("/ping", async () => ({ ok: true }));
    fastify.get("/json", async () => buildJsonPayload());
    fastify.get("/cpu", async () => ({ result: fibonacci(28), n: 28 }));
    fastify.get("/echo", async (req) => ({ msg: req.query.msg ?? "", ts: Date.now() }));

    await fastify.listen({ port, host: "127.0.0.1" });
    return () => fastify.close();
}

async function startExpress() {
    const express = require("express");
    const app = express();

    app.use(express.json());
    app.get("/ping", (_req, res) => res.json({ ok: true }));
    app.get("/json", (_req, res) => res.json(buildJsonPayload()));
    app.get("/cpu", (_req, res) => res.json({ result: fibonacci(28), n: 28 }));
    app.get("/echo", (req, res) => res.json({ msg: req.query.msg ?? "", ts: Date.now() }));

    return new Promise((resolve) => {
        const server = app.listen(port, "127.0.0.1", () => resolve(
            () => new Promise((res) => server.close(res))
        ));
    });
}

async function startHono() {
    const { Hono } = require("hono");
    const { serve } = require("@hono/node-server");

    const app = new Hono();

    app.get("/ping", (c) => c.json({ ok: true }));
    app.get("/json", (c) => c.json(buildJsonPayload()));
    app.get("/cpu", (c) => c.json({ result: fibonacci(28), n: 28 }));
    app.get("/echo", (c) => c.json({ msg: c.req.query("msg") ?? "", ts: Date.now() }));

    return new Promise((resolve) => {
        const server = serve({ fetch: app.fetch, port, hostname: "127.0.0.1" }, () => {
            resolve(() => new Promise((res) => server.close(res)));
        });
    });
}

// ─── Point d'entrée ──────────────────────────────────────────────────────────

async function main() {
    const starters = { fastify: startFastify, express: startExpress, hono: startHono };
    const start = starters[framework];

    if (!start) {
        process.stderr.write(`[worker] Framework inconnu : ${framework}\n`);
        process.exit(1);
    }

    process.stderr.write(`[worker:${framework}] Démarrage sur port ${port}…\n`);
    const stop = await start();

    // Signal au parent que le serveur est prêt
    process.stdout.write("READY\n");
    process.stderr.write(`[worker:${framework}] Prêt sur http://127.0.0.1:${port}\n`);

    // Arrêt propre sur SIGTERM
    process.on("SIGTERM", async () => {
        process.stderr.write(`[worker:${framework}] Arrêt…\n`);
        await stop();
        process.exit(0);
    });
}

main().catch((err) => {
    process.stderr.write(`[worker] ERREUR : ${err.message}\n${err.stack}\n`);
    process.exit(1);
});