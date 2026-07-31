---
title: "SQLite vs PostgreSQL — Benchmark de latence #1"
description: "p50/p95/p99 de lecture sur 2 000 lignes, 5 runs, environnement local"
date: "2026-07-31T12:58:54.720Z"
slug: "db-latency-001"
benchmark: "db-latency"
run_number: 1
duration_ms: 403
engines: ["sqlite"]
tags: ["benchmark", "database", "sqlite", "postgresql", "performance"]
generated: true
---

# SQLite vs PostgreSQL — Benchmark de latence \#1

> Article généré automatiquement · Run du 31 juillet 2026 · Durée : 0.4s · Node.js v22.22.2

## Contexte

Benchmark de latence de lecture sur une table de **2 000 lignes** avec **1 000 user_id distincts**. Chaque mesure est la médiane de **5 runs consécutifs** après 5 runs d'échauffement ignorés.

| Paramètre | Valeur |
|-----------|--------|
| Lignes dans la table | 2 000 |
| user_id distincts | 1 000 |
| Runs mesurés | 5 |
| Warmup ignoré | 5 runs |
| LIMIT (SELECT) | 100 |
| Environnement | local · linux/x64 |

## Résultats

### Lecture par user_id (index)

_SELECT avec filtre sur colonne indexée, ORDER BY, LIMIT 100_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.09 ms | 0.1 ms | 0.13 ms | 0.13 ms | 0.07 ms | 0.13 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.13 ms
```

### Scan complet sans index

_SELECT sans WHERE sur colonne non indexée (worst-case)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 1.12 ms | 1.13 ms | 1.15 ms | 1.15 ms | 0.98 ms | 1.15 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 1.15 ms
```

### Lecture par clé primaire

_SELECT par id (PK lookup, cache-friendly)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.05 ms | 0.05 ms | 0.07 ms | 0.07 ms | 0.05 ms | 0.07 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.07 ms
```

## Résumé

| Scénario | SQLite p50 | PostgreSQL p50 | Gagnant |
|----------|------------|----------------|---------|
| Lecture par user_id (index) | 0.09 ms | — | **SQLite** |
| Scan complet sans index | 1.12 ms | — | **SQLite** |
| Lecture par clé primaire | 0.05 ms | — | **SQLite** |

## Verdict

- **PK lookup** : SQLite répond en 0.05 ms p50. PostgreSQL non testé dans ce run.
- **Index lookup** : coût de la clause ORDER BY : +1× vs PK pur.
- **Full scan** : 1.12 ms p50 — soit 22× plus lent qu'un PK lookup. L'index change tout.

---

_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · [Code source du benchmark](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/db-latency.js) · [JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history.json)_
