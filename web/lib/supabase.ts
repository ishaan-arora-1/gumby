'use client';
import { createBrowserClient } from '@supabase/ssr';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Browser-side Supabase client. Stores the PKCE verifier + session in cookies
// (via @supabase/ssr) so the server-side OAuth callback route can read them.
// This replaces the localStorage-based createClient flow which loses the
// verifier across the OAuth redirect.
export const supabase = createBrowserClient(url, anon);
