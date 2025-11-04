# Testing Guide - Text Notes Upload Feature

This guide covers complete testing steps for the new text notes upload functionality alongside audio uploads.

## Prerequisites

1. **Supabase Project** - Set up with credentials configured
2. **Environment Variables** - `.env.local` configured with:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`
   - `UPSTASH_REDIS_REST_URL` (optional, for rate limiting)
   - `UPSTASH_REDIS_REST_TOKEN` (optional)

3. **Dependencies** - Install with `npm install`

---

## Step 1: Database Migration

Run the updated migration in your Supabase SQL Editor:

1. Go to Supabase Dashboard → **SQL Editor**
2. Copy the contents of `migrations/001_initial_schema.sql`
3. Paste and run the migration
4. Verify the changes:
   ```sql
   -- Check that captures table has text_path column
   SELECT column_name, data_type, is_nullable
   FROM information_schema.columns
   WHERE table_name = 'captures'
   AND column_name IN ('audio_path', 'text_path');
   
   -- Should show:
   -- audio_path | text | YES
   -- text_path  | text | YES
   ```

---

## Step 2: Storage Buckets Setup

### Verify Audio Bucket

1. Go to Supabase Dashboard → **Storage**
2. Verify `audio` bucket exists:
   - Name: `audio`
   - Public: **No** (Private)
   - File size limit: 50MB
   - Allowed MIME types: `audio/webm`, `audio/m4a`, `audio/mp4`, `audio/mpeg`, `audio/wav`

### Create Notes Bucket

1. Go to Supabase Dashboard → **Storage** → **New Bucket**
2. Create bucket with:
   - **Name**: `notes`
   - **Public**: **No** (Private)
   - **File size limit**: 10MB
   - **Allowed MIME types**: `text/plain`, `text/markdown`

3. Verify bucket policies are created (from migration):
   - Authenticated users can upload notes
   - Authenticated users can read notes
   - Authenticated users can update notes
   - Authenticated users can delete notes

---

## Step 3: Authentication Setup

### Get Auth Token

You'll need a Supabase auth token for testing. Choose one method:

**Option A: Using Supabase Dashboard**
1. Go to **Authentication** → **Users**
2. Create a test user or use existing
3. Get the user's JWT token (for testing, you can use the service role)

**Option B: Using Supabase Client (Recommended)**
```bash
# In your project root, create a test script
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);
supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'your-password'
}).then(({ data }) => {
  console.log('Token:', data.session?.access_token);
});
"
```

**Option C: Using curl (if you have credentials)**
```bash
curl -X POST 'https://YOUR_PROJECT.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "your-password"
  }'
```

Save the token as `TOKEN` for use in subsequent steps.

---

## Step 4: Manual API Testing

### Test 1: Audio Upload (Existing Functionality)

#### 4.1.1 Request Presigned URL for Audio

```bash
curl -X POST http://localhost:3000/api/capture/presign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test-audio.webm",
    "mime": "audio/webm",
    "duration_s": 60
  }'
```

**Expected Response:**
```json
{
  "uploadUrl": "https://xxxxx.supabase.co/storage/v1/object/audio/...",
  "storageKey": "abc123-test-audio.webm"
}
```

**Verify:**
- ✅ Status: 200
- ✅ `uploadUrl` is a valid Supabase storage URL
- ✅ `storageKey` contains the filename
- ✅ Bucket used is `audio`

#### 4.1.2 Upload Audio File

```bash
# Save the uploadUrl from previous step
UPLOAD_URL="<uploadUrl_from_response>"

# Upload a test audio file (create a small test file if needed)
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: audio/webm" \
  --data-binary @path/to/your/audio.webm
```

**Expected Response:**
- ✅ Status: 200 (or similar success)

#### 4.1.3 Commit Audio Upload

```bash
STORAGE_KEY="<storageKey_from_presign_response>"

curl -X POST http://localhost:3000/api/capture/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "'$STORAGE_KEY'",
    "duration_s": 60,
    "mime": "audio/webm"
  }'
