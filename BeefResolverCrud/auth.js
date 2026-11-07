const crypto = require('node:crypto');

// Tokens are issued by the evidence service (HS256). The same signing key is shared through the environment.
// When JWT_SIGNING_KEY is not set the API stays open, exactly like the original homework version.
const KEY = process.env.JWT_SIGNING_KEY || '';
const ISSUER = process.env.JWT_ISSUER || 'humanresolve.evidence-service';
const AUDIENCE = process.env.JWT_AUDIENCE || 'humanresolve.clients';
const CLOCK_SKEW_SECONDS = 60;

const enforced = Boolean(KEY);

function decode(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

// Returns { id, name } for a valid token, otherwise null.
function authenticate(request) {
  const header = request.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    if (decode(parts[0]).alg !== 'HS256') return null;
    const expected = crypto.createHmac('sha256', KEY).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    const claims = decode(parts[1]);
    if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_SECONDS < Date.now() / 1000) return null;
    if (claims.iss !== ISSUER || claims.aud !== AUDIENCE || typeof claims.sub !== 'string') return null;
    return { id: claims.sub, name: claims.unique_name || claims.name || '' };
  } catch {
    return null;
  }
}

module.exports = { enforced, authenticate };
