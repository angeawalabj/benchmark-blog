/**
 * Worker thread — file-io benchmark
 *
 * Reçoit via workerData :
 *   { method, filePath, chunkSize, lineCount }
 *
 * Retourne via parentPort.postMessage :
 *   { ok: true, bytesRead, linesRead, elapsed_ms }
 *   { ok: false, error }
 *
 * Les workers sont isolés : chaque méthode a son propre heap,
 * son propre GC et son propre cache OS (on flush entre les runs).
 */

"use strict";

const { workerData, parentPort } = require("worker_threads");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const readline = require("readline");
const { pipeline } = require("stream/promises");
const { performance } = require("perf_hooks");

const { method, filePath, chunkSize } = workerData;

// ─── Implémentations ─────────────────────────────────────────────────────────

/**
 * 1. fs.readFile — lecture complète en mémoire (callback API)
 *    Pattern le plus simple, charge tout en RAM d'un coup.
 */
async function readFileCallback() {
    const t0 = performance.now();
    const buf = await new Promise((resolve, reject) =>
        fs.readFile(filePath, (err, data) => (err ? reject(err) : resolve(data)))
    );
    return { bytesRead: buf.length, linesRead: countNewlines(buf) };
}

/**
 * 2. fs.promises.readFile — même chose mais API Promises native
 *    Légèrement différent en interne (pas de callback wrapping).
 */
async function readFilePromise() {
    const buf = await fsp.readFile(filePath);
    return { bytesRead: buf.length, linesRead: countNewlines(buf) };
}

/**
 * 3. fs.createReadStream — lecture par chunks (streaming)
 *    Mémoire constante indépendante de la taille du fichier.
 *    Idéal pour les gros fichiers ou quand le traitement est pipeline.
 */
async function readStream() {
    let bytesRead = 0;
    let linesRead = 0;
    const stream = fs.createReadStream(filePath, {
        highWaterMark: chunkSize,
    });
    await new Promise((resolve, reject) => {
        stream.on("data", (chunk) => {
            bytesRead += chunk.length;
            linesRead += countNewlines(chunk);
        });
        stream.on("end", resolve);
        stream.on("error", reject);
    });
    return { bytesRead, linesRead };
}

/**
 * 4. readline — lecture ligne par ligne
 *    Pattern courant pour le traitement de CSV, logs, NDJSON.
 *    Overhead de parsing de lignes mais mémoire minimale.
 */
async function readlineInterface() {
    let bytesRead = 0;
    let linesRead = 0;
    const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity,
    });
    for await (const line of rl) {
        bytesRead += Buffer.byteLength(line) + 1; // +1 pour \n
        linesRead += 1;
    }
    return { bytesRead, linesRead };
}

/**
 * 5. fs.read() manuel avec buffer fixe — lecture low-level
 *    Contrôle total sur la taille du buffer et la position.
 *    Utile quand on parse un format binaire custom.
 */
async function readManualBuffer() {
    const fd = await fsp.open(filePath, "r");
    const buf = Buffer.allocUnsafe(chunkSize);
    let bytesRead = 0;
    let linesRead = 0;
    try {
        while (true) {
            const { bytesRead: n } = await fd.read(buf, 0, chunkSize, null);
            if (n === 0) break;
            bytesRead += n;
            linesRead += countNewlines(buf.subarray(0, n));
        }
    } finally {
        await fd.close();
    }
    return { bytesRead, linesRead };
}

/**
 * 6. pipeline() streams — composition de streams typée
 *    Gestion propre des backpressure et des erreurs.
 *    Pattern recommandé pour les chaînes de transformation.
 */
async function readPipeline() {
    let bytesRead = 0;
    let linesRead = 0;
    const { Transform } = require("stream");

    const counter = new Transform({
        transform(chunk, _enc, cb) {
            bytesRead += chunk.length;
            linesRead += countNewlines(chunk);
            cb(null, chunk);
        },
    });

    // Sink : /dev/null ou un stream qui consomme sans écrire
    const { Writable } = require("stream");
    const sink = new Writable({ write(_c, _e, cb) { cb(); } });

    await pipeline(
        fs.createReadStream(filePath, { highWaterMark: chunkSize }),
        counter,
        sink
    );
    return { bytesRead, linesRead };
}

// ─── Utilitaire ──────────────────────────────────────────────────────────────

function countNewlines(buf) {
    let n = 0;
    for (let i = 0; i < buf.length; i++) {
        if (buf[i] === 0x0a) n++; // \n
    }
    return n;
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

const METHODS = {
    readFileCallback,
    readFilePromise,
    readStream,
    readlineInterface,
    readManualBuffer,
    readPipeline,
};

async function main() {
    const fn = METHODS[method];
    if (!fn) {
        parentPort.postMessage({ ok: false, error: `Méthode inconnue : ${method}` });
        return;
    }

    try {
        const t0 = performance.now();
        const result = await fn();
        const elapsed_ms = performance.now() - t0;
        parentPort.postMessage({ ok: true, elapsed_ms, ...result });
    } catch (err) {
        parentPort.postMessage({ ok: false, error: err.message });
    }
}

main();