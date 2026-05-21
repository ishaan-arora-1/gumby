-- Gumby AI — Product Shot Plan (B-roll integration)
-- Adds the columns we need to plan, generate, and reference the multi-shot
-- product B-roll that gets intercut into the final UGC ad. Apply via the
-- Supabase SQL Editor (idempotent — safe to re-run).

-- `shot_plan` stores the ordered list of B-roll shots the user (or our GPT
-- suggester) authored. Shape:
--   [
--     { "description": "Holding the bag in their hand, smiling at camera" },
--     { "description": "Scooping the powder into a glass with milk" }
--   ]
-- We keep it as JSONB rather than a child table because the list is short
-- (1-3 entries), tightly coupled to the parent job, and never queried.
ALTER TABLE ugc_jobs
    ADD COLUMN IF NOT EXISTS shot_plan JSONB;

-- Public URLs of the rendered B-roll clips returned by Kling Elements. We
-- mirror them into Supabase Storage so they survive past fal's CDN expiry.
ALTER TABLE ugc_jobs
    ADD COLUMN IF NOT EXISTS broll_urls TEXT[];

-- The creator face image we extract from the talking-head video and feed
-- into Kling Elements alongside the product photo. Cached on the job so
-- re-running B-roll generation never has to recompute the frame.
ALTER TABLE ugc_jobs
    ADD COLUMN IF NOT EXISTS creator_reference_image_url TEXT;
