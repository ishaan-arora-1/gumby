-- Gumby AI - UGC Templates + Jobs (MakeUGC-style)
-- Apply via Supabase SQL Editor (idempotent — safe to re-run).

CREATE TABLE IF NOT EXISTS ugc_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_avatar_url TEXT,
    description TEXT NOT NULL DEFAULT '',
    setting TEXT NOT NULL DEFAULT '',
    video_url TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    sample_script TEXT NOT NULL DEFAULT '',
    voice_id TEXT NOT NULL DEFAULT 'Rachel',
    aspect_ratio TEXT NOT NULL DEFAULT '9:16',
    duration_seconds INT NOT NULL DEFAULT 15,
    tags TEXT[] DEFAULT '{}',
    category TEXT NOT NULL DEFAULT 'lifestyle',
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_templates_active ON ugc_templates(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_ugc_templates_category ON ugc_templates(category);

ALTER TABLE ugc_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view ugc templates" ON ugc_templates;
CREATE POLICY "Anyone can view ugc templates" ON ugc_templates
    FOR SELECT USING (true);

CREATE TABLE IF NOT EXISTS ugc_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES ugc_templates(id) ON DELETE RESTRICT,
    template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    product_name TEXT NOT NULL DEFAULT '',
    product_image_url TEXT,
    product_description TEXT NOT NULL DEFAULT '',
    script TEXT NOT NULL DEFAULT '',
    voice_id TEXT NOT NULL DEFAULT 'Rachel',
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued','tts','lipsync','finalizing','completed','failed')),
    progress INT NOT NULL DEFAULT 0,
    error TEXT,
    audio_url TEXT,
    output_video_url TEXT,
    output_thumbnail_url TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_jobs_user_id ON ugc_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ugc_jobs_status ON ugc_jobs(status);

ALTER TABLE ugc_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own ugc jobs" ON ugc_jobs;
CREATE POLICY "Users can view own ugc jobs" ON ugc_jobs FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own ugc jobs" ON ugc_jobs;
CREATE POLICY "Users can create own ugc jobs" ON ugc_jobs FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own ugc jobs" ON ugc_jobs;
CREATE POLICY "Users can update own ugc jobs" ON ugc_jobs FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own ugc jobs" ON ugc_jobs;
CREATE POLICY "Users can delete own ugc jobs" ON ugc_jobs FOR DELETE USING (auth.uid() = user_id);

-- NOTE: template content (videos + thumbnails + actors) is no longer seeded
-- here. After applying this migration, run `npm run gen:templates` from the
-- backend folder to AI-generate the entire catalog using fal.ai (Flux for the
-- portrait + Kling 2.5 for the talking-head video) and mirror everything to
-- our Supabase Storage bucket. The block below is left as a no-op fallback
-- in case fal.ai is unavailable, but the seed URLs do NOT play (Pexels blocks
-- direct hot-linking) — they exist only so the API doesn't 500 on an empty
-- catalog.
INSERT INTO ugc_templates (name, actor_name, actor_avatar_url, description, setting, video_url, thumbnail_url, sample_script, voice_id, aspect_ratio, duration_seconds, tags, category, sort_order)
SELECT * FROM (VALUES
    ('Honest Review', 'Maya',
     'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Confident young creator giving a casual review look-to-camera.',
     'Bedroom with soft natural light',
     'https://videos.pexels.com/video-files/8088924/8088924-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=600',
     'Okay so I have been using this for about a week and I genuinely cannot stop thinking about it.',
     'Rachel', '9:16', 12, ARRAY['review','female','gen-z','bedroom'], 'review', 1),
    ('Get Ready With Me', 'Sienna',
     'https://images.pexels.com/photos/733872/pexels-photo-733872.jpeg?auto=compress&cs=tinysrgb&w=400',
     'GRWM-style mirror chat about the product.',
     'Vanity mirror, golden hour',
     'https://videos.pexels.com/video-files/4587889/4587889-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/733872/pexels-photo-733872.jpeg?auto=compress&cs=tinysrgb&w=600',
     'Get ready with me while I tell you about the only thing I have been reaching for lately.',
     'Bella', '9:16', 14, ARRAY['grwm','female','beauty','warm'], 'beauty', 2),
    ('Coffee Shop Hot Take', 'Jordan',
     'https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Casual cafe hot-take, leaning in close to camera.',
     'Cozy cafe with soft jazz',
     'https://videos.pexels.com/video-files/7691793/7691793-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?auto=compress&cs=tinysrgb&w=600',
     'I am not joking when I tell you this completely changed my morning routine.',
     'Adam', '9:16', 13, ARRAY['lifestyle','male','cafe','hot-take'], 'lifestyle', 3),
    ('Gym Locker Confession', 'Kai',
     'https://images.pexels.com/photos/1431282/pexels-photo-1431282.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Post-workout sweaty pep-talk about the product.',
     'Gym locker room, fluorescent lighting',
     'https://videos.pexels.com/video-files/6740006/6740006-hd_1080_1920_30fps.mp4',
     'https://images.pexels.com/photos/1431282/pexels-photo-1431282.jpeg?auto=compress&cs=tinysrgb&w=600',
     'Real talk — if you are not using this yet you are leaving gains on the table.',
     'Antoni', '9:16', 15, ARRAY['fitness','male','gym','confession'], 'fitness', 4),
    ('Cozy Couch Story Time', 'Rae',
     'https://images.pexels.com/photos/3812944/pexels-photo-3812944.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Wholesome couch chat about a personal discovery.',
     'Couch with warm fairy lights',
     'https://videos.pexels.com/video-files/4587915/4587915-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/3812944/pexels-photo-3812944.jpeg?auto=compress&cs=tinysrgb&w=600',
     'So I have a little story for you and you are going to want to hear this one.',
     'Domi', '9:16', 16, ARRAY['storytime','female','cozy','warm'], 'storytime', 5),
    ('Office Desk Discovery', 'Theo',
     'https://images.pexels.com/photos/2102587/pexels-photo-2102587.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Polished work-from-home desk reveal of the product.',
     'Modern desk with monitor glow',
     'https://videos.pexels.com/video-files/8088925/8088925-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/2102587/pexels-photo-2102587.jpeg?auto=compress&cs=tinysrgb&w=600',
     'I have tried every productivity hack in the book and none come close to this.',
     'Sam', '9:16', 14, ARRAY['work','male','desk','professional'], 'productivity', 6)
) AS v(name, actor_name, actor_avatar_url, description, setting, video_url, thumbnail_url, sample_script, voice_id, aspect_ratio, duration_seconds, tags, category, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM ugc_templates LIMIT 1);

-- Storage bucket for generated videos (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('ugc-videos', 'ugc-videos', false)
ON CONFLICT (id) DO NOTHING;
