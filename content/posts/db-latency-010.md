---
title: "SQLite vs PostgreSQL — Benchmark de latence #10"
description: "p50/p95/p99 de lecture sur 100,000 lignes, 50 runs, environnement GitHub Actions 1000002005"
date: "2026-11-16T15:16:15.638Z"
slug: "db-latency-010"
benchmark: "db-latency"
run_number: 10
duration_ms: 3521
engines: ["sqlite"]
tags: ["benchmark", "database", "sqlite", "postgresql", "performance"]
generated: true
---

# SQLite vs PostgreSQL — Benchmark de latence \#10

> Article généré automatiquement · Run du 16 novembre 2026 · Durée : 3.5s · Node.js v22.23.4

## Contexte

Benchmark de latence de lecture sur une table de **100,000 lignes** avec **1,000 user_id distincts**. Chaque mesure est la médiane de **50 runs consécutifs** après 5 runs d'échauffement ignorés.

| Paramètre | Valeur |
|-----------|--------|
| Lignes dans la table | 100,000 |
| user_id distincts | 1,000 |
| Runs mesurés | 50 |
| Warmup ignoré | 5 runs |
| LIMIT (SELECT) | 100 |
| Environnement | GitHub Actions 1000002005 · linux/x64 |

## Résultats

### Lecture par user_id (index)

_SELECT avec filtre sur colonne indexée, ORDER BY, LIMIT 100_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.2 ms | 0.21 ms | 0.26 ms | 0.37 ms | 0.14 ms | 0.37 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.37 ms
```

**Tendance SQLite p50 → stable :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 28.0,7.2 52.0,13.6 76.0,29.6 100.0,29.6 124.0,16.8 148.0,4.0 172.0,4.0 196.0,4.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="4.0" r="2.5" fill="#6366f1"/>
</svg>

### Scan complet sans index

_SELECT sans WHERE sur colonne non indexée (worst-case)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 44.6 ms | 44.76 ms | 45.62 ms | 46.32 ms | 44.13 ms | 46.32 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 46.32 ms
```

**Tendance SQLite p50 ↗ régression :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,36.0 28.0,4.8 52.0,10.1 76.0,18.4 100.0,18.8 124.0,10.3 148.0,4.1 172.0,6.4 196.0,4.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="4.0" r="2.5" fill="#6366f1"/>
</svg>

### Lecture par clé primaire

_SELECT par id (PK lookup, cache-friendly)_

| Moteur | p50 | p75 | p95 | p99 | min | max |
|--------|-----|-----|-----|-----|-----|-----|
| **SQLite** _(sql.js (WebAssembly))_ | 0.02 ms | 0.02 ms | 0.02 ms | 0.04 ms | 0.01 ms | 0.04 ms |

**Distribution p99 (relative) :**

```
SQLite       ████████████████████████ 0.04 ms
```

**Tendance SQLite p50 → stable :**

<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40" viewBox="0 0 200 40">
  <polyline points="4.0,4.0 28.0,28.0 52.0,36.0 76.0,36.0 100.0,36.0 124.0,36.0 148.0,28.0 172.0,28.0 196.0,28.0" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="196.0" cy="28.0" r="2.5" fill="#6366f1"/>
</svg>

## Résumé

| Scénario | SQLite p50 | PostgreSQL p50 | Gagnant |
|----------|------------|----------------|---------|
| Lecture par user_id (index) | 0.2 ms | — | **SQLite** |
| Scan complet sans index | 44.6 ms | — | **SQLite** |
| Lecture par clé primaire | 0.02 ms | — | **SQLite** |

## Verdict

- **PK lookup** : SQLite répond en 0.02 ms p50. PostgreSQL non testé dans ce run.
- **Index lookup** : coût de la clause ORDER BY : +9× vs PK pur.
- **Full scan** : 44.6 ms p50 — soit 2230× plus lent qu'un PK lookup. L'index change tout.

---

_Généré par [benchmark-blog](https://github.com/angeawalabj/benchmark-blog) · [Code source du benchmark](https://github.com/angeawalabj/benchmark-blog/blob/main/benchmarks/db-latency.js) · [JSON brut](https://github.com/angeawalabj/benchmark-blog/blob/main/data/history.json)_
