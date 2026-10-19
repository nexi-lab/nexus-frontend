export function normalizeServerURL(value: string): string {
  const invalid = () => new Error('Enter a Nexus server URL with http:// or https:// and no credentials, query or fragment.');
  if (!/^https?:\/\//i.test(value.trim())) throw invalid();
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw invalid();
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) throw invalid();
  return url.href.replace(/\/$/, '');
}
