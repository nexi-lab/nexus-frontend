export function createFilesFixture() {
  const entries = new Map();
  const metadata = (path, entry) => ({
    path,
    size: entry.content?.length ?? 0,
    mime_type: 'application/octet-stream',
    is_directory: entry.directory,
    version: 1,
    gen: 1,
    zone_id: 'sharedzone',
    created_at_ms: 1767225600000,
    modified_at_ms: 1767225600000,
    owner_id: 'server-alice',
  });
  return {
    reset() {
      entries.clear();
      entries.set('/', { directory: true });
      entries.set('/docs', { directory: true });
      entries.set('/docs/notes & 测试.txt', { directory: false, content: Buffer.from('{"error":"actual file content"}') });
    },
    state: () => [...entries].map(([path, entry]) => ({ ...metadata(path, entry), base64: entry.content?.toString('base64') })),
    handle({ url, request, response, body, value, scenario, principal, json }) {
      if (!['/v2/files', '/v2/files/metadata', '/v2/files/rename', '/v2/directories'].includes(url.pathname)) return false;
      if (!principal) {
        json({ error: 'credential rejected' }, 401);
        return true;
      }
      if (scenario === 'files-unavailable') {
        json({ error: 'VFS is unavailable' }, 503);
        return true;
      }
      if (scenario === 'files-forbidden') {
        json({ error: 'File access is forbidden' }, 403);
        return true;
      }
      const path = url.searchParams.get('path') ?? value.path;
      const entry = entries.get(path);
      if (url.pathname === '/v2/directories' && request.method === 'GET') {
        if (scenario === 'cache-isolation') {
          const child = `${path.replace(/\/$/, '')}/private-${principal}`;
          json({ entries: [metadata(child, { directory: true })] });
        } else if (scenario !== 'file-crud') json({ entries: [] });
        else {
          const prefix = path === '/' ? '/' : `${path}/`;
          json({
            entries: [...entries]
              .filter(
                ([name]) =>
                  name.startsWith(prefix) && name !== path && (url.searchParams.get('recursive') === 'true' || !name.slice(prefix.length).includes('/')),
              )
              .map(([name, file]) => metadata(name, file)),
          });
        }
      } else if (url.pathname === '/v2/directories' && request.method === 'POST') {
        entries.set(value.path, { directory: true });
        json({ hit: true });
      } else if (url.pathname === '/v2/files/metadata') {
        if (entry) json(metadata(path, entry));
        else json({ error: 'File does not exist' }, 404);
      } else if (url.pathname === '/v2/files/rename') {
        const source = entries.get(value.path);
        if (!source) json({ error: 'File does not exist' }, 404);
        else {
          for (const [name, file] of [...entries]) {
            if (name === value.path || name.startsWith(`${value.path}/`)) {
              entries.delete(name);
              entries.set(value.new_path + name.slice(value.path.length), file);
            }
          }
          json({ success: true, is_directory: source.directory });
        }
      } else if (request.method === 'PUT') {
        entries.set(path, { directory: false, content: body });
        json({ size: body.length, gen: 1, content_id: 'fixture-content' });
      } else if (request.method === 'DELETE') {
        const children = [...entries.keys()].filter((name) => name.startsWith(`${path}/`));
        if (children.length && url.searchParams.get('recursive') !== 'true') json({ error: 'Directory is not empty' }, 409);
        else {
          const deleted = entries.delete(path);
          for (const name of children) entries.delete(name);
          json({ deleted });
        }
      } else if (!entry || entry.directory) json({ error: 'File does not exist' }, 404);
      else {
        response.setHeader('Content-Type', 'application/octet-stream');
        response.writeHead(200).end(entry.content);
      }
      return true;
    },
  };
}
