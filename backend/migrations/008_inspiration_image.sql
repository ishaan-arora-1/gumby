-- Inspiration image flow: the user can upload a reference photo describing
-- the *scene* they want (a girl in a car, a guy in a gym, etc.). We pass it
-- through an image-to-image model (Flux Kontext Pro) to recreate the same
-- scene with a *new* creator matching the prompt, then feed that synthesized
-- still into Kling 3.0 Pro image-to-video as the seed frame.
--
-- Idempotent — safe to re-run.

-- User-uploaded inspiration photo (signed Supabase Storage URL).
ALTER TABLE ugc_jobs
    ADD COLUMN IF NOT EXISTS inspiration_image_url TEXT;

-- Synthesized creator-in-scene frame produced by Flux Kontext from the
-- inspiration image + creator description. This is what we hand to Kling
-- 3.0 Pro as the seed image. Cached on the job so a retry doesn't burn
-- another Kontext call.
ALTER TABLE ugc_jobs
    ADD COLUMN IF NOT EXISTS creator_scene_image_url TEXT;

-- Extend the status check constraint to allow the new pipeline states.
-- Postgres can't ALTER an existing CHECK constraint in place, so we drop +
-- re-add. Wrapped in DO so a missing constraint name doesn't break re-runs.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'ugc_jobs'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%status%'
    ) THEN
        ALTER TABLE ugc_jobs DROP CONSTRAINT IF EXISTS ugc_jobs_status_check;
    END IF;
END$$;

ALTER TABLE ugc_jobs
    ADD CONSTRAINT ugc_jobs_status_check
    CHECK (status IN (
        'queued',
        'planning',
        'preparing',
        'rendering_scene',
        'generating_video',
        'generating_scenes',
        'stitching',
        'tts',
        'lipsync',
        'broll',
        'finalizing',
        'completed',
        'failed'
    ));
