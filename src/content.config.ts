// Astro Content Collections config
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: 'best-vibrators-2024.md', path: './src/content/blog' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    category: z.string(),
    categorySlug: z.string(),
    featuredImage: z.string().optional(),
    publishedAt: z.string().optional(),
    author: z.string().optional(),
    seo: z.object({
      metaTitle: z.string().optional(),
      metaDescription: z.string().optional(),
      canonicalUrl: z.string().optional(),
      ogImage: z.string().optional(),
      noIndex: z.boolean().optional(),
    }).optional(),
    affiliate: z.object({
      displayType: z.enum(['inline', 'floating', 'cta_button', 'both']).default('cta_button'),
      links: z.array(z.object({
        platform: z.string(),
        url: z.string(),
        anchorText: z.string(),
        position: z.enum(['top', 'middle', 'bottom']).optional(),
      })),
    }).optional(),
  }).strict(),
});

export const collections = { blog };