```

**Expected Response (for ≤120s):**
```json
{
  "captureId": "uuid",
  "noteId": "uuid"
}
```

**Verify:**
- ✅ Status: 200
- ✅ Both `captureId` and `noteId` are UUIDs
- ✅ Check database: `captures` table has record with `audio_path` set
- ✅ Check database: `notes` table has record
- ✅ Check database: `transcripts` table has record (audio was transcribed)

#### 4.1.4 Verify Note Created

```bash
NOTE_ID="<noteId_from_commit_response>"

curl -X GET http://localhost:3000/api/note/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "id": "uuid",
  "title": "...",
  "editor_json": {...},
  "outline_json": {...},
  "tags": [...],
  "created_at": "...",
  "updated_at": "...",
  "capture_id": "uuid"
}
```

---

### Test 2: Text Notes Upload (New Functionality)

#### 4.2.1 Request Presigned URL for Text

```bash
curl -X POST http://localhost:3000/api/capture/presign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "my-notes.txt",
    "mime": "text/plain"
  }'
```

**Expected Response:**
```json
{
  "uploadUrl": "https://xxxxx.supabase.co/storage/v1/object/notes/...",
  "storageKey": "xyz789-my-notes.txt"
}
```

**Verify:**
- ✅ Status: 200
- ✅ `uploadUrl` points to `notes` bucket (not `audio`)
- ✅ `storageKey` contains the filename

#### 4.2.2 Upload Text File

```bash
# Save the uploadUrl from previous step
UPLOAD_URL="<uploadUrl_from_response>"

# Create a test text file
echo "This is a test note. It contains important information that should be structured and organized." > test-note.txt

# Upload the text file
curl -X PUT "$UPLOAD_URL" \
  -H "Content-Type: text/plain" \
  --data-binary @test-note.txt
```

**Expected Response:**
- ✅ Status: 200 (or similar success)

#### 4.2.3 Commit Text Upload

```bash
STORAGE_KEY="<storageKey_from_presign_response>"

curl -X POST http://localhost:3000/api/capture/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "'$STORAGE_KEY'",
    "mime": "text/plain"
  }'
```

**Expected Response:**
```json
{
  "captureId": "uuid",
  "noteId": "uuid"
}
```

**Verify:**
- ✅ Status: 200
- ✅ Both `captureId` and `noteId` are UUIDs
- ✅ Check database: `captures` table has record with `text_path` set (not `audio_path`)
- ✅ Check database: `notes` table has record
- ✅ Check database: `transcripts` table should NOT have record (text notes skip transcription)

#### 4.2.4 Verify Text Note Created

```bash
NOTE_ID="<noteId_from_commit_response>"

curl -X GET http://localhost:3000/api/note/$NOTE_ID \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "id": "uuid",
  "title": "...",
  "editor_json": {...},
  "outline_json": {...},
  "tags": [...],
  "created_at": "...",
  "updated_at": "...",
  "capture_id": "uuid"
}
```

**Verify:**
- ✅ Note contains the text content (structured)
- ✅ Title is generated from the text
- ✅ Tags are assigned appropriately

---

### Test 3: Edge Cases

#### 4.3.1 Invalid MIME Type for Text

```bash
curl -X POST http://localhost:3000/api/capture/presign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.txt",
    "mime": "text/invalid"
  }'
```

**Expected Response:**
- ✅ Status: 400 (Validation Error)

#### 4.3.2 Markdown File Upload

```bash
# Create a markdown file
cat > test.md << EOF
# My Notes

## Important Points
- Point 1
- Point 2

## Next Steps
1. Do this
2. Do that
EOF

# Presign
curl -X POST http://localhost:3000/api/capture/presign \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.md",
    "mime": "text/markdown"
  }'
```

**Expected Response:**
- ✅ Status: 200
- ✅ Upload and commit should work
- ✅ Note should be created with structured content

#### 4.3.3 Missing MIME Type (Should Default to Audio)

```bash
curl -X POST http://localhost:3000/api/capture/commit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storageKey": "some-key.webm"
  }'
