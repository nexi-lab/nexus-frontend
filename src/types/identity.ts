export interface NativeIdentity {
  subject_type: string;
  subject_id: string;
  user_id: string;
  agent_id: string | null;
  zone_id: string;
  is_admin: boolean;
  zone_perms: Array<[string, string]>;
}
