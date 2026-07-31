#!/usr/bin/env node
/**
 * Convertit les articles générés (content/posts/*.md) en entrées de la
 * collection "posts" du site Astro (site/src/content/posts/).
 *
 * Le frontmatter des articles générés correspond déjà au schéma attendu par
 * site/src/content.config.ts (title, description, date, benchmark, ...) —
 * ce script valide juste le frontmatter et ignore les fichiers incomplets.
 *
 * Usage :
 *   node generate-pages.js
 *   node generate-pages.js --posts content/posts --out site/src/content/posts
 */

"use strict";

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const postsDir = argVal(args, "--posts") || "content/posts";
const outDir = argVal(args, "--out") || "site/src/content/posts";

function argVal(arr, flag) {
	const i = arr.indexOf(flag);
	return i !== -1 ? arr[i + 1] : null;
}

function parseValue(value) {
	if (value.startsWith("[") && value.endsWith("]")) {
		return value
			.slice(1, -1)
			.split(",")
			.map((v) => v.trim())
			.filter((v) => v !== "")
			.map(parseValue);
	}
	if (
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	if (value === "true") return true;
	if (value === "false") return false;
	if (value !== "" && !Number.isNaN(Number(value))) return Number(value);
	return value;
}

function toFrontmatterValue(value) {
	if (Array.isArray(value)) {
		return `[${value.map(toFrontmatterValue).join(", ")}]`;
	}
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return `"${String(value).replace(/"/g, '\\"')}"`;
}

function parseFrontmatter(raw) {
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return { data: {}, body: raw };

	const [, frontmatter, body] = match;
	const data = {};

	for (const line of frontmatter.split("\n")) {
		if (!line.trim()) continue;
		const sep = line.indexOf(":");
		if (sep === -1) continue;
		const key = line.slice(0, sep).trim();
		data[key] = parseValue(line.slice(sep + 1).trim());
	}

	return { data, body };
}

function convert(sourcePath) {
	const raw = fs.readFileSync(sourcePath, "utf8");
	const { data, body } = parseFrontmatter(raw);

	if (!data.title || !data.date) {
		process.stderr.write(`[generate-pages] Ignoré (frontmatter incomplet) : ${sourcePath}\n`);
		return null;
	}

	const lines = ["---"];
	for (const [key, value] of Object.entries(data)) {
		lines.push(`${key}: ${toFrontmatterValue(value)}`);
	}
	lines.push("---", "");

	return lines.join("\n") + body;
}

function main() {
	if (!fs.existsSync(postsDir)) {
		process.stderr.write(`[generate-pages] Aucun article trouvé (${postsDir} n'existe pas encore)\n`);
		return;
	}

	fs.mkdirSync(outDir, { recursive: true });

	const files = fs.readdirSync(postsDir).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));
	let count = 0;

	for (const file of files) {
		const converted = convert(path.join(postsDir, file));
		if (converted === null) continue;
		fs.writeFileSync(path.join(outDir, file), converted);
		count++;
	}

	process.stderr.write(`[generate-pages] ${count} article(s) copié(s) vers ${outDir}\n`);
}

main();