```

**Expected Response:**
- ✅ Status: 200 (defaults to audio processing)
- ✅ `audio_path` is set in database

---

## Step 5: Database Verification

### Check Captures Table

```sql
-- View all captures
SELECT 
  id,
  user_id,
  audio_path,
  text_path,
  duration_s,
  language,
  created_at
FROM captures
ORDER BY created_at DESC
LIMIT 10;
```

**Verify:**
- ✅ Audio captures have `audio_path` set, `text_path` is NULL
- ✅ Text captures have `text_path` set, `audio_path` is NULL
- ✅ No records have both paths set (constraint check)
- ✅ No records have neither path set (constraint check)

### Check Storage Buckets

```sql
-- Check audio bucket
SELECT name, bucket_id, created_at
FROM storage.objects
WHERE bucket_id = 'audio'
ORDER BY created_at DESC
LIMIT 5;

-- Check notes bucket
SELECT name, bucket_id, created_at
FROM storage.objects
WHERE bucket_id = 'notes'
ORDER BY created_at DESC
LIMIT 5;
```

**Verify:**
- ✅ Audio files are in `audio` bucket
- ✅ Text files are in `notes` bucket
- ✅ No cross-contamination

### Check Transcripts Table

```sql
-- Transcripts should only exist for audio captures
SELECT 
  t.capture_id,
  c.audio_path,
  c.text_path,
  LENGTH(t.text) as text_length
FROM transcripts t
JOIN captures c ON t.capture_id = c.id
ORDER BY t.capture_id DESC
LIMIT 10;
```

**Verify:**
- ✅ All transcripts have corresponding `audio_path` (not `text_path`)
- ✅ No transcripts for text-only captures

---

## Step 6: Automated Tests

### Run Unit Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

### Verify Test Coverage

The existing tests should still pass. Check:
- ✅ `tests/api/presign.test.ts` - Should work with both audio and text
- ✅ `tests/api/commit.test.ts` - Should handle both types
- ✅ `tests/api/note.test.ts` - Should work with notes from both sources

### Add New Tests for Text Notes

You may want to add specific tests for text notes:

```typescript
// tests/api/presign.test.ts - Add test case
it('should return signed URL for text notes', async () => {
  const request = new Request('http://localhost/api/capture/presign', {
    method: 'POST',
    body: JSON.stringify({
      filename: 'test.txt',
      mime: 'text/plain',
    }),
  });

  const response = await POST(request);
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data.uploadUrl).toContain('notes'); // Should use notes bucket
  expect(data.storageKey).toContain('test.txt');
});
```

---

## Step 7: Integration Testing

### Full Flow Test: Audio + Text

1. **Upload Audio** → Get note
2. **Upload Text** → Get note
3. **Verify both notes exist** and are accessible
4. **Search for notes** - Verify both appear in search results

```bash
# Search should return both audio and text notes
curl -X GET "http://localhost:3000/api/search?q=test" \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "items": [
    {
      "id": "...",
      "title": "...",
      "tags": [...],
      "created_at": "..."
    },
    ...
  ]
}
```

**Verify:**
- ✅ Both audio and text notes appear in search results
- ✅ Both can be retrieved by ID
- ✅ Both can be updated via PATCH

---

## Step 8: Error Handling Tests

### Test Invalid Scenarios

1. **Missing filename:**
   ```bash
   curl -X POST http://localhost:3000/api/capture/presign \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"mime": "text/plain"}'
   ```
   - ✅ Status: 400

2. **Invalid MIME type:**
   ```bash
   curl -X POST http://localhost:3000/api/capture/presign \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"filename": "test.txt", "mime": "application/json"}'
   ```
   - ✅ Status: 400

3. **Unauthorized access:**
   ```bash
   curl -X POST http://localhost:3000/api/capture/presign \
     -H "Content-Type: application/json" \
     -d '{"filename": "test.txt", "mime": "text/plain"}'
   ```
   - ✅ Status: 401

4. **Invalid storage key:**
   ```bash
   curl -X POST http://localhost:3000/api/capture/commit \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"storageKey": "nonexistent-key"}'
   ```
   - ✅ Status: 500 (processing will fail)

---

## Step 9: Performance Testing

### Test Processing Speed

1. **Audio Processing:**
   - Upload a 60-second audio file
   - Measure time from commit to note creation
   - Expected: ~10-15 seconds (transcription + structuring)

2. **Text Processing:**
   - Upload a 10KB text file
   - Measure time from commit to note creation
   - Expected: ~2-5 seconds (no transcription, just structuring)

### Test Concurrent Uploads

```bash
# Upload multiple files simultaneously
for i in {1..5}; do
  # Audio upload
  curl -X POST http://localhost:3000/api/capture/presign \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"filename\": \"audio-$i.webm\", \"mime\": \"audio/webm\"}" &
  
  # Text upload
  curl -X POST http://localhost:3000/api/capture/presign \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"filename\": \"text-$i.txt\", \"mime\": \"text/plain\"}" &
