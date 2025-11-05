/**
 * Zod validation schemas for API inputs/outputs
 */

import { z } from 'zod';
import { ValidationError } from './errors';

// Audio MIME types
export const audioMimeSchema = z.enum(['audio/webm', 'audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/wav']);

// Text MIME types
export const textMimeSchema = z.enum(['text/plain', 'text/markdown']);

// Combined MIME types for presign
export const presignMimeSchema = z.union([audioMimeSchema, textMimeSchema]);

// POST /api/notes - Create note
export const createNoteBodySchema = z.object({
  title: z.string().min(1).max(255),
  content_text: z.string().optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export type CreateNoteBody = z.infer<typeof createNoteBodySchema>;

// POST /api/notes/:id/audio - Request presigned URL for audio
export const addAudioBodySchema = z.object({
  filename: z.string().min(1).max(255),
  mime: audioMimeSchema,
  duration_s: z.number().int().min(0).optional(),
});

export type AddAudioBody = z.infer<typeof addAudioBodySchema>;

// POST /api/notes/:id/audio/commit - Commit audio upload
export const commitAudioBodySchema = z.object({
  storageKey: z.string().min(1),
  duration_s: z.number().int().min(0).optional(),
  mime: audioMimeSchema, // MIME type must match the uploaded file
});

export type CommitAudioBody = z.infer<typeof commitAudioBodySchema>;

// POST /api/notes/:id/text - Request presigned URL for text
export const addTextBodySchema = z.object({
  filename: z.string().min(1).max(255),
  mime: textMimeSchema,
});

export type AddTextBody = z.infer<typeof addTextBodySchema>;

// POST /api/notes/:id/text/commit - Commit text upload
export const commitTextBodySchema = z.object({
  storageKey: z.string().min(1),
  mime: textMimeSchema.optional(),
});

export type CommitTextBody = z.infer<typeof commitTextBodySchema>;

// PATCH /api/notes/:id - Update note
export const patchNoteBodySchema = z.object({
  title: z.string().min(1).max(255).optional(),
  content_text: z.string().optional(),
  editor_json: z.any().optional(), // Loose validation for ProseMirror JSON
  tags: z.array(z.string()).max(10).optional(),
});

export type PatchNoteBody = z.infer<typeof patchNoteBodySchema>;

// Outline JSON from GPT structuring
export const outlineJsonSchema = z.object({
  title: z.string(),
  highlights: z.array(z.string()),
  insights: z.array(z.string()),
  open_questions: z.array(z.string()),
  next_steps: z.array(
    z.object({
      text: z.string(),
      due: z.string().nullable(),
    })
  ),
  tags: z.array(z.enum(['work', 'creative', 'health', 'study', 'life'])),
  lang: z.enum(['en', 'zh', 'mixed']),
});

export type OutlineJson = z.infer<typeof outlineJsonSchema>;

// Editor JSON (ProseMirror doc) - loose validation
export const editorJsonSchema = z.object({
  type: z.string(),
  content: z.any().optional(),
});

export type EditorJson = z.infer<typeof editorJsonSchema>;

// Search query params
export const searchQuerySchema = z.object({
  q: z.string().optional(),
  tag: z.string().optional(),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;

/**
 * Parse and validate request body
 */
export async function parseBody<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Validation failed: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    throw new ValidationError('Invalid request body');
  }
}

/**
 * Parse and validate URL search params
 */
export function parseSearchParams<T>(
  searchParams: URLSearchParams,
  schema: z.ZodSchema<T>
): T {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });

  try {
    return schema.parse(params);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        `Validation failed: ${error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }
    throw new ValidationError('Invalid query parameters');
  }
}

