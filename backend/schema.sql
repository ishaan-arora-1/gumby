-- Gumby AI Database Schema
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    preferences JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'New Conversation',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_created_at ON conversations(created_at DESC);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL DEFAULT '',
    image_urls TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX idx_messages_created_at ON messages(created_at);

-- Posts table (Calendar)
CREATE TABLE IF NOT EXISTS posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_urls TEXT[] DEFAULT '{}',
    scheduled_date TIMESTAMPTZ NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('instagram', 'twitter', 'linkedin', 'tiktok', 'facebook')),
    status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'posted')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_scheduled_date ON posts(scheduled_date);

-- Models table (Explore)
CREATE TABLE IF NOT EXISTS models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    pose TEXT NOT NULL DEFAULT 'default',
    image_url TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Mood Boards table (Explore)
CREATE TABLE IF NOT EXISTS moodboards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    cover_url TEXT NOT NULL,
    image_urls TEXT[] NOT NULL DEFAULT '{}',
    category TEXT NOT NULL DEFAULT 'general',
    tags TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Saved Assets table (Library)
CREATE TABLE IF NOT EXISTS saved_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('model', 'moodboard', 'image')),
    asset_id TEXT NOT NULL,
    asset_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, asset_id)
);

CREATE INDEX idx_saved_assets_user_id ON saved_assets(user_id);
CREATE INDEX idx_saved_assets_type ON saved_assets(asset_type);

-- Row Level Security Policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE moodboards ENABLE ROW LEVEL SECURITY;

-- Users: users can read/update their own data
CREATE POLICY "Users can view own profile" ON users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users
    FOR UPDATE USING (auth.uid() = id);

-- Conversations: users can CRUD their own conversations
CREATE POLICY "Users can view own conversations" ON conversations
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create conversations" ON conversations
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations" ON conversations
    FOR DELETE USING (auth.uid() = user_id);

