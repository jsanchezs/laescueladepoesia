import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const courses = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/courses" }),
  schema: z.object({
    title: z.string(),
    eyebrow: z.string(),
    schedule: z.string(),
    period: z.string(),
    intro: z.string(),
    description: z.string(),
    audience: z.array(z.string()),
    method: z.array(
      z.object({
        title: z.string(),
        text: z.string(),
        note: z.string(),
      }),
    ),
    details: z.array(z.object({ label: z.string(), value: z.string() })),
    prices: z.array(
      z.object({
        label: z.string(),
        price: z.string(),
        recommended: z.boolean().optional(),
      }),
    ),
    deposit: z.string(),
    process: z.array(z.string()),
    faqs: z.array(z.object({ question: z.string(), answer: z.string() })),
    seo: z.object({ title: z.string(), description: z.string() }),
  }),
});

export const collections = { courses };
