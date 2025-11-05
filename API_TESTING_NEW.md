# API Testing Guide - Note-Centric Model

Complete testing guide for the new note-centric API.

## Prerequisites

1. **Auth Token**: Get a Supabase auth token (see MIGRATION_GUIDE.md)
2. **Server Running**: `npm run dev` on http://localhost:3000
3. **Database Migrated**: Run `migrations/002_restructure_notes.sql`

```bash
# Set your auth token
export TOKEN="your-supabase-jwt-token"
```

---

## Workflow 1: Create Note with Audio

### Step 1: Create a New Note

```bash
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Meeting Notes - Jan 2024",
    "content_text": "Initial notes before audio"
  }'
```

**Response:**
```json
{
  "id": "note-uuid",
  "user_id": "user-uuid",
  "title": "Meeting Notes - Jan 2024",
  "content_text": "Initial notes before audio",
  "editor_json": {
    "type": "doc",
    "content": [...]
  },
  "outline_json": null,
  "tags": [],
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z"
}
```

Save the `id` as `NOTE_ID`.

### Step 2: Request Presigned URL for Audio

```bash
NOTE_ID="<note-id-from-step-1>"

curl -X POST http://localhost:3000/api/notes/$NOTE_ID/audio \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "meeting-recording.webm",
    "mime": "audio/webm",
    "duration_s": 60
  }'
```

**Response:**
```json
{
  "uploadUrl": "https://xxxxx.supabase.co/storage/v1/object/audio/...",
  "storageKey": "abc123-meeting-recording.webm"
}
```

### Step 3: Upload Audio File

```bash
UPLOAD_URL="<uploadUrl-from-step-2>"

# Upload your audio file
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: audio/webm" \
  --data-binary @your-audio.webm
```

**Expected:** Status 200

### Step 4: Commit Audio (Triggers Transcription)

```bash
STORAGE_KEY="<storageKey-from-step-2>"

curl -X POST http://localhost:3000/api/notes/$NOTE_ID/audio/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "'$STORAGE_KEY'",
    "duration_s": 60
  }'
```

**Response:**
```json
{
  "audioFileId": "audio-file-uuid",
  "noteId": "note-uuid",
  "transcribed": true
}
```

### Step 5: Get Updated Note

```bash
curl -X GET http://localhost:3000/api/notes/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Response:**
```json
{
  "id": "note-uuid",
  "title": "Meeting Notes - Jan 2024",
  "content_text": "Initial notes before audio\n\nTranscribed audio content...",
  "editor_json": {...},
  "outline_json": {
    "title": "...",
    "highlights": [...],
    "insights": [...],
    "tags": ["work"]
  },
  "tags": ["work"],
  "audio_files": [
    {
      "id": "audio-file-uuid",
      "storage_path": "abc123-meeting-recording.webm",
      "duration_s": 60,
      "mime_type": "audio/webm",
      "created_at": "...",
      "order_index": 0,
      "transcript": {
        "text": "Full transcript...",
        "segments_json": [...]
      }
    }
  ],
  "text_inputs": [],
  "created_at": "...",
  "updated_at": "..."
}
```

---

## Workflow 2: Create Note with Text Input

### Step 1: Create Note

```bash
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Research Notes",
    "tags": ["study"]
  }'
```

Save the `id` as `NOTE_ID`.

### Step 2: Request Presigned URL for Text

```bash
NOTE_ID="<note-id-from-step-1>"

curl -X POST http://localhost:3000/api/notes/$NOTE_ID/text \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "research.txt",
    "mime": "text/plain"
  }'
```

**Response:**
```json
{
  "uploadUrl": "https://xxxxx.supabase.co/storage/v1/object/notes/...",
  "storageKey": "xyz789-research.txt"
}
```

### Step 3: Upload Text File

```bash
# Create text file
cat > research.txt << EOF
Key Research Findings:
- Finding 1: Important discovery
- Finding 2: Another insight
- Next steps: Follow-up experiments
EOF

