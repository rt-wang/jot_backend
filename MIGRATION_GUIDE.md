# Migration Guide: Note-Centric Schema

This guide walks you through migrating from the capture-centric model to the new note-centric model.

## Overview of Changes

### Old Model (Capture-Centric)
```
captures (audio OR text) → transcripts → notes
- 1:1 relationship
- Capture is created first, note is output
```

### New Model (Note-Centric)
```
notes ← audio_files → transcripts
notes ← text_inputs
- 1:many relationship
- Note is primary entity, inputs contribute to it
```

---

## Part 1: Supabase Database Migration

### Option A: Fresh Start (Recommended for Development)

If you're okay with losing existing data:

1. **Go to Supabase Dashboard → SQL Editor**

2. **Drop old tables:**
   ```sql
   DROP TABLE IF EXISTS public.notes CASCADE;
   DROP TABLE IF EXISTS public.transcripts CASCADE;
   DROP TABLE IF EXISTS public.captures CASCADE;
   ```

3. **Run the new migration:**
   - Copy the contents of `migrations/002_restructure_notes.sql`
   - Paste in SQL Editor
   - Comment out Step 3 (data migration) since you're starting fresh
   - Uncomment Steps 6 & 7 (drop old tables and rename)
   - Run the migration

4. **Verify tables exist:**
   ```sql
   SELECT table_name 
   FROM information_schema.tables 
   WHERE table_schema = 'public' 
   AND table_name IN ('notes', 'audio_files', 'transcripts', 'text_inputs');
   ```

### Option B: Migrate Existing Data (Production)

If you need to preserve existing data:

1. **Go to Supabase Dashboard → SQL Editor**

2. **Run the new migration AS-IS:**
   - Copy `migrations/002_restructure_notes.sql`
   - Keep Step 3 (data migration) uncommented
   - Keep Steps 6 & 7 commented out
   - Run the migration

3. **Verify data migration:**
   ```sql
   -- Check notes were migrated
   SELECT COUNT(*) FROM public.notes_new;
   
   -- Check audio files were migrated
   SELECT COUNT(*) FROM public.audio_files;
   
   -- Check transcripts were migrated
   SELECT COUNT(*) FROM public.transcripts_new;
   
   -- Verify relationships
   SELECT 
     n.id,
     n.title,
     COUNT(DISTINCT af.id) as audio_count,
     COUNT(DISTINCT ti.id) as text_count
   FROM notes_new n
   LEFT JOIN audio_files af ON af.note_id = n.id
   LEFT JOIN text_inputs ti ON ti.note_id = n.id
   GROUP BY n.id, n.title;
   ```

4. **After verification, drop old tables and rename:**
   ```sql
   -- Drop old tables
   DROP TABLE IF EXISTS public.notes CASCADE;
   DROP TABLE IF EXISTS public.transcripts CASCADE;
   DROP TABLE IF EXISTS public.captures CASCADE;
   
   -- Rename new tables
   ALTER TABLE public.notes_new RENAME TO notes;
   ALTER TABLE public.transcripts_new RENAME TO transcripts;
   
   -- Rename indexes
   ALTER INDEX notes_new_user_id_idx RENAME TO notes_user_id_idx;
   ALTER INDEX notes_new_created_at_idx RENAME TO notes_created_at_idx;
   ALTER INDEX notes_new_tags_idx RENAME TO notes_tags_idx;
   ALTER INDEX notes_new_title_idx RENAME TO notes_title_idx;
   ALTER INDEX notes_new_content_idx RENAME TO notes_content_idx;
   ALTER INDEX transcripts_new_text_idx RENAME TO transcripts_text_idx;
   
   -- Rename policies
   ALTER POLICY "own_notes_new" ON public.notes RENAME TO "own_notes";
   ALTER POLICY "own_transcripts_new" ON public.transcripts RENAME TO "own_transcripts";
   
   -- Rename trigger
   ALTER TRIGGER notes_new_touch ON public.notes RENAME TO notes_touch;
   ```

---

## Part 2: Storage Buckets

Your existing storage buckets remain the same:

- ✅ `audio` bucket - Already exists, no changes needed
- ✅ `notes` bucket - Already exists, no changes needed

