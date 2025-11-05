-- jot Schema Refactor: Note-Centric Model
-- This migration restructures the database to make notes the primary entity
-- Notes can have multiple audio files and text inputs

-- ============================================================================
-- STEP 1: Create new tables
-- ============================================================================

-- Notes table: Primary entity (restructured)
-- Remove dependency on captures, make it standalone
CREATE TABLE IF NOT EXISTS public.notes_new (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content_text TEXT,                    -- Editable text content
  editor_json  JSONB NOT NULL,          -- ProseMirror/Tiptap doc json (editable)
  outline_json JSONB,                   -- Structured outline (optional)
  tags         TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Audio files table: Multiple audio files per note
CREATE TABLE IF NOT EXISTS public.audio_files (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id      UUID NOT NULL REFERENCES public.notes_new(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,           -- Path in "audio" bucket
  duration_s   INT CHECK (duration_s >= 0),
  mime_type    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  order_index  INT DEFAULT 0            -- For ordering multiple audio files
);

-- Transcripts table: One per audio file (restructured)
CREATE TABLE IF NOT EXISTS public.transcripts_new (
  audio_file_id UUID PRIMARY KEY REFERENCES public.audio_files(id) ON DELETE CASCADE,
  text          TEXT NOT NULL,
  segments_json JSONB NOT NULL DEFAULT '[]'::jsonb   -- [{start,end,text}]
);

-- Text inputs table: Original text files (if uploaded)
CREATE TABLE IF NOT EXISTS public.text_inputs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id      UUID NOT NULL REFERENCES public.notes_new(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,           -- Path in "notes" bucket
  mime_type    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- STEP 2: Create indexes
-- ============================================================================

CREATE INDEX notes_new_user_id_idx ON public.notes_new(user_id);
CREATE INDEX notes_new_created_at_idx ON public.notes_new(created_at DESC);
CREATE INDEX notes_new_tags_idx ON public.notes_new USING gin(tags);
CREATE INDEX notes_new_title_idx ON public.notes_new USING gin(to_tsvector('english', title));
CREATE INDEX notes_new_content_idx ON public.notes_new USING gin(to_tsvector('english', content_text));

CREATE INDEX audio_files_note_id_idx ON public.audio_files(note_id);
CREATE INDEX audio_files_created_at_idx ON public.audio_files(created_at DESC);

CREATE INDEX text_inputs_note_id_idx ON public.text_inputs(note_id);

CREATE INDEX transcripts_new_text_idx ON public.transcripts_new USING gin(to_tsvector('english', text));

-- ============================================================================
-- STEP 3: Migrate existing data (optional - comment out if starting fresh)
-- ============================================================================

-- Migrate notes (preserve existing notes data)
-- INSERT INTO public.notes_new (id, user_id, title, content_text, editor_json, outline_json, tags, created_at, updated_at)
-- SELECT 
--   n.id, 
--   n.user_id, 
--   n.title,
--   t.text,  -- Use transcript text as content_text
--   n.editor_json, 
--   n.outline_json, 
--   n.tags, 
--   n.created_at, 
--   n.updated_at
-- FROM public.notes n
-- LEFT JOIN public.captures c ON n.capture_id = c.id
-- LEFT JOIN public.transcripts t ON c.id = t.capture_id;

-- Migrate audio captures to audio_files
-- INSERT INTO public.audio_files (id, note_id, storage_path, duration_s, mime_type, created_at, order_index)
-- SELECT 
--   c.id,
--   n.id as note_id,
--   c.audio_path,
--   c.duration_s,
--   c.language,  -- Was storing mime type temporarily
--   c.created_at,
--   0
-- FROM public.captures c
-- JOIN public.notes n ON n.capture_id = c.id
-- WHERE c.audio_path IS NOT NULL;

-- Migrate transcripts to new structure
-- INSERT INTO public.transcripts_new (audio_file_id, text, segments_json)
-- SELECT 
--   c.id as audio_file_id,
--   t.text,
--   t.segments_json
-- FROM public.transcripts t
-- JOIN public.captures c ON t.capture_id = c.id
-- WHERE c.audio_path IS NOT NULL;

-- Migrate text captures to text_inputs
-- INSERT INTO public.text_inputs (id, note_id, storage_path, mime_type, created_at)
-- SELECT 
--   c.id,
--   n.id as note_id,
--   c.text_path,
--   c.language,  -- Was storing mime type temporarily
--   c.created_at
-- FROM public.captures c
-- JOIN public.notes n ON n.capture_id = c.id
-- WHERE c.text_path IS NOT NULL;

-- ============================================================================
-- STEP 4: Enable Row Level Security
-- ============================================================================

ALTER TABLE public.notes_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.text_inputs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for notes_new
DROP POLICY IF EXISTS "own_notes_new" ON public.notes_new;
CREATE POLICY "own_notes_new" ON public.notes_new
  FOR ALL 
  USING (auth.uid() = user_id) 
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies for audio_files
DROP POLICY IF EXISTS "own_audio_files" ON public.audio_files;
CREATE POLICY "own_audio_files" ON public.audio_files
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.notes_new n 
      WHERE n.id = note_id AND n.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes_new n 
      WHERE n.id = note_id AND n.user_id = auth.uid()
    )
  );

-- RLS Policies for transcripts_new
DROP POLICY IF EXISTS "own_transcripts_new" ON public.transcripts_new;
CREATE POLICY "own_transcripts_new" ON public.transcripts_new
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.audio_files af
      JOIN public.notes_new n ON af.note_id = n.id
      WHERE af.id = audio_file_id AND n.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.audio_files af
      JOIN public.notes_new n ON af.note_id = n.id
      WHERE af.id = audio_file_id AND n.user_id = auth.uid()
    )
  );

