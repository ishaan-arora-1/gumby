/**
 * Geo / currency resolution.
 *
 *   GET /api/geo  → { country, currency, isIndia, source }
 *
 * Public (no auth). This is the single source of truth for which currency
 * the pricing UI defaults to: India → INR, everywhere else → USD. We want
 * this to be ACCURATE by default — a visitor in the US with no VPN must
 * never see INR — so we resolve from the real network location, not the
 * browser's language (which is trivially wrong on VPNs / mismatched
 * locales).
 *
 * Resolution order (first hit wins):
 *   1. A CDN-provided country header, if the app is ever fronted by one
 *      (Cloudflare `cf-ipcountry`, Vercel `x-vercel-ip-country`, App Engine,
 *      Fastly). These are 100% accurate and free. Azure App Service doesn't
 *      add one today, but this future-proofs a CDN swap.
 *   2. A server-side IP geolocation lookup on the real client IP. Country-
 *      level IP geo is ~99% accurate — far better than browser locale.
 *   3. Fallback: USD (the primary, US-focused market). The pricing UI still
 *      shows a currency toggle, so the rare miss self-corrects with one tap.
 *
 * Results are cached in-memory per IP (geo changes rarely) so we don't hit
 * the lookup API on every page load.
 */
const express = require('express');
const router = express.Router();

const LOOKUP_TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const CACHE_MAX = 5000;

// ipCountry cache: ip -> { country, expires }
const cache = new Map();

function cacheGet(ip) {
  const hit = cache.get(ip);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    cache.delete(ip);
    return undefined;
  }
  return hit.country;
}

function cacheSet(ip, country) {
  if (cache.size >= CACHE_MAX) {
    // Cheap eviction — drop the oldest inserted key.
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(ip, { country, expires: Date.now() + CACHE_TTL_MS });
}

// Country headers various CDNs/edges inject. All hold an ISO 3166-1
// alpha-2 country code.
const CDN_COUNTRY_HEADERS = [
  'cf-ipcountry',          // Cloudflare
  'x-vercel-ip-country',   // Vercel
  'x-appengine-country',   // Google App Engine
  'fastly-geo-country',    // Fastly
  'x-country-code',        // generic
];

function countryFromCdnHeader(req) {
  for (const h of CDN_COUNTRY_HEADERS) {
    const v = req.headers[h];
    if (typeof v === 'string' && /^[A-Za-z]{2}$/.test(v.trim())) {
      return v.trim().toUpperCase();
    }
  }
  return null;
}

/**
 * Extract the real client IP. With `trust proxy` set in index.js, req.ip
 * is usually right, but Azure App Service formats X-Forwarded-For as
 * `client, proxy1, ...` — the FIRST entry is the original client, which is
 * what we want for geo. We prefer that, then fall back to req.ip.
 */
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length) {
    const first = xff.split(',')[0].trim();
    if (first) return stripPort(first);
  }
  return stripPort(req.ip || '');
}

function stripPort(ip) {
  // Azure sometimes appends :port to the XFF entry. IPv6 has many colons,
  // so only strip a trailing :NNNN when it looks like an IPv4:port.
  const m = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  return m ? m[1] : ip;
}

function isPrivateOrLocal(ip) {
  if (!ip) return true;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    ip.startsWith('::ffff:127.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
}

async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    // A real User-Agent matters — some geo APIs 403 requests with Node's
    // default UA or treat a missing one as a blocked CORS/browser hit.
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json', 'User-Agent': 'blinkugc-geo/1.0' },
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve a country code from an IP via free, no-key geo APIs.
 * Primary: api.country.is (HTTPS, clean JSON, verified to work
 * server-side from Node and accurate for IN vs US). Fallback:
 * ip-api.com (server-to-server HTTP is fine; 45 req/min free).
 * Returns an alpha-2 country code, or null if both fail.
 *
 * (We dropped ipapi.co — now behind a Cloudflare bot challenge — and
 * ipwho.is — 403s server-side requests on its free plan.)
 */
async function lookupCountry(ip) {
  // Primary — api.country.is → { ip, country }.
  try {
    const r = await fetchWithTimeout(`https://api.country.is/${encodeURIComponent(ip)}`, LOOKUP_TIMEOUT_MS);
    if (r.ok) {
      const j = await r.json();
      const cc = j?.country;
      if (typeof cc === 'string' && /^[A-Za-z]{2}$/.test(cc)) return cc.toUpperCase();
    }
  } catch (e) {
    // fall through to secondary
  }
  // Fallback — ip-api.com → { countryCode }.
  try {
    const r = await fetchWithTimeout(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=countryCode`, LOOKUP_TIMEOUT_MS);
    if (r.ok) {
      const j = await r.json();
      const cc = j?.countryCode;
      if (typeof cc === 'string' && /^[A-Za-z]{2}$/.test(cc)) return cc.toUpperCase();
    }
  } catch (e) {
    // give up — caller falls back to the USD default.
  }
  return null;
}

function currencyForCountry(country) {
  return country === 'IN' ? 'INR' : 'USD';
}

router.get('/', async (req, res) => {
  // Never cache at the edge/browser — currency is per-visitor.
  res.setHeader('Cache-Control', 'no-store');

  // Allow a manual override for testing: /api/geo?country=IN
  const override = (req.query.country || '').toString().trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(override)) {
    return res.json({
      success: true,
      data: {
        country: override,
        currency: currencyForCountry(override),
        isIndia: override === 'IN',
        source: 'override',
      },
    });
  }

  // 1) CDN header (instant, perfect when present).
  const hdrCountry = countryFromCdnHeader(req);
  if (hdrCountry) {
    return res.json({
      success: true,
      data: {
        country: hdrCountry,
        currency: currencyForCountry(hdrCountry),
        isIndia: hdrCountry === 'IN',
        source: 'cdn-header',
      },
    });
  }

  const ip = clientIp(req);

  // 2) Local / private IP (dev, internal) → default to the primary market.
  if (isPrivateOrLocal(ip)) {
    return res.json({
      success: true,
      data: { country: null, currency: 'USD', isIndia: false, source: 'local-default' },
    });
  }

  // 3) Cache, then IP geolocation lookup.
  let country = cacheGet(ip);
  let source = 'cache';
  if (country === undefined) {
    country = await lookupCountry(ip);
    if (country) {
      cacheSet(ip, country);
      source = 'ip-lookup';
    }
  }

  if (!country) {
    // Lookup failed — fall back to the US-focused default. The UI toggle
    // lets an Indian visitor switch to INR if this rare miss happens.
    return res.json({
      success: true,
      data: { country: null, currency: 'USD', isIndia: false, source: 'lookup-failed-default' },
    });
  }

  return res.json({
    success: true,
    data: {
      country,
      currency: currencyForCountry(country),
      isIndia: country === 'IN',
      source,
    },
  });
});

module.exports = router;
