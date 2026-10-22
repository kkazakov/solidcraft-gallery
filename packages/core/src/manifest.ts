import { z } from 'zod';
import { LIMITS } from './limits.js';

const httpsUrl = z
  .string()
  .min(1)
  .max(300)
  .refine((value) => value.startsWith('https://'), 'must be an https:// URL');

const author = z
  .object({
    name: z.string().min(1).max(80),
    url: httpsUrl.optional(),
  })
  .strict();

const links = z
  .object({
    website: httpsUrl.optional(),
    video: httpsUrl.optional(),
    docs: httpsUrl.optional(),
    printables: httpsUrl.optional(),
    thingiverse: httpsUrl.optional(),
  })
  .strict();

/**
 * Contract for the optional project.json at a repository root.
 * Mirrors docs/appendix/project.schema.json. Unknown fields are rejected so a
 * typo cannot silently disappear.
 */
export const projectManifestSchema = z
  .object({
    schema: z.literal(1),
    title: z.string().min(1).max(LIMITS.titleChars),
    description: z.string().max(LIMITS.descriptionChars).optional(),
    tags: z
      .array(
        z
          .string()
          .min(1)
          .max(32)
          .regex(/^[a-z0-9][a-z0-9-]*$/, 'lowercase kebab-case'),
      )
      .max(LIMITS.projectTags)
      .refine((tags) => new Set(tags).size === tags.length, 'tags must be unique')
      .optional(),
    license: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[A-Za-z0-9][A-Za-z0-9.+-]*$/)
      .optional(),
    design: z
      .string()
      .min(1)
      .max(255)
      .regex(/\.solidcraft$/)
      .optional(),
    cover: z
      .string()
      .min(1)
      .max(255)
      .regex(/\.(png|jpe?g|webp)$/)
      .optional(),
    authors: z.array(author).max(20).optional(),
    links: links.optional(),
    solidcraft: z.string().max(32).optional(),
  })
  .strict();

export type ProjectManifest = z.infer<typeof projectManifestSchema>;

export type ManifestResult =
  { ok: true; value: ProjectManifest } | { ok: false; issues: { path: string; message: string }[] };

export function parseProjectManifest(input: unknown): ManifestResult {
  const parsed = projectManifestSchema.safeParse(input);
  if (parsed.success) return { ok: true, value: parsed.data };

  return {
    ok: false,
    issues: parsed.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
      message: issue.message,
    })),
  };
}
