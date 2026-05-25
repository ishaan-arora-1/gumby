-- Scene-based pipeline: stores the user's video description and duration
-- so the backend can decompose it into scenes and generate via Kling 3.0 Pro.
ALTER TABLE ugc_jobs ADD COLUMN IF NOT EXISTS video_description text;
ALTER TABLE ugc_jobs ADD COLUMN IF NOT EXISTS video_duration integer DEFAULT 10;
