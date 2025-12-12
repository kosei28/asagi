export const trimTrailingSlash = (value: string): string => {
  if (value === '/') return '/';
  return value.replace(/\/+$/, '');
};

export const normalizePath = (input: string): string => {
  if (!input) return '';
  if (input === '/') return '/';
  return `/${input.replace(/^\/+/, '')}`.replace(/\/+$/, '');
};