-- Messages: users can CRUD messages in their conversations
CREATE POLICY "Users can view messages in own conversations" ON messages
    FOR SELECT USING (
        conversation_id IN (
            SELECT id FROM conversations WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create messages in own conversations" ON messages
    FOR INSERT WITH CHECK (
        conversation_id IN (
            SELECT id FROM conversations WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete messages in own conversations" ON messages
    FOR DELETE USING (
        conversation_id IN (
            SELECT id FROM conversations WHERE user_id = auth.uid()
        )
    );

-- Posts: users can CRUD their own posts
CREATE POLICY "Users can view own posts" ON posts
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create posts" ON posts
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own posts" ON posts
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own posts" ON posts
    FOR DELETE USING (auth.uid() = user_id);

-- Models: everyone can read
CREATE POLICY "Anyone can view models" ON models
    FOR SELECT USING (true);

-- Moodboards: everyone can read
CREATE POLICY "Anyone can view moodboards" ON moodboards
    FOR SELECT USING (true);

-- Saved Assets: users can CRUD their own saved assets
CREATE POLICY "Users can view own saved assets" ON saved_assets
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can save assets" ON saved_assets
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved assets" ON saved_assets
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- UGC Video Templates (MakeUGC-style: AI actors talking, lip-sync over them)
-- ============================================================================

CREATE TABLE IF NOT EXISTS ugc_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    actor_avatar_url TEXT,
    description TEXT NOT NULL DEFAULT '',
    setting TEXT NOT NULL DEFAULT '',
    -- Source video URL (the AI-actor talking clip we lip-sync over)
    video_url TEXT NOT NULL,
    -- Thumbnail/cover image (first frame or a generated still)
    thumbnail_url TEXT NOT NULL,
    -- Sample script the model is "originally" saying — shown as inspiration
    sample_script TEXT NOT NULL DEFAULT '',
    -- Default voice id from ElevenLabs (matched to the actor's gender/style)
    voice_id TEXT NOT NULL DEFAULT 'Rachel',
    -- "9:16" / "1:1" / "16:9"
    aspect_ratio TEXT NOT NULL DEFAULT '9:16',
    duration_seconds INT NOT NULL DEFAULT 15,
    tags TEXT[] DEFAULT '{}',
    category TEXT NOT NULL DEFAULT 'lifestyle',
    -- Surface ordering (lower = sooner in the feed)
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

-- ============================================================================
-- UGC Generation Jobs
-- ============================================================================

CREATE TABLE IF NOT EXISTS ugc_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES ugc_templates(id) ON DELETE RESTRICT,
    -- Snapshot of template state at job creation (so a template change later
    -- does not retroactively alter the user's job).
    template_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- User-supplied product context
    product_name TEXT NOT NULL DEFAULT '',
    product_image_url TEXT,
    product_description TEXT NOT NULL DEFAULT '',

    -- The script the AI actor will say (final, post-edit) about the product
    script TEXT NOT NULL DEFAULT '',
    voice_id TEXT NOT NULL DEFAULT 'Rachel',

    -- Pipeline state machine
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'tts', 'lipsync', 'finalizing', 'completed', 'failed')),
    progress INT NOT NULL DEFAULT 0,
    error TEXT,

    -- Intermediate + final artifacts
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
CREATE POLICY "Users can view own ugc jobs" ON ugc_jobs
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create own ugc jobs" ON ugc_jobs;
CREATE POLICY "Users can create own ugc jobs" ON ugc_jobs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own ugc jobs" ON ugc_jobs;
CREATE POLICY "Users can update own ugc jobs" ON ugc_jobs
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own ugc jobs" ON ugc_jobs;
CREATE POLICY "Users can delete own ugc jobs" ON ugc_jobs
    FOR DELETE USING (auth.uid() = user_id);

-- Seed UGC templates (curated public-domain UGC-style talking head clips
-- from Pexels / Pixabay / Mixkit). Each is a real person talking-to-camera
-- — perfect lip-sync source material.
INSERT INTO ugc_templates (name, actor_name, actor_avatar_url, description, setting, video_url, thumbnail_url, sample_script, voice_id, aspect_ratio, duration_seconds, tags, category, sort_order)
VALUES
    ('Honest Review',
     'Maya',
     'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Confident young creator giving a casual review look-to-camera.',
     'Bedroom with soft natural light',
     'https://videos.pexels.com/video-files/8088924/8088924-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=600',
     'Okay so I have been using this for about a week and I genuinely cannot stop thinking about it.',
     'Rachel',
     '9:16', 12,
     ARRAY['review','female','gen-z','bedroom'],
     'review', 1),

    ('Get Ready With Me',
     'Sienna',
     'https://images.pexels.com/photos/733872/pexels-photo-733872.jpeg?auto=compress&cs=tinysrgb&w=400',
     'GRWM-style mirror chat about the product.',
     'Vanity mirror, golden hour',
     'https://videos.pexels.com/video-files/4587889/4587889-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/733872/pexels-photo-733872.jpeg?auto=compress&cs=tinysrgb&w=600',
     'Get ready with me while I tell you about the only thing I have been reaching for lately.',
     'Bella',
     '9:16', 14,
     ARRAY['grwm','female','beauty','warm'],
     'beauty', 2),

    ('Coffee Shop Hot Take',
     'Jordan',
     'https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Casual cafe hot-take, leaning in close to camera.',
     'Cozy cafe with soft jazz',
     'https://videos.pexels.com/video-files/7691793/7691793-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/91227/pexels-photo-91227.jpeg?auto=compress&cs=tinysrgb&w=600',
     'I am not joking when I tell you this completely changed my morning routine.',
     'Adam',
     '9:16', 13,
     ARRAY['lifestyle','male','cafe','hot-take'],
     'lifestyle', 3),

    ('Gym Locker Confession',
     'Kai',
     'https://images.pexels.com/photos/1431282/pexels-photo-1431282.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Post-workout sweaty pep-talk about the product.',
     'Gym locker room, fluorescent lighting',
     'https://videos.pexels.com/video-files/6740006/6740006-hd_1080_1920_30fps.mp4',
     'https://images.pexels.com/photos/1431282/pexels-photo-1431282.jpeg?auto=compress&cs=tinysrgb&w=600',
     'Real talk — if you are not using this yet you are leaving gains on the table.',
     'Antoni',
     '9:16', 15,
     ARRAY['fitness','male','gym','confession'],
     'fitness', 4),

    ('Cozy Couch Story Time',
     'Rae',
     'https://images.pexels.com/photos/3812944/pexels-photo-3812944.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Wholesome couch chat about a personal discovery.',
     'Couch with warm fairy lights',
     'https://videos.pexels.com/video-files/4587915/4587915-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/3812944/pexels-photo-3812944.jpeg?auto=compress&cs=tinysrgb&w=600',
     'So I have a little story for you and you are going to want to hear this one.',
     'Domi',
     '9:16', 16,
     ARRAY['storytime','female','cozy','warm'],
     'storytime', 5),

    ('Office Desk Discovery',
     'Theo',
     'https://images.pexels.com/photos/2102587/pexels-photo-2102587.jpeg?auto=compress&cs=tinysrgb&w=400',
     'Polished work-from-home desk reveal of the product.',
     'Modern desk with monitor glow',
     'https://videos.pexels.com/video-files/8088925/8088925-uhd_2160_4096_25fps.mp4',
     'https://images.pexels.com/photos/2102587/pexels-photo-2102587.jpeg?auto=compress&cs=tinysrgb&w=600',
     'I have tried every productivity hack in the book and none come close to this.',
     'Sam',
     '9:16', 14,
     ARRAY['work','male','desk','professional'],
     'productivity', 6);

-- Seed some sample models
INSERT INTO models (name, pose, image_url, tags) VALUES
    ('Aria', 'standing', 'https://placehold.co/400x600/1A1A1A/FFFFFF?text=Aria', ARRAY['fashion', 'casual']),
    ('Blake', 'sitting', 'https://placehold.co/400x600/1A1A1A/FFFFFF?text=Blake', ARRAY['lifestyle', 'urban']),
    ('Carmen', 'walking', 'https://placehold.co/400x600/1A1A1A/FFFFFF?text=Carmen', ARRAY['fitness', 'active']),
    ('Dante', 'portrait', 'https://placehold.co/400x600/1A1A1A/FFFFFF?text=Dante', ARRAY['professional', 'corporate']),
    ('Elena', 'dancing', 'https://placehold.co/400x600/1A1A1A/FFFFFF?text=Elena', ARRAY['creative', 'artistic']),
    ('Felix', 'lounging', 'https://placehold.co/400x600/1A1A1A/FFFFFF?text=Felix', ARRAY['casual', 'relaxed']);

-- Seed some sample moodboards
INSERT INTO moodboards (title, cover_url, image_urls, category, tags) VALUES
    ('Sunset Vibes', 'https://placehold.co/400x400/FF6B35/FFFFFF?text=Sunset', ARRAY['https://placehold.co/400x400/FF6B35/FFFFFF?text=1', 'https://placehold.co/400x400/FF8C42/FFFFFF?text=2', 'https://placehold.co/400x400/FFB347/FFFFFF?text=3'], 'nature', ARRAY['warm', 'golden hour']),
    ('Urban Edge', 'https://placehold.co/400x400/333333/FFFFFF?text=Urban', ARRAY['https://placehold.co/400x400/333333/FFFFFF?text=1', 'https://placehold.co/400x400/444444/FFFFFF?text=2'], 'urban', ARRAY['city', 'modern']),
    ('Pastel Dreams', 'https://placehold.co/400x400/FFB6C1/FFFFFF?text=Pastel', ARRAY['https://placehold.co/400x400/FFB6C1/FFFFFF?text=1', 'https://placehold.co/400x400/DDA0DD/FFFFFF?text=2', 'https://placehold.co/400x400/ADD8E6/FFFFFF?text=3', 'https://placehold.co/400x400/98FB98/FFFFFF?text=4'], 'aesthetic', ARRAY['soft', 'feminine']),
    ('Minimalist', 'https://placehold.co/400x400/F5F5F5/333333?text=Minimal', ARRAY['https://placehold.co/400x400/F5F5F5/333333?text=1', 'https://placehold.co/400x400/E8E8E8/333333?text=2'], 'lifestyle', ARRAY['clean', 'simple']);
