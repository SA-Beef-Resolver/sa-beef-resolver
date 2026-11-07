const http = require('node:http');
const { sqlValue, query, run, initialiseDatabase } = require('./db');
const { enforced, authenticate } = require('./auth');

const PORT = process.env.PORT || 3000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function send(response, statusCode, body) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body, null, 2));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.on('data', (chunk) => { raw += chunk; });
    request.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('Request body must be valid JSON.')); }
    });
  });
}

const text = (value) => typeof value === 'string' && value.trim() !== '';

// Original homework rules: two different names, a reason and a status.
function validateNamedBeef(body) {
  const { person_a, person_b, reason, status = 'active' } = body;
  if (!person_a || !person_b || !reason) return 'person_a, person_b, and reason are required.';
  if (person_a === person_b) return 'person_a and person_b must be different people.';
  if (!['active', 'resolved'].includes(status)) return 'status must be active or resolved.';
  return null;
}

// Account-linked rules: the creator comes from the token, the opponent is an account id.
function validateLinkedBeef(body, user) {
  if (!UUID.test(String(body.person_b_id || ''))) return 'person_b_id must be the id of a user account.';
  if (body.person_b_id.toLowerCase() === user.id.toLowerCase()) return 'You cannot open a dispute with yourself.';
  if (!text(body.person_b)) return 'person_b (the opponent display name) is required.';
  if (!text(body.reason) || body.reason.length > 2000) return 'reason is required (up to 2000 characters).';
  if (body.status !== undefined && !['active', 'resolved'].includes(body.status)) return 'status must be active or resolved.';
  return null;
}

const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const isLegacy = (beef) => !beef.person_a_id;
const isParty = (beef, user) => same(beef.person_a_id, user.id) || same(beef.person_b_id, user.id);
const isCreator = (beef, user) => same(beef.person_a_id, user.id);

initialiseDatabase();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const route = url.pathname.match(/^\/api\/beefs(?:\/(\d+))?\/?$/);

  if (request.method === 'GET' && url.pathname === '/') {
    return send(response, 200, { message: 'Beef Resolver API is running.', endpoints: '/api/beefs', authentication: enforced ? 'required' : 'off' });
  }
  if (!route) return send(response, 404, { error: 'Route not found.' });

  // When a signing key is configured every call needs a valid token from the evidence service.
  const user = enforced ? authenticate(request) : null;
  if (enforced && !user) return send(response, 401, { error: 'A valid bearer token is required.' });

  const id = route[1] ? Number(route[1]) : null;

  // Loads one beef and applies the party rules; returns null after sending an error response.
  const loadForUser = (beefId) => {
    const [beef] = query(`SELECT * FROM beefs WHERE id = ${beefId}`);
    if (!beef) { send(response, 404, { error: `Beef #${beefId} was not found.` }); return null; }
    if (!enforced) return beef;
    if (isLegacy(beef)) { send(response, 422, { error: `Beef #${beefId} is not linked to user accounts.`, code: 'legacy' }); return null; }
    if (!isParty(beef, user)) { send(response, 403, { error: 'You are not a party to this dispute.' }); return null; }
    return beef;
  };

  try {
    if (request.method === 'GET' && !id) {
      const person = url.searchParams.get('person');
      const filters = [];
      if (enforced) filters.push(`(person_a_id = ${sqlValue(user.id)} OR person_b_id = ${sqlValue(user.id)})`);
      if (person) filters.push(`person_a = ${sqlValue(person)}`);
      const where = filters.length ? ` WHERE ${filters.join(' AND ')}` : '';
      const beefs = query(`SELECT * FROM beefs${where} ORDER BY id`);
      return send(response, 200, {
        count: beefs.length,
        beefs,
        ...(person ? { summary: `${person} has beef with: ${beefs.map((beef) => beef.person_b).join(', ') || 'nobody'}` } : {})
      });
    }

    if (request.method === 'GET' && id) {
      const beef = loadForUser(id);
      return beef ? send(response, 200, beef) : undefined;
    }

    if (request.method === 'POST' && !id) {
      const body = await readJson(request);
      if (enforced) {
        const problem = validateLinkedBeef(body, user);
        if (problem) return send(response, 400, { error: problem });
        const creatorName = text(body.person_a) ? body.person_a : user.name;
        if (!text(creatorName)) return send(response, 400, { error: 'person_a (your display name) is required.' });
        const [beef] = query(`INSERT INTO beefs (person_a, person_b, person_a_id, person_b_id, reason, status) VALUES (${sqlValue(creatorName)}, ${sqlValue(body.person_b)}, ${sqlValue(user.id)}, ${sqlValue(body.person_b_id)}, ${sqlValue(body.reason)}, ${sqlValue(body.status || 'active')}); SELECT * FROM beefs WHERE id = last_insert_rowid()`);
        return send(response, 201, beef);
      }
      const problem = validateNamedBeef(body);
      if (problem) return send(response, 400, { error: problem });
      const [beef] = query(`INSERT INTO beefs (person_a, person_b, reason, status) VALUES (${sqlValue(body.person_a)}, ${sqlValue(body.person_b)}, ${sqlValue(body.reason)}, ${sqlValue(body.status || 'active')}); SELECT * FROM beefs WHERE id = last_insert_rowid()`);
      return send(response, 201, beef);
    }

    if (request.method === 'PUT' && id) {
      const body = await readJson(request);
      const existing = loadForUser(id);
      if (!existing) return undefined;
      if (enforced) {
        // The people are fixed once a dispute exists; only the reason and status can change.
        const reason = body.reason === undefined ? existing.reason : body.reason;
        const status = body.status === undefined ? existing.status : body.status;
        if (!text(reason) || reason.length > 2000) return send(response, 400, { error: 'reason must be 1-2000 characters.' });
        if (!['active', 'resolved'].includes(status)) return send(response, 400, { error: 'status must be active or resolved.' });
        run(`UPDATE beefs SET reason = ${sqlValue(reason)}, status = ${sqlValue(status)}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`);
      } else {
        const problem = validateNamedBeef(body);
        if (problem) return send(response, 400, { error: problem });
        run(`UPDATE beefs SET person_a = ${sqlValue(body.person_a)}, person_b = ${sqlValue(body.person_b)}, reason = ${sqlValue(body.reason)}, status = ${sqlValue(body.status || 'active')}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}`);
      }
      const [beef] = query(`SELECT * FROM beefs WHERE id = ${id}`);
      return send(response, 200, beef);
    }

    if (request.method === 'DELETE' && id) {
      const beef = loadForUser(id);
      if (!beef) return undefined;
      if (enforced && !isCreator(beef, user)) return send(response, 403, { error: 'Only the person who opened the dispute can delete it.' });
      run(`DELETE FROM beefs WHERE id = ${id}`);
      return send(response, 200, { message: `Beef #${id} deleted.`, deleted: beef });
    }

    return send(response, 405, { error: 'Method not allowed for this route.' });
  } catch (error) {
    if (error.message === 'Request body must be valid JSON.') return send(response, 400, { error: error.message });
    const message = error.stderr?.toString().trim() || error.message;
    return send(response, 500, { error: 'Database operation failed.', detail: message });
  }
});

server.listen(PORT, () => console.log(`Beef Resolver API: http://localhost:${PORT} (authentication ${enforced ? 'required' : 'off'})`));
