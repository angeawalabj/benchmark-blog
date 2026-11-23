---
title: "SQLite vs PostgreSQL — Benchmark de latence #11"
description: "p50/p95/p99 de lecture sur 100,000 lignes, 50 runs, environnement GitHub Actions 1000002012"
date: "2026-11-23T17:43:41.777Z"
slug: "db-latency-011"
benchmark: "db-latency"
run_number: 11
duration_ms: 1976
engines: ["sqlite"]
tags: ["benchmark", "database", "sqlite", "postgresql", "performance"]
generated: true
---

# SQLite vs PostgreSQL — Benchmark de latence \#11

> Article généré automatiquement · Run du 23 novembre 2026 · Durée : 2.0s · Node.js v22.23.5

## Contexte

Benchmark de latence de lecture sur une table de **100,000 lignes** avec **1,000 user_id distincts**. Chaque mesure est la médiane de **50 runs consécutifs** après 5 runs d'échauffement ignorés.

| Paramètre | Valeur |
|-----------|--------|
| Lignes dans la table | 100,000 |
| user_id distincts | 1,000 |
| Runs mesurés | 50 |
| Warmup ignoré | 5 runs |
| LIMIT (SELECT) | 100 |
| Environnement | GitHub Actions 1000002012 · linux/x64 |

## Résultats

### Lecture par user_id (index)

_SELECT avec filtre sur colonne indexée, ORDER BY, LIMIT 100_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.13 ms | 0.14 ms | 0.17 ms | 0.2 ms | 0.1 ms | 0.2 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.2 ms
```

**Tendance SQLite p50 ↗ régression :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 25.3,9.8 46.7,15.6 68.0,30.2 89.3,30.2 110.7,18.5 132.0,6.9 153.3,6.9 174.7,6.9 196.0,4.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="4.0" r="2.5" fill="#6366f1"/>
</svg>

### Scan complet sans index

_SELECT sans WHERE sur colonne non indexée (worst-case)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 23.81 ms | 24.35 ms | 24.66 ms | 25.04 ms | 22.71 ms | 25.04 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 25.04 ms
```

**Tendance SQLite p50 ↗ régression :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 25.3,7.0 46.7,11.9 68.0,19.6 89.3,19.9 110.7,12.0 132.0,6.2 153.3,8.4 174.7,6.2 196.0,4.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="4.0" r="2.5" fill="#6366f1"/>
</svg>

### Lecture par clé primaire

_SELECT par id (PK lookup, cache-friendly)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.01 ms | 0.01 ms | 0.01 ms | 0.03 ms | 0.01 ms | 0.03 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.03 ms
```

**Tendance SQLite p50 → stable :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,4.0 25.3,28.0 46.7,36.0 68.0,36.0 89.3,36.0 110.7,36.0 132.0,28.0 153.3,28.0 174.7,28.0 196.0,28.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="28.0" r="2.5" fill="#6366f1"/>
</svg>

## Résumé

| Scénario | SQLite p50 | PostgreSQL p50 | Gagnant |
|----------|------------|----------------|---------|
| Lecture par user_id (index) | 0.13 ms | — | **SQLite** |
| Scan complet sans index | 23.81 ms | — | **SQLite** |
| Lecture par clé primaire | 0.01 ms | — | **SQLite** |

## Verdict

- **PK lookup** : SQLite répond en 0.01 ms p50. PostgreSQL non testé dans ce run.
- **Index lookup** : coût de la clause ORDER BY : +12× vs PK pur.
- **Full scan** : 23.81 ms p50 — soit 2381× plus lent qu'un PK lookup. L'index change tout.

---

_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · [Code source du benchmark](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/db-latency.js) · [JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history.json)_