done

wait
```

**Verify:**
- ✅ All requests succeed
- ✅ No rate limit errors (if within limits)
- ✅ All files are stored correctly

---

## Step 10: Cleanup

### Remove Test Data

```sql
-- Delete test captures (will cascade to transcripts and notes)
DELETE FROM captures 
WHERE created_at > NOW() - INTERVAL '1 hour'
AND user_id = 'your-test-user-id';

-- Or delete specific captures
DELETE FROM captures WHERE id = 'capture-id';
```

### Verify Cleanup

```sql
-- Check that associated records are deleted (cascade)
SELECT COUNT(*) FROM transcripts WHERE capture_id = 'deleted-capture-id';
-- Should return 0

SELECT COUNT(*) FROM notes WHERE capture_id = 'deleted-capture-id';
-- Should return 0
```

---

## Troubleshooting

### Common Issues

1. **"Failed to create upload URL"**
   - Check storage bucket exists and is configured correctly
   - Verify bucket policies allow authenticated uploads
   - Check Supabase credentials

2. **"Capture not found" during processing**
   - Verify capture record was created in database
   - Check RLS policies allow user to read their captures

3. **"Failed to download file"**
   - Verify file was uploaded successfully
   - Check storage bucket policies allow read access
   - Verify file path matches storage key

4. **Text note not being processed**
   - Check `text_path` is set in captures table
   - Verify `notes` bucket exists and is accessible
   - Check process logic handles text_path correctly

5. **Rate limit errors**
   - Check Upstash Redis configuration
   - Verify rate limit keys are correct
   - Wait for rate limit window to reset

---

## Success Criteria

✅ **Database:**
- Captures table has `text_path` column
- Audio captures use `audio_path`, text captures use `text_path`
- Constraint prevents both/n either paths

✅ **Storage:**
- `audio` bucket exists for audio files
- `notes` bucket exists for text files
- Both buckets have proper policies

✅ **API:**
- Presign endpoint accepts both audio and text MIME types
- Presign returns correct bucket URLs
- Commit endpoint handles both audio and text
- Process logic skips transcription for text notes

✅ **Functionality:**
- Audio uploads work as before
- Text notes can be uploaded and processed
- Text notes skip transcription step
- Both types create structured notes
- Both types are searchable and accessible

---

## Next Steps

After successful testing:

1. **Update Frontend** - Add UI for text note uploads
2. **Add Tests** - Create automated tests for text note flow
3. **Documentation** - Update API docs with text note examples
4. **Monitoring** - Set up logging for text vs audio processing
5. **Performance** - Monitor processing times for both types

---

## Summary Checklist

- [ ] Database migration run successfully
- [ ] Storage buckets created (`audio` and `notes`)
- [ ] Audio upload tested and working
- [ ] Text note upload tested and working
- [ ] Database verification passed
- [ ] Edge cases tested
- [ ] Error handling verified
- [ ] Automated tests passing
- [ ] Integration tests passing
- [ ] Performance acceptable
- [ ] Cleanup completed

