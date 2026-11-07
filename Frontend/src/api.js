// Thin fetch wrapper for the web gateway. Every call after login sends the JWT.
let token = '';
let onUnauthorized = () => {};

export function setToken(value) { token = value || ''; }
export function setUnauthorizedHandler(handler) { onUnauthorized = handler; }

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the stack running?');
  }
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    if (response.status === 401 && token) onUnauthorized();
    throw new ApiError(response.status, data?.error || data?.detail || `Request failed (${response.status})`, data?.grpc_code);
  }
  return data;
}

const get = (path) => request('GET', path);
const post = (path, body) => request('POST', path, body ?? {});
const put = (path, body) => request('PUT', path, body);
const del = (path) => request('DELETE', path);

export const api = {
  register: (payload) => post('/api/register', payload),
  login: (payload) => post('/api/login', payload),
  me: () => get('/api/me'),
  searchUsers: (term) => get(`/api/users/search?q=${encodeURIComponent(term)}`),
  userProfile: (personId) => get(`/api/users/${encodeURIComponent(personId)}`),

  listDisputes: (person) => get(`/api/beefs${person ? `?person=${encodeURIComponent(person)}` : ''}`),
  getDispute: (id) => get(`/api/beefs/${id}`),
  createDispute: (payload) => post('/api/beefs', payload),
  updateDispute: (id, payload) => put(`/api/beefs/${id}`, payload),
  deleteDispute: (id) => del(`/api/beefs/${id}`),

  listArguments: (disputeId) => get(`/api/disputes/${encodeURIComponent(disputeId)}/arguments?page_size=100`),
  createArgument: (payload) => post('/api/arguments', payload),
  updateArgument: (id, payload) => put(`/api/arguments/${id}`, payload),
  deleteArgument: (id, version) => del(`/api/arguments/${id}?expected_version=${version}`),
  submitForAi: (id, people, expectedVersion) => post(`/api/arguments/${id}/submit-ai`, { people, expected_version: expectedVersion }),

  resolution: (disputeId) => get(`/api/resolution/${encodeURIComponent(disputeId)}`),
  resolutionHistory: (disputeId) => get(`/api/resolution/${encodeURIComponent(disputeId)}/history`)
};
