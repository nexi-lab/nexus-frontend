import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { startAccounts } from './accounts.mjs';
import { createFilesFixture } from './files.mjs';

const accounts = await startAccounts();

const origin = 'http://127.0.0.1:4173';
let scenario = 'existing';
let calls = [];
const attempts = new Map();
const files = createFilesFixture();
files.reset();
const user = {
  user_id: 'server-alice',
  email: 'alice@example.test',
  username: 'alice',
  display_name: 'Alice',
  avatar_url: null,
  primary_auth_method: 'oauth',
  is_global_admin: false,
  email_verified: true,
  zone_id: null,
  created_at: '2026-01-01T00:00:00Z',
  last_login_at: '2026-01-01T00:00:00Z',
};
const session = () => ({ token: 'fixture-alice-session', user });

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
  const principal = authorization === 'Bearer sk-fixture-previous' ? 'previous-user' : authorization === 'Bearer sk-fixture-server-alice' ? user.user_id : null;
  if (url.pathname === '/__fixture/reset') {
    scenario = value.scenario || 'existing';
    calls = [];
    attempts.clear();
    files.reset();
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
    ...(url.pathname.startsWith('/v2/files') || url.pathname === '/v2/directories'
      ? { query: Object.fromEntries(url.searchParams), bytes: body.length, contentType: request.headers['content-type'], params: value }
      : {}),
  });
  if (url.pathname === '/auth/me' && authorization === 'Bearer fixture-alice-session') {
    json(user);
    return;
  }
  if (['/auth/register', '/auth/request-verification', '/auth/verify-email', '/auth/login', '/auth/me', '/auth/change-password'].includes(url.pathname)) {
    if (!accounts) return json({ detail: 'Actual Rust account fixture is required' }, 503);
    const headers = { 'Content-Type': 'application/json' };
    if (['/auth/me', '/auth/change-password'].includes(url.pathname) && authorization) headers.Authorization = authorization;
    const upstream = await fetch(accounts.base + url.pathname, {
      method: request.method,
      headers,
      ...(request.method === 'GET' ? {} : { body }),
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
  if (url.pathname === '/auth/oauth/google/callback') {
    const binding = attempts.get(value.state);
    attempts.delete(value.state);
    if (!binding || !request.headers.cookie?.includes(`nexus_oauth_binding=${binding}`) || value.code !== 'provider-accepted-code' || scenario === 'rejected') {
      json({ detail: 'provider or browser binding rejected' }, 400);
      return;
    }
    response.setHeader('Set-Cookie', 'nexus_oauth_binding=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
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
