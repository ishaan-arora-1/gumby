-- Gumby AI — UGC Creator Jobs (text-to-video standalone creator generation)
-- Apply via Supabase SQL Editor (idempotent — safe to re-run).

-- The Models feed is curated; user-generated creators must not appear there
-- but they DO live in `ugc_templates` so that the existing /ugc/generate
-- pipeline (which requires a template_id FK) can reference them when a user
-- promotes one of their generated creators into a full UGC ad.
ALTER TABLE ugc_templates
    ADD COLUMN IF NOT EXISTS is_user_generated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ugc_templates
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_ugc_templates_user_generated
    ON ugc_templates(is_user_generated);
CREATE INDEX IF NOT EXISTS idx_ugc_templates_owner_user_id
    ON ugc_templates(owner_user_id);

CREATE TABLE IF NOT EXISTS ugc_creator_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    aspect_ratio TEXT NOT NULL DEFAULT '9:16',
    duration_seconds INT NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','generating','completed','failed')),
    progress INT NOT NULL DEFAULT 0,
    error TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    -- The hidden template row created when the user promotes this creator
    -- into a full UGC ad. NULL until the user actually opts to lip-sync a
    -- script onto this clip.
    template_id UUID REFERENCES ugc_templates(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_creator_jobs_user_id
    ON ugc_creator_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ugc_creator_jobs_status
    ON ugc_creator_jobs(status);

ALTER TABLE ugc_creator_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own ugc creator jobs" ON ugc_creator_jobs;
CREATE POLICY "Users can view own ugc creator jobs" ON ugc_creator_jobs
    FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own ugc creator jobs" ON ugc_creator_jobs;
CREATE POLICY "Users can create own ugc creator jobs" ON ugc_creator_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own ugc creator jobs" ON ugc_creator_jobs;
CREATE POLICY "Users can update own ugc creator jobs" ON ugc_creator_jobs
    FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own ugc creator jobs" ON ugc_creator_jobs;
CREATE POLICY "Users can delete own ugc creator jobs" ON ugc_creator_jobs
    FOR DELETE USING (auth.uid() = user_id);
