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
  let session = (await supabase.auth.getSession()).data.session;
  // After the studio page has been idle for a while, the cached access
  // token can be expired (or seconds from it) and getSession() hands it
  // back as-is. Sending a dead token makes the API reject the request,
  // which on the studio page looks like the Generate button "doing
  // nothing". Force a refresh when the token is within 60s of expiry so we
  // always send a live token.
  const expiresAtMs = session?.expires_at ? session.expires_at * 1000 : 0;
  if (session && expiresAtMs && expiresAtMs - Date.now() < 60_000) {
    try {
      const refreshed = (await supabase.auth.refreshSession()).data.session;
      if (refreshed) session = refreshed;
    } catch {
      // Fall through with whatever we have — the request may still 401,
      // which surfaces a clean error rather than hanging silently.
    }
  }
  if (session?.access_token) {
    return { Authorization: `Bearer ${session.access_token}` };
  }
  return {};
}

// Hard ceiling on any single API call. /generate returns 202 almost
// instantly and every other call is short, so this only ever trips on a
// genuinely stuck request — at which point we abort and surface a clean
// error instead of leaving the caller (and the Generate button) hanging
// forever. Generous enough not to cut off a slow image upload.
const REQUEST_TIMEOUT_MS = 60_000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (e: any) {
    // Network failure or our own timeout abort — normalize to an ApiError
    // so callers (e.g. the studio Generate handler) always reset their
    // loading state and show a message instead of staying stuck.
    if (e?.name === 'AbortError') {
      throw new ApiError(0, 'Request timed out. Please try again.');
    }
    throw new ApiError(0, e?.message || 'Network error. Please try again.');
  } finally {
    clearTimeout(timer);
  }
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

