const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { call, toHttpError, address } = require('./grpc');

const PORT = Number(process.env.PORT || 8081);
const BEEF_API_URL = (process.env.BEEF_API_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const AI_API_URL = (process.env.AI_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
// Docker puts the built frontend in ../public; local development uses the Vite build output.
const STATIC_CANDIDATES = [path.join(__dirname, '../public'), path.join(__dirname, '../../Frontend/dist')];
const STATIC_DIR = path.resolve(process.env.STATIC_DIR || STATIC_CANDIDATES.find((dir) => fs.existsSync(dir)) || STATIC_CANDIDATES[0]);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.map': 'application/json'
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) { reject(new HttpError(413, 'Request body is too large.')); request.destroy(); }
    });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new HttpError(400, 'Request body must be valid JSON.')); }
    });
  });
}

function tokenOf(request) {
  const header = request.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

// Every route except register/login needs a valid JWT. The gateway checks it with the gRPC service,
// so the Beef REST API (which has no login of its own) is protected too.
async function requireUser(request) {
  const token = tokenOf(request);
  if (!token) throw new HttpError(401, 'Sign in first.');
  const user = await call('authentication', 'getCurrentUser', {}, token);
  return { token, user };
}

// Forwards to an upstream HTTP service and relays its status and JSON body.
// `substitutes` maps an upstream status to a 200 body to send instead.
async function proxy(response, url, options = {}, substitutes = {}) {
  let upstream;
  try {
    upstream = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  } catch {
    throw new HttpError(503, 'An upstream service is unavailable.');
  }
  if (substitutes[upstream.status]) return send(response, 200, substitutes[upstream.status]);
  const text = await upstream.text();
  response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
  response.end(text);
}

const jsonHeaders = { 'Content-Type': 'application/json' };

const routes = [
  ['POST', /^\/api\/register$/, async (request) => call('authentication', 'register', await readJson(request))],
  ['POST', /^\/api\/login$/, async (request) => call('authentication', 'login', await readJson(request))],
  ['GET', /^\/api\/me$/, async (request) => (await requireUser(request)).user],
  ['GET', /^\/api\/users\/search$/, async (request, url) => {
    const { token } = await requireUser(request);
    return call('authentication', 'searchUsers', { query: url.searchParams.get('q') || '' }, token);
  }],
  ['GET', /^\/api\/users\/([^/]+)$/, async (request, url, [id]) => {
    const { token } = await requireUser(request);
    return call('authentication', 'getUserProfile', { person_id: id }, token);
  }],

  ['GET', /^\/api\/disputes\/([^/]+)\/arguments$/, async (request, url, [disputeId]) => {
    const { token } = await requireUser(request);
    return call('argument', 'getAllArguments', {
      dispute_id: disputeId,
      person_id: url.searchParams.get('person_id') || '',
      page_size: Number(url.searchParams.get('page_size') || 20),
      page_token: url.searchParams.get('page_token') || ''
    }, token);
  }],
  ['POST', /^\/api\/arguments$/, async (request) => {
    const { token } = await requireUser(request);
    return call('argument', 'createArgument', await readJson(request), token);
  }],
  ['GET', /^\/api\/arguments\/([^/]+)$/, async (request, url, [id]) => {
    const { token } = await requireUser(request);
    return call('argument', 'getArgument', { argument_id: id }, token);
  }],
  ['PUT', /^\/api\/arguments\/([^/]+)$/, async (request, url, [id]) => {
    const { token } = await requireUser(request);
    const body = await readJson(request);
    return call('argument', 'updateArgument', { ...body, argument_id: id }, token);
  }],
  ['DELETE', /^\/api\/arguments\/([^/]+)$/, async (request, url, [id]) => {
    const { token } = await requireUser(request);
    return call('argument', 'deleteArgument', { argument_id: id, expected_version: Number(url.searchParams.get('expected_version') || 0) }, token);
  }],
  ['POST', /^\/api\/arguments\/([^/]+)\/submit-ai$/, async (request, url, [id]) => {
    const { token } = await requireUser(request);
    const body = await readJson(request);
    // people is optional: with linked disputes the evidence service derives the side from the account.
    return call('argument', 'submitArgumentForAi', { argument_id: id, people: Number(body.people || 0), expected_version: Number(body.expected_version) }, token);
  }]
];

// Routes that relay an upstream HTTP response themselves.
async function handleProxyRoutes(request, response, url) {
  const beefs = url.pathname.match(/^\/api\/beefs(\/\d+)?$/);
  if (beefs) {
    const { token, user } = await requireUser(request);
    const target = `${BEEF_API_URL}/api/beefs${beefs[1] || ''}${url.search}`;
    let payload;
    if (request.method === 'POST' && !beefs[1]) {
      // The creator and opponent names come from the real accounts, not from what the browser sent.
      const incoming = await readJson(request);
      const opponent = await call('authentication', 'getUserProfile', { person_id: String(incoming.person_b_id || '') }, token);
      payload = { person_a: user.display_name, person_b: opponent.display_name, person_b_id: opponent.person_id, reason: incoming.reason, status: incoming.status };
    } else if (request.method === 'PUT') {
      const incoming = await readJson(request);
      payload = { reason: incoming.reason, status: incoming.status };
    }
    const headers = { ...jsonHeaders, Authorization: `Bearer ${token}` };
    await proxy(response, target, { method: request.method, headers, body: payload ? JSON.stringify(payload) : undefined });
    return true;
  }
  const resolution = url.pathname.match(/^\/api\/resolution\/([A-Za-z0-9_-]{1,128})(\/history)?$/);
  if (resolution && request.method === 'GET') {
    await requireUser(request);
    // "No result yet" is a normal state while the AI works, so report it as 200 instead of a browser-visible 404.
    await proxy(response, `${AI_API_URL}/sessions/${resolution[1]}${resolution[2] || ''}`, {}, { 404: { status: 'none' } });
    return true;
  }
  return false;
}

function serveStatic(request, response, url) {
  const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = path.join(STATIC_DIR, requested);
  if (!file.startsWith(STATIC_DIR)) { response.writeHead(403); return response.end(); }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, 'index.html'); // SPA fallback
  if (!fs.existsSync(file)) return send(response, 404, { error: 'Frontend has not been built.' });
  response.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(response);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  try {
    if (url.pathname === '/health') return send(response, 200, { status: 'ok', grpc: address });
    if (url.pathname.startsWith('/api/')) {
      if (await handleProxyRoutes(request, response, url)) return;
      for (const [method, pattern, handler] of routes) {
        const match = url.pathname.match(pattern);
        if (match && request.method === method) return send(response, 200, await handler(request, url, match.slice(1).map(decodeURIComponent)));
      }
      return send(response, 404, { error: 'Route not found.' });
    }
    return serveStatic(request, response, url);
  } catch (error) {
    if (error instanceof HttpError) return send(response, error.status, { error: error.message });
    if (typeof error.code === 'number') {
      const { status, body } = toHttpError(error);
      return send(response, status, body);
    }
    console.error(error);
    return send(response, 500, { error: 'Unexpected gateway error.' });
  }
});

server.listen(PORT, () => console.log(`Web gateway: http://localhost:${PORT} -> gRPC ${address}, beefs ${BEEF_API_URL}, ai ${AI_API_URL}`));