UPLOAD_URL="<uploadUrl-from-step-2>"

curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: text/plain" \
  --data-binary @research.txt
```

### Step 4: Commit Text

```bash
STORAGE_KEY="<storageKey-from-step-2>"

curl -X POST http://localhost:3000/api/notes/$NOTE_ID/text/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "'$STORAGE_KEY'"
  }'
```

**Response:**
```json
{
  "textInputId": "text-input-uuid",
  "noteId": "note-uuid"
}
```

### Step 5: Get Updated Note

```bash
curl -X GET http://localhost:3000/api/notes/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Response includes:**
- Updated `content_text` with text input
- Structured `outline_json`
- `text_inputs` array with the uploaded file

---

## Workflow 3: Multiple Audio Files on One Note

### Create note and add first audio (Steps 1-4 from Workflow 1)

### Add Second Audio File

```bash
# Request presigned URL for second audio
curl -X POST http://localhost:3000/api/notes/$NOTE_ID/audio \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "follow-up-recording.webm",
    "mime": "audio/webm",
    "duration_s": 45
  }'

# Upload second audio
UPLOAD_URL_2="<uploadUrl-from-response>"
curl -X PUT "$UPLOAD_URL_2" \
  -H "Content-Type: audio/webm" \
  --data-binary @second-audio.webm

# Commit second audio
STORAGE_KEY_2="<storageKey-from-response>"
curl -X POST http://localhost:3000/api/notes/$NOTE_ID/audio/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "'$STORAGE_KEY_2'",
    "duration_s": 45
  }'
```

### Get Note with Multiple Audio Files

```bash
curl -X GET http://localhost:3000/api/notes/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Response shows:**
```json
{
  "audio_files": [
    {
      "id": "audio-1",
      "storage_path": "...",
      "order_index": 0,
      "transcript": {...}
    },
    {
      "id": "audio-2",
      "storage_path": "...",
      "order_index": 1,
      "transcript": {...}
    }
  ],
  "content_text": "Combined content from both audio files..."
}
```

---

## Workflow 4: Manual Note Editing

### Update Note Content

```bash
curl -X PATCH http://localhost:3000/api/notes/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Updated Title",
    "content_text": "Manually edited content - audio transcripts preserved separately",
    "tags": ["work", "important"]
  }'
```

**Response:**
```json
{
  "ok": true
}
```

**Note:** Audio files and their transcripts are preserved. The `content_text` can be edited independently.

---

## Workflow 5: Create Empty Note, Add Content Later

### Create Empty Note

```bash
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "New Project"
  }'
```

**Response:**
```json
{
  "id": "note-uuid",
  "title": "New Project",
  "content_text": null,
  "editor_json": {
    "type": "doc",
    "content": []
  },
  "tags": []
}
```

### Add Audio Later

Follow Steps 2-4 from Workflow 1 to add audio to this note.

### Add Text Later

Follow Steps 2-4 from Workflow 2 to add text to this note.

---

## Common Scenarios

### Scenario 1: Podcast Episode Notes

```bash
# Create note for episode
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Podcast Ep 42 - AI in Healthcare",
    "content_text": "Guest: Dr. Smith\nTopic: AI applications in medical diagnosis",
    "tags": ["creative", "health"]
  }'

# Add episode audio (full episode)
# ... upload steps ...

# Add additional notes as text
# ... upload research notes ...

# Result: Note with initial notes, full audio transcript, and research notes
```

### Scenario 2: Meeting with Multiple Recordings

```bash
# Create meeting note
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q1 Planning Meeting",
    "tags": ["work"]
  }'

# Add pre-meeting notes as text
# ... upload agenda.txt ...

# Add meeting recording part 1
# ... upload first-half.webm ...

# Add meeting recording part 2
# ... upload second-half.webm ...

# Add post-meeting action items as text
# ... upload action-items.txt ...

