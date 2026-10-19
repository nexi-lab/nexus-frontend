import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useMemo, useState } from 'react';
import type NexusAPIClient from '../api/client';
import { createPermissionsAPI, type NativeTuple, tupleIdentity } from '../api/permissions';
import { useAuth } from '../contexts/AuthContext';
import { NexusConnection } from './NexusConnection';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

interface ManagePermissionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filePath: string;
}

export function ManagePermissionsDialog(props: ManagePermissionsDialogProps) {
  const { userInfo } = useAuth();
  if (!userInfo?.is_admin || !props.open) return null;
  return <NexusConnection>{(client) => <Permissions {...props} client={client} initialZone={userInfo.zone_id} />}</NexusConnection>;
}

function Permissions({ client, initialZone, filePath, ...props }: ManagePermissionsDialogProps & { client: NexusAPIClient; initialZone: string }) {
  const api = useMemo(() => createPermissionsAPI(client), [client]);
  const [zone, setZone] = useState(initialZone);
  const [subjectType, setSubjectType] = useState('user');
  const [subject, setSubject] = useState('');
  const [relation, setRelation] = useState('');
  const [subjectRelation, setSubjectRelation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tuples = useQuery({ queryKey: ['native-relationships', zone], queryFn: () => api.list(zone), enabled: !!zone });
  const relationships = tuples.data?.filter((tuple) => tuple.object_type === 'file' && tuple.object_id === filePath);
  const grant = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.grant({
        zone,
        object_type: 'file',
        object_id: filePath,
        relation: relation.trim(),
        subject_type: subjectType.trim(),
        subject_id: subject.trim(),
        ...(subjectRelation.trim() ? { subject_relation: subjectRelation.trim() } : {}),
      });
      await tuples.refetch();
      setSubject('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to grant relationship.');
    } finally {
      setBusy(false);
    }
  };
  const revoke = async (tuple: NativeTuple) => {
    setBusy(true);
    setError('');
    try {
      await api.revoke(tuple);
      await tuples.refetch();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to revoke relationship.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog {...props}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Manage Permissions</DialogTitle>
          <DialogDescription>Relationships for {filePath}</DialogDescription>
        </DialogHeader>
        <label className="block">
          Zone
          <input className="block w-full rounded border p-2" required disabled={busy} value={zone} onChange={(event) => setZone(event.target.value)} />
        </label>
        <Button onClick={() => tuples.refetch()} disabled={!zone || tuples.isFetching || busy}>
          Refresh relationships
        </Button>
        {tuples.isLoading && <output>Loading relationships...</output>}
        {tuples.error && <p role="alert">{tuples.error.message}</p>}
        {!tuples.isLoading && !tuples.error && relationships?.length === 0 && <p>No relationships for this file.</p>}
        <ul className="space-y-2">
          {relationships?.map((tuple) => (
            <li key={tupleIdentity(tuple)} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
              <span>
                {tuple.subject_type}:{tuple.subject_id}
                {tuple.subject_relation ? `#${tuple.subject_relation}` : ''} — {tuple.relation}
              </span>
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() => revoke(tuple)}
                aria-label={`Revoke ${tuple.subject_type}:${tuple.subject_id} ${tuple.relation}`}
              >
                Revoke
              </Button>
            </li>
          ))}
        </ul>
        <form className="space-y-2 border-t pt-3" onSubmit={grant}>
          <fieldset disabled={busy} className="space-y-2">
            <h2 className="font-semibold">Grant relationship</h2>
            <label className="block">
              Subject type
              <input className="block w-full rounded border p-2" required value={subjectType} onChange={(event) => setSubjectType(event.target.value)} />
            </label>
            <label className="block">
              Subject ID
              <input className="block w-full rounded border p-2" required value={subject} onChange={(event) => setSubject(event.target.value)} />
            </label>
            <label className="block">
              Relation
              <input className="block w-full rounded border p-2" required value={relation} onChange={(event) => setRelation(event.target.value)} />
            </label>
            <label className="block">
              Subject relation (optional)
              <input className="block w-full rounded border p-2" value={subjectRelation} onChange={(event) => setSubjectRelation(event.target.value)} />
            </label>
            <Button type="submit" disabled={!zone || busy}>
              Grant relationship
            </Button>
          </fieldset>
        </form>
        {error && <p role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
