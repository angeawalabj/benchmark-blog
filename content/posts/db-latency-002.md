---
title: "SQLite vs PostgreSQL — Benchmark de latence #2"
description: "p50/p95/p99 de lecture sur 100,000 lignes, 50 runs, environnement GitHub Actions 1000001461"
date: "2026-09-21T12:25:11.460Z"
slug: "db-latency-002"
benchmark: "db-latency"
run_number: 2
duration_ms: 2896
engines: ["sqlite"]
tags: ["benchmark", "database", "sqlite", "postgresql", "performance"]
generated: true
---

# SQLite vs PostgreSQL — Benchmark de latence \#2

> Article généré automatiquement · Run du 21 septembre 2026 · Durée : 2.9s · Node.js v22.23.2

## Contexte

Benchmark de latence de lecture sur une table de **100,000 lignes** avec **1,000 user_id distincts**. Chaque mesure est la médiane de **50 runs consécutifs** après 5 runs d'échauffement ignorés.

| Paramètre | Valeur |
|-----------|--------|
| Lignes dans la table | 100,000 |
| user_id distincts | 1,000 |
| Runs mesurés | 50 |
| Warmup ignoré | 5 runs |
| LIMIT (SELECT) | 100 |
| Environnement | GitHub Actions 1000001461 · linux/x64 |

## Résultats

### Lecture par user_id (index)

_SELECT avec filtre sur colonne indexée, ORDER BY, LIMIT 100_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.18 ms | 0.19 ms | 0.28 ms | 0.29 ms | 0.12 ms | 0.29 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.29 ms
```

### Scan complet sans index

_SELECT sans WHERE sur colonne non indexée (worst-case)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 40.59 ms | 41.21 ms | 41.76 ms | 42.33 ms | 39.67 ms | 42.33 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 42.33 ms
```

### Lecture par clé primaire

_SELECT par id (PK lookup, cache-friendly)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.02 ms | 0.02 ms | 0.02 ms | 0.02 ms | 0.01 ms | 0.02 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.02 ms
```

## Résumé

| Scénario | SQLite p50 | PostgreSQL p50 | Gagnant |
|----------|------------|----------------|---------|
| Lecture par user_id (index) | 0.18 ms | — | **SQLite** |
| Scan complet sans index | 40.59 ms | — | **SQLite** |
| Lecture par clé primaire | 0.02 ms | — | **SQLite** |

## Verdict

- **PK lookup** : SQLite répond en 0.02 ms p50. PostgreSQL non testé dans ce run.
- **Index lookup** : coût de la clause ORDER BY : +8× vs PK pur.
- **Full scan** : 40.59 ms p50 — soit 2030× plus lent qu'un PK lookup. L'index change tout.

---

_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · [Code source du benchmark](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/db-latency.js) · [JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history.json)_
