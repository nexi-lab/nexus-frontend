import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type NexusAPIClient from '../api/client';
import { createCredentialsAPI, type NativeCredential } from '../api/credentials';
import { NexusConnection } from '../components/NexusConnection';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import { copyToClipboard } from '../utils';

export function AdminSettings() {
  const { userInfo } = useAuth();
  if (!userInfo?.is_admin)
    return (
      <main role="alert" className="space-y-3 p-6">
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p>Admin access required</p>
        <Link to="/files">Back to files</Link>
      </main>
    );
  return <NexusConnection>{(client) => <Credentials client={client} zone={userInfo.zone_id} />}</NexusConnection>;
}

function Credentials({ client, zone }: { client: NexusAPIClient; zone: string }) {
  const api = useMemo(() => createCredentialsAPI(client), [client]);
  const keys = useQuery({ queryKey: ['native-credentials'], queryFn: api.list });
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [subjectType, setSubjectType] = useState<'user' | 'service'>('user');
  const [admin, setAdmin] = useState(false);
  const [zones, setZones] = useState(`${zone}:r`);
  const [expires, setExpires] = useState('');
  const [allowExisting, setAllowExisting] = useState(false);
  const [issued, setIssued] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setIssued(null);
    setVisible(false);
    setCopied(false);
    try {
      const expiry = expires ? new Date(expires).getTime() : undefined;
      if (expiry !== undefined && !Number.isSafeInteger(expiry)) throw new Error('Enter a valid expiry date.');
      const result = await api.mint({
        name: name.trim(),
        subject_type: subjectType,
        subject_id: subject.trim(),
        admin,
        zones: admin
          ? []
          : zones
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
        expires_at_ms: expiry,
        allow_existing: allowExisting,
      });
      setIssued(result.key);
      await keys.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to create credential.');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (record: NativeCredential) => {
    if (!window.confirm(`Revoke ${record.name || record.subject_id} (${record.subject_type}:${record.subject_id}, ${record.key_hash})?`)) return;
    setBusy(true);
    setError('');
    try {
      await api.revoke(record.key_hash);
      await keys.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to revoke credential.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Native credentials</h1>
        <Link to="/files">Back to files</Link>
      </header>
      <section className="space-y-3 rounded border p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-semibold">Credentials</h2>
          <Button onClick={() => keys.refetch()} disabled={keys.isFetching}>
            Refresh credentials
          </Button>
        </div>
        {keys.isLoading && <output>Loading credentials...</output>}
        {keys.error && <p role="alert">{keys.error.message}</p>}
        {!keys.isLoading && !keys.error && keys.data?.length === 0 && <p>No credentials found.</p>}
        <ul className="space-y-2">
          {keys.data?.map((record) => (
            <li key={record.key_hash} className="flex flex-wrap items-center justify-between gap-3 rounded border p-3">
              <div className="min-w-0 space-y-1">
                <h3 className="font-medium">{record.name || record.subject_id}</h3>
                <p>
                  {record.subject_type}:{record.subject_id} {record.is_admin && '(global administrator)'}
                </p>
                <p>Zones: {record.zone_perms.map(([zone, perms]) => `${zone}:${perms}`).join(', ') || 'None'}</p>
                <p>Expires: {record.expires_at_ms ? new Date(record.expires_at_ms).toLocaleString() : 'Never'}</p>
                <p className="break-all text-xs text-muted-foreground">{record.key_hash}</p>
              </div>
              <Button variant="destructive" disabled={busy} onClick={() => revoke(record)} aria-label={`Revoke ${record.name || record.subject_id}`}>
                Revoke
              </Button>
            </li>
          ))}
        </ul>
      </section>
      <form className="space-y-3 rounded border p-4" onSubmit={create}>
        <fieldset disabled={busy} className="space-y-3">
          <h2 className="text-lg font-semibold">Create credential</h2>
          <label className="block">
            Name
            <input className="block w-full rounded border p-2" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block">
            Subject type
            <select className="block rounded border p-2" value={subjectType} onChange={(event) => setSubjectType(event.target.value as 'user' | 'service')}>
              <option value="user">User</option>
              <option value="service">Service</option>
            </select>
          </label>
          <label className="block">
            Subject ID
            <input className="block w-full rounded border p-2" required value={subject} onChange={(event) => setSubject(event.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={admin} onChange={(event) => setAdmin(event.target.checked)} />
            Global administrator
          </label>
          <label className="block">
            Zone grants (one zone:permissions per line)
            <textarea
              className="block w-full rounded border p-2"
              required={!admin}
              disabled={admin}
              value={zones}
              onChange={(event) => setZones(event.target.value)}
            />
          </label>
          <label className="block">
            Expiry (optional)
            <input className="block rounded border p-2" type="datetime-local" value={expires} onChange={(event) => setExpires(event.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={allowExisting} onChange={(event) => setAllowExisting(event.target.checked)} />
            Allow another credential for this subject
          </label>
          <Button type="submit" disabled={busy}>
            Create credential
          </Button>
        </fieldset>
      </form>
      {issued && (
        <section className="space-y-3 rounded border p-4" aria-label="Issued credential">
          <h2 className="text-lg font-semibold">Save this credential</h2>
          <p>The server returns its plaintext once.</p>
          <input
            aria-label="New native credential"
            className="w-full rounded border p-2 font-mono"
            readOnly
            type={visible ? 'text' : 'password'}
            value={issued}
          />
          <div className="flex gap-2">
            <Button onClick={() => setVisible(!visible)}>{visible ? 'Hide credential' : 'Show credential'}</Button>
            <Button
              onClick={async () => {
                try {
                  await copyToClipboard(issued);
                  setCopied(true);
                } catch (error) {
                  setError(error instanceof Error ? error.message : 'Unable to copy credential.');
                }
              }}
            >
              {copied ? 'Copied' : 'Copy credential'}
            </Button>
            <Button
              onClick={() => {
                setIssued(null);
                setVisible(false);
              }}
            >
              Done
            </Button>
          </div>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
