export function isWithinPath(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root.replace(/\/$/, '')}/`);
}

export function renamedPath(path: string, oldPath: string, newPath: string): string {
  return isWithinPath(path, oldPath) ? newPath + path.slice(oldPath.length) : path;
}
