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
  status: 'queued' | 'tts' | 'lipsync' | 'finalizing' | 'completed' | 'failed';
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
