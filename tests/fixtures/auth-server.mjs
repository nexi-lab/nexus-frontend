import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createFilesFixture } from './files.mjs';
import { startAccounts } from './accounts.mjs';

const accounts = await startAccounts();

const origin = 'http://127.0.0.1:4173';
let scenario = 'existing';
let calls = [];
let password = 'fixture-current-password';
const attempts = new Map();
const pending = new Set();
const files = createFilesFixture();
files.reset();
const user = {
  user_id: 'server-alice',
  email: 'alice@example.test',
  username: 'alice',
  display_name: 'Alice',
  avatar_url: null,
  primary_auth_method: 'google',
  is_global_admin: false,
  email_verified: true,
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: '2026-01-01T00:00:00Z',
};
const session = () => ({ token: 'fixture-alice-session', user, api_key: 'sk-fixture-server-alice', tenant_id: 'sharedzone' });

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1:4181');
  if (request.headers.origin === origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Credentials', 'true');
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    response.setHeader('Vary', 'Origin');
  }
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Content-Type', 'application/json');
  if (request.method === 'OPTIONS') {
    response.writeHead(204).end();
    return;
  }
  const json = (value, status = 200) => {
    response.writeHead(status).end(JSON.stringify(value));
  };
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const value = body.length && request.headers['content-type']?.startsWith('application/json') ? JSON.parse(body.toString('utf8')) : {};
  const authorization = request.headers.authorization;
  const principal =
    authorization === 'Bearer sk-fixture-previous'
      ? 'previous-user'
      : ['Bearer sk-fixture-server-alice', 'Bearer fixture-alice-session'].includes(authorization)
        ? user.user_id
        : null;
  if (url.pathname === '/__fixture/reset') {
    scenario = value.scenario || 'existing';
    calls = [];
    attempts.clear();
    pending.clear();
    files.reset();
    password = 'fixture-current-password';
    json({ ok: true });
    return;
  }
  if (url.pathname === '/__fixture/state') {
    json({ calls, files: files.state() });
    return;
  }
  if (url.pathname === '/__fixture/mail') {
    json({ messages: accounts?.mail ?? [], rust: !!accounts });
    return;
  }
  if (url.pathname === '/__fixture/account-facts') {
    json({ users: accounts?.facts(url.searchParams.get('email')) ?? [] });
    return;
  }
  if (url.pathname === '/__fixture/shutdown' && request.method === 'POST') {
    await accounts?.close();
    json({ stopped: true });
    return;
  }
  calls.push({
    path: url.pathname,
    method: request.method,
    principal,
    authorized: !!authorization,
    browserBound: !!request.headers.cookie?.includes('nexus_oauth_binding='),
    ...(url.pathname.startsWith('/v2/search/') ? { params: value } : {}),
    ...(url.pathname.startsWith('/v2/files') || url.pathname === '/v2/directories' ? { query: Object.fromEntries(url.searchParams), bytes: body.length, contentType: request.headers['content-type'], params: value } : {}),
  });
  if (['/auth/register', '/auth/request-verification', '/auth/verify-email'].includes(url.pathname)) {
    if (!accounts) return json({ detail: 'Actual Rust account fixture is required' }, 503);
    const upstream = await fetch(accounts.base + url.pathname, {
      method: request.method, headers: { 'Content-Type': 'application/json' }, body,
    });
    json(await upstream.json(), upstream.status);
    return;
  }
  if (files.handle({ url, request, response, body, value, scenario, principal, json })) return;
  if (url.pathname === '/v2/search/glob' || url.pathname === '/v2/search/grep') {
    if (!principal) return json({ error: 'credential rejected' }, 401);
    if (scenario === 'search-unavailable') return json({ error: 'Search is unavailable' }, 503);
    if (scenario === 'search-application-error') return json({ paths: [], truncated: false, error: 'Search is unavailable' });
    if (request.method !== 'POST' || typeof value.root_path !== 'string' || typeof value.pattern !== 'string') {
      return json({ error: 'native discovery parameters required' }, 400);
    }
    if (url.pathname.endsWith('/glob')) {
      return json({ paths: value.pattern === 'absent' ? [] : ['/docs/visible & notes.md'], truncated: value.pattern !== 'absent' });
    }
    return json({
      matches: [
        { path: '/docs/visible & notes.md', line_number: 1, line: 'needle & 测试', before: [], after: [] },
        { path: '/docs/visible & notes.md', line_number: 2, line: 'another needle & 测试', before: [], after: [] },
      ],
      truncated: false,
    });
  }
  if (url.pathname === '/v2/status') {
    json({ status: 'ok', version: 'fixture' });
    return;
  }
  if (url.pathname === '/v2/auth/whoami') {
    if (!principal) {
      json({ error: 'credential rejected' }, 401);
      return;
    }
    json({
      subject_type: 'user',
      subject_id: principal,
      user_id: principal,
      agent_id: null,
      zone_id: 'sharedzone',
      is_admin: false,
      zone_perms: [['sharedzone', 'r']],
    });
    return;
  }
  if (url.pathname === '/auth/oauth/google/authorize') {
    if (scenario === 'unconfigured') {
      json({ detail: 'Google sign-in is not configured' }, 503);
      return;
    }
    const state = randomUUID();
    const binding = randomUUID();
    attempts.set(state, binding);
    response.setHeader('Set-Cookie', `nexus_oauth_binding=${binding}; HttpOnly; SameSite=Lax; Path=/`);
    const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    target.searchParams.set('state', state);
    target.searchParams.set('redirect_uri', `${origin}/oauth/callback`);
    json({ auth_url: scenario === 'malformed' ? 'javascript:void(0)' : target.href, state });
    return;
  }
  if (url.pathname === '/auth/change-password' && request.method === 'POST') {
    if (principal !== user.user_id) {
      json({ detail: 'credential rejected' }, 401);
      return;
    }
    if (typeof value.current_password !== 'string' || typeof value.new_password !== 'string') {
      json({ detail: 'current_password and new_password are required' }, 422);
      return;
    }
    if (value.current_password !== password) {
      json({ detail: 'Current password is incorrect' }, 400);
      return;
    }
    password = value.new_password;
    json({ success: true, message: 'Password changed' });
    return;
  }
  if (url.pathname === '/auth/oauth/check') {
    const binding = attempts.get(value.state);
    attempts.delete(value.state);
    if (
      !binding ||
      !request.headers.cookie?.includes(`nexus_oauth_binding=${binding}`) ||
      value.provider !== 'google' ||
      value.code !== 'provider-accepted-code' ||
      scenario === 'rejected'
    ) {
      json({ detail: 'provider or browser binding rejected' }, 400);
      return;
    }
    if (scenario === 'new') {
      const ticket = randomUUID();
      pending.add(ticket);
      json({
        needs_confirmation: true,
        pending_token: ticket,
        user_info: { email: user.email, display_name: user.display_name, avatar_url: null, oauth_provider: 'google' },
        tenant_info: { tenant_id: 'sharedzone', name: 'Test workspace', domain: null, description: null, is_personal: true, can_edit_name: true },
      });
      return;
    }
    json({ needs_confirmation: false, ...session(), is_new_user: false });
    return;
  }
  if (url.pathname === '/auth/oauth/confirm') {
    if (!pending.delete(value.pending_token)) {
      json({ detail: 'unknown confirmation' }, 400);
      return;
    }
    json(session());
    return;
  }
  if (url.pathname.startsWith('/api/nfs/')) {
    if (!principal) {
      json({ error: 'credential rejected' }, 401);
      return;
    }
    const method = url.pathname.split('/').at(-1);
    const result =
      method === 'list'
        ? { files: [] }
        : method === 'is_directory'
          ? { is_directory: true }
          : method === 'exists'
            ? { exists: false }
            : method === 'get_available_namespaces'
              ? { namespaces: [] }
              : method === 'oauth_exchange_code'
                ? { success: true }
                : [];
    json({ jsonrpc: '2.0', id: value.id, result });
    return;
  }
  json({ error: 'unknown fixture route' }, 404);
});
server.listen(4181, '127.0.0.1');