// Server-resolved geo → currency. Backend reads the real client IP, so
// this is accurate regardless of browser locale / VPN. Public, no auth.
// Returns null on any failure so callers can fall back to a client-side
// heuristic.
export interface GeoInfo {
  country: string | null;
  currency: 'INR' | 'USD';
  isIndia: boolean;
  source: string;
}
export async function fetchGeo(): Promise<GeoInfo | null> {
  try {
    // Testing override: ?country=IN / ?country=US in the page URL forces a
    // country so you can preview the India vs US experience without a VPN.
    // The backend honors the same `country` query param.
    let qs = '';
    if (typeof window !== 'undefined') {
      const override = new URLSearchParams(window.location.search).get('country');
      if (override && /^[A-Za-z]{2}$/.test(override)) {
        qs = `?country=${override.toUpperCase()}`;
      }
    }
    const res = await fetch(`${API_BASE_URL}/geo${qs}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const j = await res.json();
    if (j?.data?.currency === 'INR' || j?.data?.currency === 'USD') {
      return j.data as GeoInfo;
    }
    return null;
  } catch {
    return null;
  }
}
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

// Public credit pack list — used by the marketing /pricing page and the
// landing pricing section. Server returns them; the static fallback
// below keeps the page renderable even if the backend is unreachable.
export async function fetchPublicPacks(): Promise<CreditPack[]> {
  try {
    const res = await fetch(`${API_BASE_URL}/credits/packs`, { cache: 'no-store' });
    if (!res.ok) throw new Error('non-200');
    const j = await res.json();
    if (Array.isArray(j.data) && j.data.length) return j.data;
    throw new Error('empty');
  } catch {
    return STATIC_PACK_FALLBACK;
  }
}

// Mirror of the seed rows in migrations 009_credits.sql + 010_credits_usd.sql
// — used both as a fallback (offline / API down) and as the source of truth
// in components that render before any network call lands. Keep this in
// sync with the DB rows.
export const STATIC_PACK_FALLBACK: CreditPack[] = [
  { id: 'starter', label: 'Starter', credits: 250,  price_paise: 50000,   price_cents: 700,    blurb: '5 short videos to try the product',           sort_order: 1 },
  { id: 'creator', label: 'Creator', credits: 1000, price_paise: 180000,  price_cents: 2500,   blurb: '~20 short videos · best for solo creators',   sort_order: 2 },
  { id: 'studio',  label: 'Studio',  credits: 3000, price_paise: 540000,  price_cents: 7000,   blurb: '~60 short videos · a month of daily content', sort_order: 3 },
  { id: 'agency',  label: 'Agency',  credits: 7500, price_paise: 1350000, price_cents: 17000,  blurb: '~150 short videos · agency-scale volume',     sort_order: 4 },
];

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

  parsePrompt: (prompt: string, attachments?: { url: string }[]) =>
    request<{ success: boolean; data: any }>('/ugc/parse-prompt', {
      method: 'POST',
      body: JSON.stringify({
        prompt,
        ...(attachments && attachments.length ? { attachments } : {}),
      }),
    }),

  // ---- UGC Generation Jobs (unified free-form upload) ----
  // The user uploads any number of reference images plus one free-form
  // prompt. The backend classifies each image's role itself (creator /
  // product / background / style) and routes accordingly. Captions /
  // script only matter when the creator speaks.
  generateAd: (body: {
    prompt: string;
    attachmentUrls: string[];
    // Known creator image from a template / history item. Role is fixed to
    // "creator" on the backend; the rest of attachmentUrls are classified.
    creatorImageUrl?: string;
    script?: string;
    creatorSpeaks?: boolean;
    videoDuration?: 5 | 10;
    aspectRatio?: '9:16' | '16:9' | '1:1';
    captionsEnabled?: boolean;
    captionPreset?: string;
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
  // Reuse a completed UGC job as a template. The backend mints a hidden
  // `ugc_templates` row pointing at the job's output video — once it's a
  // template the existing flow (seed-frame extract + product integration
  // + Kling 3.0 Pro generation) handles everything.
  useHistoryItem: (id: string) =>
    request<{ success: boolean; data: any }>(`/ugc/jobs/${id}/use`, {
      method: 'POST',
      body: '{}',
    }),

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
  // Generic attachment upload used by the prompt composer — the image
  // gets classified as product / inspiration / both by /parse-prompt
  // afterward, so the composer doesn't have to pre-label it.
  uploadAttachment: (contentType: string, base64: string) =>
    request<{ success: boolean; data: { url: string } }>(
      '/ugc/upload-attachment',
      { method: 'POST', body: JSON.stringify({ contentType, base64 }) }
    ),

  // ---- Credits ----
  getCreditBalance: () =>
    request<{ success: boolean; data: { balance: number } }>('/credits/balance'),
  listCreditPacks: () =>
    request<{ success: boolean; data: CreditPack[] }>('/credits/packs'),
  listCreditTransactions: () =>
    request<{ success: boolean; data: CreditTransaction[] }>('/credits/transactions'),
  createCheckout: (packId: string, currency: 'INR' | 'USD' = 'INR') =>
    request<{ success: boolean; data: CheckoutOrder }>('/credits/checkout', {
      method: 'POST',
      body: JSON.stringify({ packId, currency }),
    }),
};

// ---- Credit types ----
export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  // Minor units. INR is in paise (₹1 = 100). USD is in cents ($1 = 100).
  // `price_cents` is nullable on packs not offered internationally —
  // /checkout returns 400 if the user picks USD on such a pack.
  price_paise: number;
  price_cents: number | null;
  blurb: string;
  sort_order: number;
}

export interface CreditTransaction {
  id: string;
  delta: number;
  reason: 'purchase' | 'spend' | 'refund' | 'grant';
  ref_id: string | null;
  pack_id: string | null;
  created_at: string;
}

export interface CheckoutOrder {
  orderId: string;
  amount: number;       // minor units in the chosen currency
  currency: 'INR' | 'USD';
  keyId: string;
  pack: {
    id: string;
    label: string;
    credits: number;
    priceMajor: number;        // amount/100 — what the user sees
    priceInr: number | null;   // legacy field, populated only when currency=INR
    priceUsd: number | null;   // populated only when currency=USD
  };
  user: { id: string; email: string; name: string };
}

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
