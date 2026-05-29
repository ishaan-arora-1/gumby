'use client';
import { supabase } from './supabase';

function resolveApiBase(): string {
  const explicit = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicit && explicit.trim()) return explicit;
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000/api';
    }
  }
  return 'https://api.blinkugc.com/api';
}

const API_BASE = resolveApiBase();

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await authHeaders()),
    ...((options.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = await res.json();
      msg = j.error || j.message || msg;
    } catch {}
    throw new ApiError(res.status, msg);
  }
  return res.json();
}

// Public (no-auth) calls — used by marketing landing
const API_BASE_URL = API_BASE;
export async function fetchFeaturedTemplates(limit = 8): Promise<any[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/ugc/featured?limit=${limit}`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const j = await res.json();
    return Array.isArray(j.data) ? j.data : [];
  } catch {
    return [];
  }
}

export const api = {
  // ---- Auth ----
  verifyUser: (name?: string) =>
    request<{ success: boolean; data: any }>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  // Permanently delete the signed-in user's account and all their data.
  // Required by Apple Guideline 5.1.1(v) — surfaced in iOS, mirrored here.
  deleteAccount: () =>
    request<{ success: boolean }>('/auth/account', { method: 'DELETE' }),

  // ---- UGC Templates ----
  listTemplates: (page = 1, category?: string) => {
    const q = new URLSearchParams({ page: String(page) });
    if (category) q.set('category', category);
    return request<{ success: boolean; data: any[]; total_pages: number }>(
      `/ugc/templates?${q}`
    );
  },
  getTemplate: (id: string) =>
    request<{ success: boolean; data: any }>(`/ugc/templates/${id}`),

  // ---- UGC Script / Prompt ----
  generateScript: (body: {
    productName: string;
    productDescription: string;
    template: any;
    tone?: string;
    targetSeconds?: number;
  }) =>
    request<{ success: boolean; data: { script: string } }>('/ugc/script', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  parsePrompt: (prompt: string) =>
    request<{ success: boolean; data: any }>('/ugc/parse-prompt', {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),

  // ---- UGC Generation Jobs (Full Ad) ----
  generateAd: (body: {
    templateId?: string | null;
    creatorDescription?: string;
    creatorTweaks?: string;
    productName: string;
    productDescription: string;
    productImageUrl?: string;
    inspirationImageUrl?: string;
    script: string;
    videoDescription?: string;
    videoDuration?: number;
    captionsEnabled?: boolean;
  }) =>
    request<{ success: boolean; data: any }>('/ugc/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listJobs: (page = 1) =>
    request<{ success: boolean; data: any[]; total_pages: number }>(
      `/ugc/jobs?page=${page}`
    ),
  getJob: (id: string) =>
    request<{ success: boolean; data: any }>(`/ugc/jobs/${id}`),
  deleteJob: (id: string) =>
    request<{ success: boolean }>(`/ugc/jobs/${id}`, { method: 'DELETE' }),

  // ---- Creator (silent text-to-video) ----
  generateCreator: (body: {
    prompt: string;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    durationSeconds?: 5 | 10;
  }) =>
    request<{ success: boolean; data: any }>('/ugc/creator/generate', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  listCreatorJobs: (page = 1) =>
    request<{ success: boolean; data: any[]; total_pages: number }>(
      `/ugc/creator/jobs?page=${page}`
    ),
  getCreatorJob: (id: string) =>
    request<{ success: boolean; data: any }>(`/ugc/creator/jobs/${id}`),
  promoteToTemplate: (id: string, body?: { sampleScript?: string; actorName?: string }) =>
    request<{ success: boolean; data: any }>(
      `/ugc/creator/jobs/${id}/promote-to-template`,
      { method: 'POST', body: JSON.stringify(body || {}) }
    ),
  myLibrary: (page = 1) =>
    request<{ success: boolean; data: any[]; total_pages: number }>(
      `/ugc/library?page=${page}`
    ),

  // ---- Image Uploads ----
  uploadProductImage: (contentType: string, base64: string) =>
    request<{ success: boolean; data: { url: string } }>(
      '/ugc/upload-product-image',
      { method: 'POST', body: JSON.stringify({ contentType, base64 }) }
    ),
  uploadInspirationImage: (contentType: string, base64: string) =>
    request<{ success: boolean; data: { url: string } }>(
      '/ugc/upload-inspiration-image',
      { method: 'POST', body: JSON.stringify({ contentType, base64 }) }
    ),
};

// Helper: poll a job until completed or failed
export async function pollJob<T extends { status: string; progress?: number }>(
  fetcher: () => Promise<{ data: T }>,
  onUpdate: (job: T) => void,
  intervalMs = 2500,
  timeoutMs = 1000 * 60 * 10
): Promise<T> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const { data } = await fetcher();
        onUpdate(data);
        if (data.status === 'completed') return resolve(data);
        if (data.status === 'failed') return reject(new Error('Job failed'));
        if (Date.now() - start > timeoutMs) return reject(new Error('Timeout'));
        setTimeout(tick, intervalMs);
      } catch (e) {
        reject(e);
      }
    };
    tick();
  });
}

// Helper: file → base64 (no data:image prefix)
export async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
