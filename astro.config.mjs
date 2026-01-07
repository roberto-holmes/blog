// @ts-check
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";

// https://astro.build/config
export default defineConfig({
	site: "https://robertoholm.es",
	base: "blog",
	integrations: [mdx(), sitemap()],
	markdown: {
		rehypePlugins: [
			rehypeSlug,
			[
				rehypeAutolinkHeadings,
				{
					behavior: "wrap",
					headingProperties: {
						className: ["anchor"],
					},
					properties: {
						className: ["anchor-link"],
					},
				},
			],
		],
	},
});