-- RLS Policies for text_inputs
DROP POLICY IF EXISTS "own_text_inputs" ON public.text_inputs;
CREATE POLICY "own_text_inputs" ON public.text_inputs
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM public.notes_new n 
      WHERE n.id = note_id AND n.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notes_new n 
      WHERE n.id = note_id AND n.user_id = auth.uid()
    )
  );

-- ============================================================================
-- STEP 5: Update triggers
-- ============================================================================

-- Trigger to automatically update updated_at timestamp on notes_new
DROP TRIGGER IF EXISTS notes_new_touch ON public.notes_new;
CREATE TRIGGER notes_new_touch 
  BEFORE UPDATE ON public.notes_new 
  FOR EACH ROW 
  EXECUTE FUNCTION touch_updated_at();

-- ============================================================================
-- STEP 6: Drop old tables (CAREFUL - only after migrating data!)
-- ============================================================================

-- IMPORTANT: Only uncomment these after verifying data migration!
DROP TABLE IF EXISTS public.notes CASCADE;
DROP TABLE IF EXISTS public.transcripts CASCADE;
DROP TABLE IF EXISTS public.captures CASCADE;

-- ============================================================================
-- STEP 7: Rename new tables to final names (after dropping old tables)
-- ============================================================================

-- IMPORTANT: Only run after dropping old tables!
ALTER TABLE public.notes_new RENAME TO notes;
ALTER TABLE public.transcripts_new RENAME TO transcripts;

Rename indexes
ALTER INDEX notes_new_user_id_idx RENAME TO notes_user_id_idx;
ALTER INDEX notes_new_created_at_idx RENAME TO notes_created_at_idx;
ALTER INDEX notes_new_tags_idx RENAME TO notes_tags_idx;
ALTER INDEX notes_new_title_idx RENAME TO notes_title_idx;
ALTER INDEX notes_new_content_idx RENAME TO notes_content_idx;
ALTER INDEX transcripts_new_text_idx RENAME TO transcripts_text_idx;

Rename policies
ALTER POLICY "own_notes_new" ON public.notes RENAME TO "own_notes";
ALTER POLICY "own_transcripts_new" ON public.transcripts RENAME TO "own_transcripts";

Rename trigger
ALTER TRIGGER notes_new_touch ON public.notes RENAME TO notes_touch;

-- ============================================================================
-- Summary of Changes
-- ============================================================================

-- New Structure:
-- 1. notes - Primary entity, standalone (no capture_id)
-- 2. audio_files - Multiple per note
-- 3. transcripts - One per audio_file
-- 4. text_inputs - Multiple per note

-- Key Benefits:
-- - Notes can have multiple audio files
-- - Text content is always editable (content_text field)
-- - Better separation of concerns
-- - More flexible for future features

