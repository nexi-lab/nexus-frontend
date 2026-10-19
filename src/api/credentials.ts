import type NexusAPIClient from './client';
import { NexusAPIError } from './client';
import { isRecord, isStringPairs } from './validation';

export interface NativeCredential {
  key_hash: string;
  key_id: string;
  name: string;
  subject_type: string;
  subject_id: string;
  is_admin: boolean;
  revoked: boolean;
  expires_at_ms?: number;
  zone_perms: Array<[string, string]>;
}

export interface MintCredential {
  name: string;
  subject_type: 'user' | 'service';
  subject_id: string;
  zones: string[];
  admin: boolean;
  expires_at_ms?: number;
  allow_existing: boolean;
}

function isCredential(value: unknown): value is NativeCredential {
  return (
    isRecord(value) &&
    ['key_hash', 'key_id', 'name', 'subject_type', 'subject_id'].every((field) => typeof value[field] === 'string') &&
    typeof value.key_hash === 'string' &&
    /^[a-f0-9]{64}$/.test(value.key_hash) &&
    !!value.key_id &&
    !!value.subject_id &&
    typeof value.is_admin === 'boolean' &&
    typeof value.revoked === 'boolean' &&
    isStringPairs(value.zone_perms) &&
    (value.expires_at_ms === undefined || (typeof value.expires_at_ms === 'number' && Number.isSafeInteger(value.expires_at_ms) && value.expires_at_ms >= 0))
  );
}

function invalidResponse(): never {
  throw new NexusAPIError('The Nexus server returned an invalid credential response.');
}

export function createCredentialsAPI(client: Pick<NexusAPIClient, 'request'>) {
  return {
    async list(): Promise<NativeCredential[]> {
      const value = await client.request<unknown>('/v2/auth/keys', { timeout: 8000 });
      if (!isRecord(value) || !Array.isArray(value.keys) || !value.keys.every(isCredential)) return invalidResponse();
      return value.keys;
    },
    async mint(body: MintCredential): Promise<{ key: string; record: NativeCredential }> {
      const value = await client.request<unknown>('/v2/auth/keys', { method: 'POST', data: body });
      if (
        !isRecord(value) ||
        typeof value.key !== 'string' ||
        !value.key ||
        !isCredential(value.record) ||
        value.key_hash !== value.record.key_hash ||
        value.key_id !== value.record.key_id
      )
        return invalidResponse();
      return { key: value.key, record: value.record };
    },
    async revoke(hash: string): Promise<boolean> {
      if (!/^[a-f0-9]{64}$/.test(hash)) throw new NexusAPIError('Invalid credential hash.');
      const value = await client.request<unknown>(`/v2/auth/keys/${encodeURIComponent(hash)}`, { method: 'DELETE' });
      if (!isRecord(value) || typeof value.existed !== 'boolean' || value.key_hash !== hash) return invalidResponse();
      return value.existed;
    },
  };
}
