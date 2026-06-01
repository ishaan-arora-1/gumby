import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

type CookieToSet = { name: string; value: string; options: CookieOptions };

// Refreshes the Supabase session cookie on every request so the browser
// always has an up-to-date access token. Required for the @supabase/ssr
// cookie-based PKCE flow we use for OAuth sign-in.
//
// Uses the getAll/setAll cookie pattern (the deprecated get/set/remove
// methods are a documented source of "random logouts / early session
// termination"). Crucially, refreshed cookies are written back onto BOTH
// the request and the response — without the request copy, server-side
// reads later in the same pass see a stale token and can trigger a
// refresh-token rotation race that logs the user out.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          // Reflect the new cookies onto the request so anything reading
          // them later in this same pass sees the fresh session...
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          // ...and onto the response so the browser persists them.
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Trigger a refresh if the token is near expiry. The result is discarded;
  // we only care about the side-effect of setting fresh cookies above.
  await supabase.auth.getUser();

  return response;
}

// Skip static assets and the Next.js internals to keep latency low.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|fonts|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
