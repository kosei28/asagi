const trimLeadingSlash = (value: string): string => {
  return value.replace(/^\/+/, '');
};

const trimTrailingSlash = (value: string): string => {
  return value.replace(/\/+$/, '');
};

const _joinPath = (prefix: string, path: string): string => {
  if (path.startsWith('/')) return `${prefix}${path}`;
  return `${prefix}/${path}`;
};

export const joinPath = (prefix: string, path: string): string => {
  return `/${trimLeadingSlash(trimTrailingSlash(_joinPath(prefix, path)))}`;
};
