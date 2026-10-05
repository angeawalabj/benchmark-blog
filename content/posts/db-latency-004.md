---
title: "SQLite vs PostgreSQL — Benchmark de latence #4"
description: "p50/p95/p99 de lecture sur 100,000 lignes, 50 runs, environnement GitHub Actions 1000001576"
date: "2026-10-05T14:04:58.150Z"
slug: "db-latency-004"
benchmark: "db-latency"
run_number: 4
duration_ms: 1727
engines: ["sqlite"]
tags: ["benchmark", "database", "sqlite", "postgresql", "performance"]
generated: true
---

# SQLite vs PostgreSQL — Benchmark de latence \#4

> Article généré automatiquement · Run du 5 octobre 2026 · Durée : 1.7s · Node.js v22.23.3

## Contexte

Benchmark de latence de lecture sur une table de **100,000 lignes** avec **1,000 user_id distincts**. Chaque mesure est la médiane de **50 runs consécutifs** après 5 runs d'échauffement ignorés.

| Paramètre | Valeur |
|-----------|--------|
| Lignes dans la table | 100,000 |
| user_id distincts | 1,000 |
| Runs mesurés | 50 |
| Warmup ignoré | 5 runs |
| LIMIT (SELECT) | 100 |
| Environnement | GitHub Actions 1000001576 · linux/x64 |

## Résultats

### Lecture par user_id (index)

_SELECT avec filtre sur colonne indexée, ORDER BY, LIMIT 100_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.11 ms | 0.13 ms | 0.18 ms | 0.19 ms | 0.09 ms | 0.19 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.19 ms
```

**Tendance SQLite p50 ↘ amélioration :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 100.0,4.0 196.0,11.1" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="11.1" r="2.5" fill="#6366f1"/>
</svg>

### Scan complet sans index

_SELECT sans WHERE sur colonne non indexée (worst-case)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 23.4 ms | 23.5 ms | 23.87 ms | 23.89 ms | 22.75 ms | 23.89 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 23.89 ms
```

**Tendance SQLite p50 ↘ amélioration :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 100.0,4.0 196.0,9.4" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="9.4" r="2.5" fill="#6366f1"/>
</svg>

### Lecture par clé primaire

_SELECT par id (PK lookup, cache-friendly)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.01 ms | 0.01 ms | 0.01 ms | 0.61 ms | 0.01 ms | 0.61 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.61 ms
```

**Tendance SQLite p50 ↘ amélioration :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,4.0 100.0,28.0 196.0,36.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="36.0" r="2.5" fill="#6366f1"/>
</svg>

## Résumé

| Scénario | SQLite p50 | PostgreSQL p50 | Gagnant |
|----------|------------|----------------|---------|
| Lecture par user_id (index) | 0.11 ms | — | **SQLite** |
| Scan complet sans index | 23.4 ms | — | **SQLite** |
| Lecture par clé primaire | 0.01 ms | — | **SQLite** |

## Verdict

- **PK lookup** : SQLite répond en 0.01 ms p50. PostgreSQL non testé dans ce run.
- **Index lookup** : coût de la clause ORDER BY : +10× vs PK pur.
- **Full scan** : 23.4 ms p50 — soit 2340× plus lent qu'un PK lookup. L'index change tout.

---

_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · [Code source du benchmark](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/db-latency.js) · [JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history.json)_
