/**
 * OpenAI API helpers for transcription and LLM structuring
 */

import OpenAI from 'openai';
import { OutlineJson, outlineJsonSchema, EditorJson } from './validation';
import { InternalServerError } from './errors';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60000, // 60s timeout
});

export interface TranscriptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  text: string;
  segments: TranscriptionSegment[];
}

/**
 * Transcribe audio using OpenAI Whisper
 */
export async function transcribeAudio({
  audioBuffer,
  mime,
}: {
  audioBuffer: Buffer;
  mime: string;
}): Promise<TranscriptionResult> {
  try {
    // Determine file extension from mime type
    const extension = mime.split('/')[1] || 'webm';
    
    // Create a File-like object from buffer
    const file = new File([audioBuffer], `audio.${extension}`, { type: mime });

    const response = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    // Extract segments
    const segments: TranscriptionSegment[] = [];
    if ('segments' in response && Array.isArray(response.segments)) {
      for (const seg of response.segments) {
        if (seg.start !== undefined && seg.end !== undefined && seg.text) {
          segments.push({
            start: seg.start,
            end: seg.end,
            text: seg.text,
          });
        }
      }
    }

    return {
      text: response.text,
      segments,
    };
  } catch (error) {
    console.error('[openai] Transcription failed:', error);
    throw new InternalServerError('Failed to transcribe audio');
  }
}

/**
 * Structure raw transcript into outline JSON using GPT-4o-mini
 */
export async function structureOutline({
  transcriptText,
}: {
  transcriptText: string;
}): Promise<OutlineJson> {
  try {
    // Truncate to ~8k chars for MVP (avoid token limits)
    const truncated = transcriptText.slice(0, 8000);

    const systemPrompt = `You convert raw transcripts into concise, factual outlines. Do not invent content. Return strict JSON with keys: {title, highlights, insights, open_questions, next_steps, tags, lang}. Keep bullets short; preserve numbers/names; no hallucinations. Tags must be subset of: work, creative, health, study, life.`;

    const userPrompt = `INPUT_TRANSCRIPT:\n<<<\n${truncated}\n>>>`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 1500,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Validate with zod
    return outlineJsonSchema.parse(parsed);
  } catch (error) {
    console.error('[openai] Structure outline failed:', error);
    
    // Return minimal fallback outline
    return {
      title: 'Untitled Note',
      highlights: ['Transcript processing failed'],
      insights: [],
      open_questions: [],
      next_steps: [],
      tags: [],
      lang: 'en',
    };
  }
}

/**
 * Convert outline JSON to ProseMirror editor JSON using GPT-4o-mini
 */
export async function outlineToEditorJson({
  outline,
}: {
  outline: OutlineJson;
}): Promise<EditorJson> {
  try {
    const systemPrompt = `Convert outline JSON into a clean ProseMirror doc JSON with sections: H1 title; H2 Highlights (bulleted); H2 Insights (bulleted); H2 Open Questions (bulleted, each ends with '?'); H2 Next Steps (todo list checkboxes). Keep structure minimal; no custom styling.`;

    const userPrompt = JSON.stringify(outline, null, 2);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    
    // Basic validation - should have type and content
    if (!parsed.type) {
      throw new Error('Invalid editor JSON structure');
    }

    return parsed as EditorJson;
  } catch (error) {
    console.error('[openai] Editor JSON generation failed:', error);
    
    // Return minimal fallback editor doc
    return createFallbackEditorJson(outline);
  }
}

/**
 * Create a minimal ProseMirror doc from outline
 */
function createFallbackEditorJson(outline: OutlineJson): EditorJson {
  const content: any[] = [];

  // Title
  content.push({
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: outline.title }],
  });

  // Highlights
  if (outline.highlights.length > 0) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Highlights' }],
    });
    content.push({
      type: 'bulletList',
      content: outline.highlights.map((h) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: h }],
          },
        ],
      })),
    });
  }

  // Insights
  if (outline.insights.length > 0) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Insights' }],
    });
    content.push({
      type: 'bulletList',
      content: outline.insights.map((i) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: i }],
          },
        ],
      })),
    });
  }

  // Open Questions
  if (outline.open_questions.length > 0) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Open Questions' }],
    });
    content.push({
      type: 'bulletList',
      content: outline.open_questions.map((q) => ({
        type: 'listItem',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: q.endsWith('?') ? q : `${q}?` }],
          },
        ],
      })),
    });
  }

  // Next Steps
  if (outline.next_steps.length > 0) {
    content.push({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: 'Next Steps' }],
    });
    content.push({
      type: 'taskList',
      content: outline.next_steps.map((step) => ({
        type: 'taskItem',
        attrs: { checked: false },
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: step.text }],
          },
        ],
      })),
    });
  }

  return {
    type: 'doc',
    content,
  };
}

