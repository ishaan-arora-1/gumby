-- Direct mode: allow video generation without a template.
-- The user describes the creator inline and scenes are generated via text-to-video.
ALTER TABLE ugc_jobs ALTER COLUMN template_id DROP NOT NULL;
