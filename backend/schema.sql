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
