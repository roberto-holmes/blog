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
    server: {
        allowedHosts: ["tycho"],
    },
    devToolbar: {
        enabled: false,
    },
    vite: {
        server: {
            https: {
                key: "./certs/blog.key",
                cert: "./certs/blog.crt",
            },
            ws: {
                protocol: "wss",
                host: "tycho.local",
                port: 4321,
            },
        },
    },
});
