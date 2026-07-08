/**
 * Apple In-App Purchase verification (StoreKit 2 signed transactions).
 *
 * iOS sends the `jwsRepresentation` of a verified transaction to
 * POST /api/credits/apple/validate. We re-verify it SERVER-SIDE before
 * granting credits — never trust the client's word that a purchase
 * happened:
 *
 *   1. The JWS header carries an x5c certificate chain. Each cert must be
 *      signed by the next, and the chain must terminate at Apple's real
 *      root: we fetch the official "Apple Root CA - G3" DER from
 *      apple.com (cached in-process) and require BYTE-EQUALITY with the
 *      chain's root. Name-matching alone would be spoofable — anyone can
 *      self-sign a cert called "Apple Root CA - G3"; nobody can forge a
 *      chain that byte-matches the real root and still verifies.
 *   2. The leaf cert's public key must verify the ES256 signature over
 *      the JWS signing input (P1363/JOSE signature format).
 *   3. The payload's bundleId must be ours and productId must map to a
 *      known credit pack.
 *
 * Sandbox transactions verify with the same chain (the `environment`
 * field in the payload says which) — we accept them, because TestFlight
 * and App Review run in the sandbox and must receive their credits.
 */
const crypto = require('crypto');

const APPLE_ROOT_CA_G3_URL = 'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';
const EXPECTED_BUNDLE_ID = 'com.ishaan.gumby';

// productID → credit pack. Mirrors iOS `CreditPack.all` and the
// `credit_packs` seed rows — keep the three in sync.
const PRODUCT_TO_PACK = {
  'com.ishaan.gumby.credits.starter': { packId: 'starter', credits: 250 },
  'com.ishaan.gumby.credits.creator': { packId: 'creator', credits: 1000 },
  'com.ishaan.gumby.credits.studio':  { packId: 'studio',  credits: 3000 },
  'com.ishaan.gumby.credits.agency':  { packId: 'agency',  credits: 7500 },
};

function packForProduct(productId) {
  return PRODUCT_TO_PACK[productId] || null;
}

// ---------------------------------------------------------------------------
// Apple root certificate (fetched once, cached for the process lifetime)
// ---------------------------------------------------------------------------

let cachedRootDER = null;
let rootFetchPromise = null;

async function getAppleRootDER() {
  if (cachedRootDER) return cachedRootDER;
  if (!rootFetchPromise) {
    rootFetchPromise = (async () => {
      const resp = await fetch(APPLE_ROOT_CA_G3_URL);
      if (!resp.ok) throw new Error(`Apple root CA fetch failed (${resp.status})`);
      const der = Buffer.from(await resp.arrayBuffer());
      // Sanity: it must parse as a self-signed CA cert with Apple's name.
      const cert = new crypto.X509Certificate(der);
      if (!/Apple Root CA - G3/.test(cert.subject)) {
        throw new Error('fetched root does not look like Apple Root CA - G3');
      }
      cachedRootDER = der;
      return der;
    })().catch((e) => {
      rootFetchPromise = null; // allow retry on the next validation
      throw e;
    });
  }
  return rootFetchPromise;
}

// ---------------------------------------------------------------------------
// JWS verification
// ---------------------------------------------------------------------------

function b64urlToBuffer(s) {
  return Buffer.from(s, 'base64url');
}

/**
 * Verifies a StoreKit 2 transaction JWS and returns its decoded payload.
 * Throws with a descriptive message on ANY verification failure.
 */
async function verifyTransactionJWS(jws) {
  if (typeof jws !== 'string' || jws.length > 30000) {
    throw new Error('malformed JWS');
  }
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('malformed JWS (expected 3 segments)');

  let header;
  try {
    header = JSON.parse(b64urlToBuffer(parts[0]).toString('utf8'));
  } catch {
    throw new Error('malformed JWS header');
  }
  if (header.alg !== 'ES256') throw new Error(`unexpected alg ${header.alg}`);
  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2 || x5c.length > 4) {
    throw new Error('missing or invalid x5c chain');
  }

  let certs;
  try {
    certs = x5c.map((c) => new crypto.X509Certificate(Buffer.from(c, 'base64')));
  } catch {
    throw new Error('unparseable certificate in x5c');
  }

  // 1. Every cert must be signed by the next one in the chain.
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].verify(certs[i + 1].publicKey)) {
      throw new Error(`certificate chain broken at index ${i}`);
    }
  }

  // 2. The chain's root must BYTE-MATCH the real Apple Root CA - G3.
  const rootDER = await getAppleRootDER();
  const chainRoot = certs[certs.length - 1];
  if (!chainRoot.raw.equals(rootDER)) {
    throw new Error('chain does not terminate at Apple Root CA - G3');
  }

  // 3. Certificate validity window (leaf especially).
  const now = Date.now();
  for (const cert of certs) {
    if (now < new Date(cert.validFrom).getTime() || now > new Date(cert.validTo).getTime()) {
      throw new Error('certificate outside its validity window');
    }
  }

  // 4. The leaf's key must verify the ES256 signature over header.payload.
  //    JWS ES256 signatures are raw r||s (IEEE P1363), not DER.
  const signingInput = Buffer.from(`${parts[0]}.${parts[1]}`, 'utf8');
  const signature = b64urlToBuffer(parts[2]);
  const ok = crypto.verify(
    'sha256',
    signingInput,
    { key: certs[0].publicKey, dsaEncoding: 'ieee-p1363' },
    signature
  );
  if (!ok) throw new Error('JWS signature invalid');

  let payload;
  try {
    payload = JSON.parse(b64urlToBuffer(parts[1]).toString('utf8'));
  } catch {
    throw new Error('malformed JWS payload');
  }
  return payload;
}

/**
 * Full validation for a credit-pack purchase: verify the JWS, then check
 * the payload identifies a real purchase of one of OUR packs in OUR app.
 * Returns { transactionId, pack, environment, productId }.
 */
async function validateCreditPurchase(jws) {
  const payload = await verifyTransactionJWS(jws);

  if (payload.bundleId !== EXPECTED_BUNDLE_ID) {
    throw new Error(`wrong bundleId ${payload.bundleId}`);
  }
  const pack = packForProduct(payload.productId);
  if (!pack) throw new Error(`unknown productId ${payload.productId}`);

  const transactionId = String(payload.transactionId || '');
  if (!transactionId) throw new Error('missing transactionId');

  // Revoked purchases (refunds / family-sharing revocations) never grant.
  if (payload.revocationDate) throw new Error('transaction was revoked');

  return {
    transactionId,
    pack,
    productId: payload.productId,
    environment: payload.environment || 'unknown',
  };
}

module.exports = { validateCreditPurchase, verifyTransactionJWS, packForProduct };
