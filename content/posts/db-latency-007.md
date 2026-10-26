---
title: "SQLite vs PostgreSQL — Benchmark de latence #7"
description: "p50/p95/p99 de lecture sur 100,000 lignes, 50 runs, environnement GitHub Actions 1000001787"
date: "2026-10-26T12:33:14.557Z"
slug: "db-latency-007"
benchmark: "db-latency"
run_number: 7
duration_ms: 3204
engines: ["sqlite"]
tags: ["benchmark", "database", "sqlite", "postgresql", "performance"]
generated: true
---

# SQLite vs PostgreSQL — Benchmark de latence \#7

> Article généré automatiquement · Run du 26 octobre 2026 · Durée : 3.2s · Node.js v22.23.3

## Contexte

Benchmark de latence de lecture sur une table de **100,000 lignes** avec **1,000 user_id distincts**. Chaque mesure est la médiane de **50 runs consécutifs** après 5 runs d'échauffement ignorés.

| Paramètre | Valeur |
|-----------|--------|
| Lignes dans la table | 100,000 |
| user_id distincts | 1,000 |
| Runs mesurés | 50 |
| Warmup ignoré | 5 runs |
| LIMIT (SELECT) | 100 |
| Environnement | GitHub Actions 1000001787 · linux/x64 |

## Résultats

### Lecture par user_id (index)

_SELECT avec filtre sur colonne indexée, ORDER BY, LIMIT 100_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.19 ms | 0.21 ms | 0.34 ms | 0.41 ms | 0.15 ms | 0.41 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.41 ms
```

**Tendance SQLite p50 ↗ régression :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 42.4,4.0 80.8,11.1 119.2,28.9 157.6,28.9 196.0,14.7" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="14.7" r="2.5" fill="#6366f1"/>
</svg>

### Scan complet sans index

_SELECT sans WHERE sur colonne non indexée (worst-case)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 41.57 ms | 42.02 ms | 69.59 ms | 82.03 ms | 41.24 ms | 82.03 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 82.03 ms
```

**Tendance SQLite p50 ↗ régression :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 42.4,4.0 80.8,9.4 119.2,17.9 157.6,18.3 196.0,9.6" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="9.6" r="2.5" fill="#6366f1"/>
</svg>

### Lecture par clé primaire

_SELECT par id (PK lookup, cache-friendly)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.02 ms | 0.02 ms | 0.02 ms | 0.05 ms | 0.02 ms | 0.05 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.05 ms
```

**Tendance SQLite p50 → stable :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,4.0 42.4,28.0 80.8,36.0 119.2,36.0 157.6,36.0 196.0,36.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="36.0" r="2.5" fill="#6366f1"/>
</svg>

## Résumé

| Scénario | SQLite p50 | PostgreSQL p50 | Gagnant |
|----------|------------|----------------|---------|
| Lecture par user_id (index) | 0.19 ms | — | **SQLite** |
| Scan complet sans index | 41.57 ms | — | **SQLite** |
| Lecture par clé primaire | 0.02 ms | — | **SQLite** |

## Verdict

- **PK lookup** : SQLite répond en 0.02 ms p50. PostgreSQL non testé dans ce run.
- **Index lookup** : coût de la clause ORDER BY : +9× vs PK pur.
- **Full scan** : 41.57 ms p50 — soit 2079× plus lent qu'un PK lookup. L'index change tout.

---

_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · [Code source du benchmark](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/db-latency.js) · [JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history.json)_
