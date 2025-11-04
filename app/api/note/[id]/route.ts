/**
 * GET /api/note/:id - Fetch a note
 * PATCH /api/note/:id - Update a note
 */

import { requireUser } from '@/lib/auth';
import { errorToResponse, NotFoundError, ValidationError } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase';
import { parseBody, patchNoteBodySchema } from '@/lib/validation';
import { isValidUuid } from '@/lib/ids';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;

    if (!isValidUuid(id)) {
      throw new ValidationError('Invalid note ID');
    }

    const supabase = await createSupabaseServerClient();
    const { data: note, error } = await supabase
      .from('notes')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();

    if (error || !note) {
      throw new NotFoundError('Note not found');
    }

    return Response.json({
      id: note.id,
      title: note.title,
      editor_json: note.editor_json,
      outline_json: note.outline_json,
      tags: note.tags,
      created_at: note.created_at,
      updated_at: note.updated_at,
      capture_id: note.capture_id,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await requireUser();
    const { id } = await params;

    if (!isValidUuid(id)) {
      throw new ValidationError('Invalid note ID');
    }

    const body = await parseBody(request, patchNoteBodySchema);

    // Build update object
    const updates: Record<string, any> = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.editor_json !== undefined) updates.editor_json = body.editor_json;
    if (body.tags !== undefined) updates.tags = body.tags;

    if (Object.keys(updates).length === 0) {
      throw new ValidationError('No fields to update');
    }

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase
      .from('notes')
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId);

    if (error) {
      console.error('[note] Update failed:', error);
      throw new Error('Failed to update note');
    }

    return Response.json({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}

