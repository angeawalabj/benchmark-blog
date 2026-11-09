---
title: "SQLite vs PostgreSQL — Benchmark de latence #9"
description: "p50/p95/p99 de lecture sur 100,000 lignes, 50 runs, environnement GitHub Actions 1000001998"
date: "2026-11-09T15:41:33.192Z"
slug: "db-latency-009"
benchmark: "db-latency"
run_number: 9
duration_ms: 3045
engines: ["sqlite"]
tags: ["benchmark", "database", "sqlite", "postgresql", "performance"]
generated: true
---

# SQLite vs PostgreSQL — Benchmark de latence \#9

> Article généré automatiquement · Run du 9 novembre 2026 · Durée : 3.0s · Node.js v22.23.4

## Contexte

Benchmark de latence de lecture sur une table de **100,000 lignes** avec **1,000 user_id distincts**. Chaque mesure est la médiane de **50 runs consécutifs** après 5 runs d'échauffement ignorés.

| Paramètre | Valeur |
|-----------|--------|
| Lignes dans la table | 100,000 |
| user_id distincts | 1,000 |
| Runs mesurés | 50 |
| Warmup ignoré | 5 runs |
| LIMIT (SELECT) | 100 |
| Environnement | GitHub Actions 1000001998 · linux/x64 |

## Résultats

### Lecture par user_id (index)

_SELECT avec filtre sur colonne indexée, ORDER BY, LIMIT 100_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.19 ms | 0.22 ms | 0.32 ms | 0.37 ms | 0.15 ms | 0.37 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.37 ms
```

**Tendance SQLite p50 → stable :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 31.4,7.2 58.9,13.6 86.3,29.6 113.7,29.6 141.1,16.8 168.6,4.0 196.0,4.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="4.0" r="2.5" fill="#6366f1"/>
</svg>

### Scan complet sans index

_SELECT sans WHERE sur colonne non indexée (worst-case)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 41.66 ms | 41.79 ms | 42.56 ms | 43.41 ms | 41.41 ms | 43.41 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 43.41 ms
```

**Tendance SQLite p50 ↘ amélioration :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 31.4,4.8 58.9,10.1 86.3,18.4 113.7,18.7 141.1,10.2 168.6,4.0 196.0,6.4" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="6.4" r="2.5" fill="#6366f1"/>
</svg>

### Lecture par clé primaire

_SELECT par id (PK lookup, cache-friendly)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.02 ms | 0.02 ms | 0.02 ms | 0.06 ms | 0.02 ms | 0.06 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.06 ms
```

**Tendance SQLite p50 → stable :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,4.0 31.4,28.0 58.9,36.0 86.3,36.0 113.7,36.0 141.1,36.0 168.6,28.0 196.0,28.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="28.0" r="2.5" fill="#6366f1"/>
</svg>

## Résumé

| Scénario | SQLite p50 | PostgreSQL p50 | Gagnant |
|----------|------------|----------------|---------|
| Lecture par user_id (index) | 0.19 ms | — | **SQLite** |
| Scan complet sans index | 41.66 ms | — | **SQLite** |
| Lecture par clé primaire | 0.02 ms | — | **SQLite** |

## Verdict

- **PK lookup** : SQLite répond en 0.02 ms p50. PostgreSQL non testé dans ce run.
- **Index lookup** : coût de la clause ORDER BY : +9× vs PK pur.
- **Full scan** : 41.66 ms p50 — soit 2083× plus lent qu'un PK lookup. L'index change tout.

---

_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · [Code source du benchmark](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/db-latency.js) · [JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history.json)_
