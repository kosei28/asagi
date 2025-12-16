import { serialize } from 'cookie';
import type { InputBase } from './types';

export function buildTemplatePath(segments: string[]): string {
  if (segments.length === 0) return '/';
  return `/${segments.join('/')}`;
}

export function buildPath(segments: string[], params?: Record<string, string>): string {
  if (segments.length === 0) return '/';
  const parts = segments.map((segment) => {
    if (!segment.startsWith(':')) return segment;
    const key = segment.slice(1);
    const value = params?.[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(value);
  });
  return `/${parts.join('/')}`;
}

export function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, String(v));
    } else {
      params.append(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function buildHeaders(headers: Headers, input: InputBase | undefined): void {
  if (!input) return;

  if (input.headers) {
    for (const [key, value] of Object.entries(input.headers)) {
      if (value !== undefined && value !== null) {
        headers.set(key, String(value));
      }
    }
  }

  if (input.cookie) {
    const cookies: string[] = [];
    for (const [key, value] of Object.entries(input.cookie)) {
      if (value !== undefined && value !== null) {
        cookies.push(serialize(key, String(value)));
      }
    }

    if (cookies.length > 0) {
      const existing = headers.get('cookie');
      if (existing) {
        headers.set('cookie', `${existing}; ${cookies.join('; ')}`);
      } else {
        headers.set('cookie', cookies.join('; '));
      }
    }
  }
}

export function buildBody(
  input: InputBase | undefined,
  headers: Headers,
  requestInit?: RequestInit
): BodyInit | undefined {
  if (requestInit?.body !== undefined && requestInit.body !== null) {
    return requestInit.body;
  }

  if (input?.json !== undefined) {
    if (!headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }
    return JSON.stringify(input.json);
  }

  if (input?.form !== undefined) {
    const formData = new FormData();
    for (const [k, v] of Object.entries(input.form)) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const item of v) formData.append(k, item);
      } else {
        formData.append(k, v as any);
      }
    }
    return formData;
  }

  return requestInit?.body ?? undefined;
}

export function buildUrl(baseUrl: string | undefined, path: string, queryString: string): string {
  return new URL(`${path}${queryString}`, baseUrl).toString();
}

export function mergeRequestInit(base?: RequestInit, override?: RequestInit): RequestInit {
  const headers = new Headers(base?.headers);
  const overrideHeaders = new Headers(override?.headers);

  overrideHeaders.forEach((value, key) => {
    headers.set(key, value);
  });

  return {
    ...base,
    ...override,
    headers,
  };
}