**Verify in Supabase Dashboard → Storage:**
- Both buckets should be private
- Policies should allow authenticated users to upload/read/update/delete

---

## Part 3: API Changes

### Removed Endpoints

❌ **Old:** `POST /api/capture/presign` - No longer needed  
❌ **Old:** `POST /api/capture/commit` - No longer needed

### New Endpoints

✅ **New:** `POST /api/notes` - Create a new note  
✅ **New:** `POST /api/notes/:id/audio` - Add audio to existing note  
✅ **New:** `POST /api/notes/:id/text` - Add text to existing note  
✅ **Updated:** `GET /api/notes/:id` - Now includes audio files and text inputs  
✅ **Updated:** `PATCH /api/notes/:id` - Still updates note properties

---

## Part 4: Testing the New API

### Step 1: Create a Note

```bash
# Create an empty note
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "My First Note",
    "content_text": "Initial content"
  }'

# Response:
# {
#   "id": "note-uuid",
#   "title": "My First Note",
#   "content_text": "Initial content",
#   "editor_json": {...},
#   "tags": [],
#   "created_at": "...",
#   "updated_at": "..."
# }
```

Save the `note-uuid` for the next steps.

### Step 2: Add Audio to Note

```bash
NOTE_ID="<note-uuid-from-step-1>"

# Request presigned URL for audio
curl -X POST http://localhost:3000/api/notes/$NOTE_ID/audio \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "recording.webm",
    "mime": "audio/webm",
    "duration_s": 60
  }'

# Response:
# {
#   "uploadUrl": "https://...",
#   "storageKey": "abc123-recording.webm"
# }

# Upload the audio file
UPLOAD_URL="<uploadUrl-from-response>"
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: audio/webm" \
  --data-binary @your-audio.webm

# Commit the audio (triggers transcription & processing)
STORAGE_KEY="<storageKey-from-response>"
curl -X POST http://localhost:3000/api/notes/$NOTE_ID/audio/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "'$STORAGE_KEY'",
    "duration_s": 60
  }'

# Response:
# {
#   "audioFileId": "audio-uuid",
#   "noteId": "note-uuid",
#   "transcribed": true
# }
```

### Step 3: Add Text to Note

```bash
NOTE_ID="<note-uuid>"

# Request presigned URL for text
curl -X POST http://localhost:3000/api/notes/$NOTE_ID/text \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "notes.txt",
    "mime": "text/plain"
  }'

# Upload the text file
echo "Additional notes to add to the note" > notes.txt
UPLOAD_URL="<uploadUrl-from-response>"
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: text/plain" \
  --data-binary @notes.txt

# Commit the text (triggers processing)
STORAGE_KEY="<storageKey-from-response>"
curl -X POST http://localhost:3000/api/notes/$NOTE_ID/text/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "'$STORAGE_KEY'"
  }'

# Response:
# {
#   "textInputId": "text-uuid",
#   "noteId": "note-uuid"
# }
```

### Step 4: Get Complete Note

```bash
NOTE_ID="<note-uuid>"

curl -X GET http://localhost:3000/api/notes/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN"

# Response:
# {
#   "id": "note-uuid",
#   "title": "My First Note",
#   "content_text": "Updated content with audio transcript and text inputs",
#   "editor_json": {...},
#   "outline_json": {...},
#   "tags": ["work"],
#   "audio_files": [
#     {
#       "id": "audio-uuid",
#       "storage_path": "abc123-recording.webm",
#       "duration_s": 60,
#       "created_at": "...",
#       "transcript": {
#         "text": "Full transcript...",
#         "segments": [...]
#       }
#     }
#   ],
#   "text_inputs": [
#     {
#       "id": "text-uuid",
#       "storage_path": "xyz789-notes.txt",
#       "created_at": "..."
#     }
#   ],
#   "created_at": "...",
#   "updated_at": "..."
# }
```

### Step 5: Update Note Content

```bash
NOTE_ID="<note-uuid>"

curl -X PATCH http://localhost:3000/api/notes/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "content_text": "Manually edited content",
    "tags": ["work", "important"]
  }'

# Response:
# {
#   "ok": true
# }
```

---

## Part 5: Key Workflow Differences

### Old Workflow (Capture-Centric)
1. Upload audio/text → Create capture
2. Process capture → Create note
3. Note is output, not editable

