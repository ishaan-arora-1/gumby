// Curated "viral format" blueprint — a locked prompt recipe where the user
// only supplies a product photo. Display metadata only; the prompt recipes
// live server-side.
export interface Blueprint {
  id: string;
  name: string;
  tagline: string;
  format: string;
  has_creator: boolean;
  creator_speaks: boolean;
  duration_seconds: number;
  aspect_ratio: string;
  accent: [string, string];
  sort_order: number;
  preview_video_url: string | null;
  preview_poster_url: string | null;
}

export interface UGCTemplate {
  id: string;
  name: string;
  actor_name?: string;
  actor_avatar_url?: string;
  description?: string;
  setting?: string;
  video_url: string;
  thumbnail_url?: string;
  sample_script?: string;
  voice_id?: string;
  aspect_ratio?: string;
  duration_seconds?: number;
  tags?: string[];
  category?: string;
  is_active?: boolean;
  is_user_generated?: boolean;
}

export interface UGCJob {
  id: string;
  user_id: string;
  template_id?: string;
  template_snapshot?: any;
  product_name?: string;
  product_image_url?: string;
  product_description?: string;
  script?: string;
  voice_id?: string;
  // Stages emitted by the single-shot pipeline (backend/src/services/
  // ugcPipeline.js), plus the older tts/lipsync values kept for back-compat
  // with historical rows. Non-terminal stages all carry a `progress` value.
  status:
    | 'queued'
    | 'planning'
    | 'preparing'
    | 'rendering_scene'
    | 'generating_video'
    | 'finalizing'
    | 'tts'
    | 'lipsync'
    | 'completed'
    | 'failed';
  progress?: number;
  error?: string;
  audio_url?: string;
  output_video_url?: string;
  output_thumbnail_url?: string;
  created_at: string;
}

export interface UGCCreatorJob {
  id: string;
  user_id: string;
  prompt: string;
  aspect_ratio: string;
  duration_seconds: number;
  status: 'queued' | 'completed' | 'failed';
  progress?: number;
  error?: string;
  video_url?: string;
  thumbnail_url?: string;
  template_id?: string;
  created_at: string;
}
