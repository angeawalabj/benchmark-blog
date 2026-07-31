import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const posts = defineCollection({
	// Articles générés par generate-pages.js depuis content/posts/*.md à la racine.
	loader: glob({ base: './src/content/posts', pattern: '**/*.md' }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
		date: z.coerce.date(),
		slug: z.string().optional(),
		benchmark: z.string().optional(),
		run_number: z.number().optional(),
		duration_ms: z.number().optional(),
		engines: z.array(z.string()).optional(),
		frameworks: z.array(z.string()).optional(),
		tags: z.array(z.string()).optional(),
		generated: z.boolean().optional(),
	}),
});

export const collections = { posts };
