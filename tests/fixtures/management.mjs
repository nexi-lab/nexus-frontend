import { createHash, randomUUID } from 'node:crypto';

export function createManagementFixture() {
  const credentials = new Map();
  const tuples = new Map();
  const tupleKey = (tuple) =>
    JSON.stringify([tuple.zone, tuple.object_type, tuple.object_id, tuple.relation, tuple.subject_type, tuple.subject_id, tuple.subject_relation ?? null]);
  const insert = (key, subject, admin = false, name = subject, zones = [['sharedzone', 'r']], subjectType = 'user', expiry) => {
    const record = {
      key_hash: createHash('sha256').update(key).digest('hex'),
      key_id: randomUUID(),
      name,
      subject_type: subjectType,
      subject_id: subject,
      is_admin: admin,
      revoked: false,
      zone_perms: zones,
      ...(expiry === undefined ? {} : { expires_at_ms: expiry }),
    };
    credentials.set(key, record);
    return record;
  };
  return {
    reset() {
      credentials.clear();
      tuples.clear();
      insert('sk-fixture-previous', 'previous-user');
      insert('sk-fixture-server-alice', 'server-alice');
      insert('sk-fixture-admin', 'fixture-admin', true, 'Fixture administrator', []);
    },
    identity(authorization) {
      const record = credentials.get(authorization?.replace(/^Bearer /, ''));
      if (!record || (record.expires_at_ms !== undefined && record.expires_at_ms <= Date.now())) return null;
      return {
        subject_type: record.subject_type,
        subject_id: record.subject_id,
        user_id: record.subject_id,
        agent_id: null,
        zone_id: record.zone_perms[0]?.[0] ?? 'root',
        is_admin: record.is_admin,
        zone_perms: record.zone_perms,
      };
    },
    state: () => ({ keys: [...credentials.values()], tuples: [...tuples.values()] }),
    handle({ url, request, value, identity, json }) {
      if (!url.pathname.startsWith('/v2/auth/keys') && url.pathname !== '/v2/rebac/tuples') return false;
      if (!identity) {
        json({ error: 'credential rejected' }, 401);
        return true;
      }
      if (!identity.is_admin) {
        json({ error: 'global administrator required' }, 403);
        return true;
      }
      if (url.pathname === '/v2/auth/keys' && request.method === 'GET') json({ keys: [...credentials.values()] });
      else if (url.pathname === '/v2/auth/keys' && request.method === 'POST') {
        if (
          !value.allow_existing &&
          [...credentials.values()].some((record) => record.subject_type === value.subject_type && record.subject_id === value.subject_id)
        ) {
          json({ error: 'subject already has an active credential' }, 400);
        } else {
          const key = `sk-fixture-issued-${randomUUID()}`;
          const record = insert(
            key,
            value.subject_id,
            value.admin,
            value.name,
            value.zones.map((zone) => zone.split(':')),
            value.subject_type,
            value.expires_at_ms,
          );
          json({ key, key_hash: record.key_hash, key_id: record.key_id, record });
        }
      } else if (/^\/v2\/auth\/keys\/[a-f0-9]{64}$/.test(url.pathname) && request.method === 'DELETE') {
        const hash = url.pathname.split('/').at(-1);
        const key = [...credentials].find(([, record]) => record.key_hash === hash)?.[0];
        json({ existed: key !== undefined && credentials.delete(key), key_hash: hash });
      } else if (url.pathname === '/v2/rebac/tuples' && request.method === 'GET') {
        json({ tuples: [...tuples.values()].filter((tuple) => tuple.zone === url.searchParams.get('zone')) });
      } else if (url.pathname === '/v2/rebac/tuples' && request.method === 'POST') {
        tuples.set(tupleKey(value), value);
        json({});
      } else if (url.pathname === '/v2/rebac/tuples' && request.method === 'DELETE') json({ existed: tuples.delete(tupleKey(value)) });
      else json({ error: 'unknown management route' }, 404);
      return true;
    },
  };
}