### New Workflow (Note-Centric)
1. **Create note** (can be empty)
2. **Add audio files** to note (multiple allowed)
   - Each audio → transcribed → contributes to note
3. **Add text inputs** to note (multiple allowed)
   - Each text → processed → contributes to note
4. **Edit note content** directly at any time
5. **Audio files and text inputs** are preserved as references

---

## Part 6: Database Verification

After running the migration, verify:

```sql
-- Check table structure
\d notes
\d audio_files
\d transcripts
\d text_inputs

-- Verify note has no capture_id (key difference!)
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'notes' 
AND column_name = 'capture_id';
-- Should return 0 rows

-- Check relationships
SELECT 
  n.id as note_id,
  n.title,
  COUNT(DISTINCT af.id) as audio_files_count,
  COUNT(DISTINCT ti.id) as text_inputs_count
FROM notes n
LEFT JOIN audio_files af ON af.note_id = n.id
LEFT JOIN text_inputs ti ON ti.note_id = n.id
GROUP BY n.id, n.title;
```

---

## Part 7: Cleanup Old Code

After migration is complete and tested:

### Backend Changes
- ✅ Delete `app/api/capture/` directory (old endpoints)
- ✅ Keep `app/api/notes/` directory (updated endpoints)
- ✅ Update `lib/server/process.ts` (new processing logic)
- ✅ Update `lib/validation.ts` (new schemas)
- ✅ Update `lib/supabase.ts` (new types)

### Frontend Changes (if applicable)
- Update API calls to use new endpoints
- Update UI to show multiple audio files per note
- Update note editing UI to work with `content_text`

---

## Part 8: Rollback Plan

If you need to rollback:

### Option A: Restore from backup
```sql
-- If you backed up before migration
pg_restore -d your_db backup.sql
```

### Option B: Manual rollback
```sql
-- Drop new tables
DROP TABLE IF EXISTS text_inputs CASCADE;
DROP TABLE IF EXISTS audio_files CASCADE;
DROP TABLE IF EXISTS transcripts_new CASCADE;
DROP TABLE IF EXISTS notes_new CASCADE;

-- Restore old tables from backup or re-run original migration
-- migrations/001_initial_schema.sql
```

---

## Summary Checklist

### Database Migration
- [ ] Backed up database (if production)
- [ ] Ran `002_restructure_notes.sql` migration
- [ ] Verified tables created (notes, audio_files, transcripts, text_inputs)
- [ ] Checked data migrated correctly (if applicable)
- [ ] Dropped old tables (captures, old notes, old transcripts)
- [ ] Renamed new tables to final names

### Storage Buckets
- [ ] Verified `audio` bucket exists
- [ ] Verified `notes` bucket exists
- [ ] Checked bucket policies are correct

### API Testing
- [ ] Tested `POST /api/notes` (create note)
- [ ] Tested `POST /api/notes/:id/audio` (add audio)
- [ ] Tested `POST /api/notes/:id/text` (add text)
- [ ] Tested `GET /api/notes/:id` (get note with all data)
- [ ] Tested `PATCH /api/notes/:id` (update note)

### Code Updates
- [ ] Updated TypeScript types
- [ ] Updated validation schemas
- [ ] Updated API endpoints
- [ ] Updated processing logic
- [ ] Updated tests
- [ ] Removed old capture endpoints

---

## Troubleshooting

### Issue: "relation notes_new does not exist"
**Solution:** Run the migration - the new tables haven't been created yet.

### Issue: "insert or update on table violates foreign key constraint"
**Solution:** Check that the note exists before adding audio/text inputs.

### Issue: "column capture_id does not exist"
**Solution:** Update your code to remove references to `capture_id` - notes no longer have this field.

### Issue: Old endpoints still being called
**Solution:** Update frontend/client code to use new endpoints. Old endpoints will be removed.

---

## Support

If you encounter issues:
1. Check SQL migration output for errors
2. Verify table structure with `\d table_name`
3. Check RLS policies with `\dp table_name`
4. Review application logs for API errors

---

## Next Steps

After successful migration:
1. Update frontend to use new API
2. Add UI for managing multiple audio files per note
3. Update documentation
4. Train users on new workflow
5. Monitor for issues in production

