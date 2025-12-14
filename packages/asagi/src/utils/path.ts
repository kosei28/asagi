function trimLeadingSlash(value: string): string {
  return value.replace(/^\/+/, '');
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function _joinPath(prefix: string, path: string): string {
  if (path.startsWith('/')) return `${prefix}${path}`;
  return `${prefix}/${path}`;
}

export function joinPath(prefix: string, path: string): string {
  return `/${trimLeadingSlash(trimTrailingSlash(_joinPath(prefix, path)))}`;
}
