import { getCollection } from 'astro:content';
import rss from '@astrojs/rss';

export async function GET(context) {
	const posts = (await getCollection('posts')).sort(
		(a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
	);

	return rss({
		title: 'benchmark-blog',
		description: 'Pipeline CI qui run des benchmarks Node.js et génère des articles automatiquement.',
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			description: post.data.description,
			pubDate: post.data.date,
			link: `/posts/${post.id}/`,
		})),
	});
}
