export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isStringPairs(value: unknown): value is Array<[string, string]> {
  return Array.isArray(value) && value.every((pair) => Array.isArray(pair) && pair.length === 2 && pair.every((part) => typeof part === 'string'));
}