# Result: Comprehensive note with agenda, full meeting transcript, and action items
```

---

## Verification Checklist

### After Creating Note
- [ ] Note has ID
- [ ] Title is set correctly
- [ ] `content_text` matches input (or null if not provided)
- [ ] `audio_files` array is empty
- [ ] `text_inputs` array is empty

### After Adding Audio
- [ ] `audio_files` array has new entry
- [ ] `content_text` is updated with transcript
- [ ] `outline_json` is populated
- [ ] `transcript` is nested in audio_file object
- [ ] Database: `audio_files` table has record
- [ ] Database: `transcripts` table has record

### After Adding Text
- [ ] `text_inputs` array has new entry
- [ ] `content_text` is updated with text content
- [ ] `outline_json` is updated
- [ ] Database: `text_inputs` table has record

### After Manual Edit
- [ ] Note content is updated
- [ ] Audio files and transcripts are preserved
- [ ] Text inputs are preserved
- [ ] `updated_at` timestamp is newer

---

## Database Queries for Verification

```sql
-- View note with all related data
SELECT 
  n.id,
  n.title,
  LENGTH(n.content_text) as content_length,
  COUNT(DISTINCT af.id) as audio_count,
  COUNT(DISTINCT ti.id) as text_count
FROM notes n
LEFT JOIN audio_files af ON af.note_id = n.id
LEFT JOIN text_inputs ti ON ti.note_id = n.id
WHERE n.id = 'your-note-id'
GROUP BY n.id, n.title, n.content_text;

-- View all audio files for a note
SELECT 
  af.id,
  af.storage_path,
  af.duration_s,
  af.order_index,
  t.text IS NOT NULL as has_transcript
FROM audio_files af
LEFT JOIN transcripts t ON t.audio_file_id = af.id
WHERE af.note_id = 'your-note-id'
ORDER BY af.order_index;

-- View all text inputs for a note
SELECT id, storage_path, mime_type, created_at
FROM text_inputs
WHERE note_id = 'your-note-id'
ORDER BY created_at;
```

---

## Error Cases

### 1. Note Not Found

```bash
curl -X POST http://localhost:3000/api/notes/invalid-id/audio \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename": "test.webm", "mime": "audio/webm"}'
```

**Expected:** 404 Not Found

### 2. Invalid Note ID

```bash
curl -X GET http://localhost:3000/api/notes/not-a-uuid \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** 400 Bad Request

### 3. Unauthorized Access

```bash
# Try to access another user's note
curl -X GET http://localhost:3000/api/notes/someone-elses-note-id \
  -H "Authorization: Bearer $TOKEN"
```

**Expected:** 404 Not Found (RLS blocks access)

### 4. Missing Required Fields

```bash
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected:** 400 Bad Request (title required)

---

## Performance Testing

### Test 1: Note Creation Speed

```bash
time curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Performance Test"}'
```

**Expected:** < 500ms

### Test 2: Audio Processing Speed

Upload a 60-second audio file and measure time from commit to completion.

**Expected:** ~10-15 seconds (transcription + structuring)

### Test 3: Text Processing Speed

Upload a 10KB text file and measure time from commit to completion.

**Expected:** ~2-5 seconds (no transcription, just structuring)

### Test 4: Multiple Audio Files

Add 3 audio files to one note sequentially.

**Expected:** Each processes independently, note content accumulates

---

## Summary

The new note-centric API provides:

✅ **Flexible note creation** - Create empty, with text, or add content later  
✅ **Multiple inputs per note** - Add multiple audio files and text inputs  
✅ **Always editable** - Content can be manually edited at any time  
✅ **Preserved sources** - Original audio and text files are kept  
✅ **Progressive enhancement** - Each input adds to the note  

**Key Differences from Old API:**
- No more `POST /api/capture/*` endpoints
- Notes are created first, content added later
- Multiple audio files per note supported
- Audio files and text inputs are associated with notes, not standalone captures

