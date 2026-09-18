# benchmark-blog

Pipeline CI qui exécute des benchmarks Node.js, génère des articles Markdown à partir des résultats et les publie automatiquement sur GitHub Pages via un site Astro.

## Présentation

`benchmark-blog` mesure les performances de plusieurs briques techniques Node.js (bases de données, frameworks HTTP, méthodes de lecture de fichiers) et transforme chaque résultat en article de blog structuré, sans intervention manuelle. Le principe : un script de benchmark produit un JSON structuré sur `stdout`, un générateur transforme ce JSON en article Markdown avec frontmatter, tableaux de percentiles et sparklines SVG, puis le site Astro consomme ces articles pour générer les pages publiées sur GitHub Pages. Un workflow GitHub Actions orchestre l'ensemble chaque semaine : run du benchmark, génération de l'article, commit automatique, puis rebuild du site.

## Stack

| Composant | Technologie |
|---|---|
| Runtime | Node.js ≥ 18 (CI : Node 22) |
| Benchmarks DB | `sql.js` (SQLite/WebAssembly), `pg` (PostgreSQL, optionnel) |
| Benchmarks API | `fastify`, `express`, `hono`, `autocannon` |
| Benchmarks File I/O | API natives Node.js (`fs`, `worker_threads`) |
| Génération d'articles | Scripts Node.js (CommonJS), sortie Markdown + frontmatter YAML |
| Site | Astro ^7.1.1 avec `@astrojs/rss` |
| Hébergement / CI | GitHub Actions + GitHub Pages |

## Fonctionnalités / benchmarks disponibles

- **`db-latency`** — Latence de lecture SQLite vs PostgreSQL sur 3 scénarios (lecture indexée par `user_id`, scan complet sans index, lecture par clé primaire). Calcule p50/p75/p95/p99, min, max et moyenne sur des runs mesurés après une phase d'échauffement, et compare les deux moteurs quand PostgreSQL est disponible (`PG_URL`).
- **`api-throughput`** — Throughput et latence HTTP de trois frameworks (Fastify, Express, Hono) via `autocannon`, sur 4 scénarios : réponse minimale (`/ping`), sérialisation JSON (`/json`), calcul CPU-bound (`/cpu`, Fibonacci), et parsing de query string (`/echo`). Chaque framework tourne dans un sous-processus isolé.
- **`file-io`** — Comparaison de 6 méthodes de lecture de fichiers Node.js (`fs.readFile` callback, `fs.promises.readFile`, `fs.createReadStream`, `readline`, lecture bas niveau via buffer, `stream.pipeline`) sur 4 tailles de fichier (256 Ko à 128 Mo).

Chaque run alimente un historique JSON (`data/history*.json`, 52 derniers runs conservés) qui sert à générer des sparklines SVG inline montrant l'évolution des métriques dans le temps.

## Structure du projet

```
benchmark-blog/
├── benchmarks/
│   ├── db-latency.js          # SQLite vs PostgreSQL
│   ├── api-throughput.js      # Fastify vs Express vs Hono
│   ├── file-io.js             # 6 méthodes de lecture de fichiers
│   ├── _http-worker.js        # worker HTTP (sous-processus)
│   └── _fileio-worker.js      # worker file I/O (Worker Thread)
├── generate/
│   ├── article.js                 # résultat db-latency → Markdown
│   ├── article-api-throughput.js  # résultat api-throughput → Markdown
│   └── article-file-io.js         # résultat file-io → Markdown
├── generate-pages.js          # copie content/posts/*.md vers la collection Astro
├── data/                      # historiques JSON par benchmark
├── content/posts/             # articles Markdown générés
├── site/                      # site Astro (déployé sur GitHub Pages)
└── .github/workflows/
    ├── benchmark.yml          # cron hebdo + génération + commit
    └── deploy.yml             # build Astro + déploiement Pages
```

## Pipeline CI

Le workflow `.github/workflows/benchmark.yml` tourne chaque lundi à 06h00 UTC (cron), ou peut être déclenché manuellement (`workflow_dispatch`, avec choix du benchmark et des paramètres). Il exécute le benchmark sélectionné, génère l'article Markdown correspondant, puis commit les fichiers générés (`content/posts/`, `data/history*.json`) avec `[skip ci]`. Ce commit déclenche à son tour `.github/workflows/deploy.yml`, qui régénère les pages Astro et redéploie le site sur GitHub Pages.

## Usage

```bash
# Lancer un benchmark seul (sortie JSON sur stdout)
npm run bench:db       # node benchmarks/db-latency.js
npm run bench:api      # node benchmarks/api-throughput.js
npm run bench:fileio   # node benchmarks/file-io.js

# Lancer un benchmark et générer l'article Markdown associé
npm run gen:db         # db-latency → content/posts/
npm run gen:api        # api-throughput → content/posts/
npm run gen:fileio     # file-io → content/posts/

# Enchaîner les trois benchmarks + génération
npm run pipeline

# Version rapide du pipeline db-latency (10 000 lignes, 10 runs)
npm run pipeline:fast

# Site Astro
npm run pages:generate  # copie content/posts/ vers site/src/content/posts/
npm run site:dev        # génère les pages puis lance le serveur de dev
npm run site:build      # génère les pages puis build le site
npm run site:preview    # prévisualise le build
```

Le benchmark `db-latency` peut inclure PostgreSQL en définissant la variable d'environnement `PG_URL` (`postgres://user:pass@host:5432/db`) ; en son absence, seul SQLite est testé.
