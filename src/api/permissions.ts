import type NexusAPIClient from './client';
import { NexusAPIError } from './client';
import { isRecord } from './validation';

export interface NativeTuple {
  zone: string;
  object_type: string;
  object_id: string;
  relation: string;
  subject_type: string;
  subject_id: string;
  subject_relation?: string | null;
}

function isTuple(value: unknown): value is NativeTuple {
  return (
    isRecord(value) &&
    ['zone', 'object_type', 'object_id', 'relation', 'subject_type', 'subject_id'].every((field) => typeof value[field] === 'string') &&
    (value.subject_relation === undefined || value.subject_relation === null || typeof value.subject_relation === 'string')
  );
}

export function tupleIdentity(tuple: NativeTuple): string {
  return JSON.stringify([tuple.zone, tuple.object_type, tuple.object_id, tuple.relation, tuple.subject_type, tuple.subject_id, tuple.subject_relation ?? null]);
}

function invalidResponse(): never {
  throw new NexusAPIError('The Nexus server returned an invalid relationship response.');
}

export function createPermissionsAPI(client: Pick<NexusAPIClient, 'request'>) {
  return {
    async list(zone: string): Promise<NativeTuple[]> {
      const value = await client.request<unknown>('/v2/rebac/tuples', { params: { zone }, timeout: 8000 });
      if (!isRecord(value) || !Array.isArray(value.tuples) || !value.tuples.every(isTuple) || value.tuples.some((tuple) => tuple.zone !== zone))
        return invalidResponse();
      return value.tuples;
    },
    async grant(tuple: NativeTuple): Promise<void> {
      const value = await client.request<unknown>('/v2/rebac/tuples', { method: 'POST', data: tuple });
      if (!isRecord(value) || Object.keys(value).length !== 0) return invalidResponse();
    },
    async revoke(tuple: NativeTuple): Promise<boolean> {
      const value = await client.request<unknown>('/v2/rebac/tuples', { method: 'DELETE', data: tuple });
      if (!isRecord(value) || typeof value.existed !== 'boolean') return invalidResponse();
      return value.existed;
    },
  };
}
