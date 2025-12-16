import type { Transformer } from './transformer';
import type { Output, OutputType, OutputTypeMap } from './types';
import type { FormValue } from './utils/types';

const defaultContentTypes: Record<OutputType, string | undefined> = {
  body: undefined,
  text: 'text/plain; charset=utf-8',
  json: 'application/json',
  form: undefined,
  redirect: undefined,
};

export function ensureResponse(result: Output, transformer: Transformer): Response {
  if (result === undefined) {
    return new Response(null, { status: 204 });
  }

  if (result instanceof Response) {
    return result;
  }

  const init: ResponseInit =
    result.status !== undefined || result.headers ? { status: result.status, headers: result.headers } : {};
  const headers = new Headers(init.headers);

  const contentType = defaultContentTypes[result.type];
  if (contentType && !headers.has('content-type')) {
    headers.set('content-type', contentType);
  }

  const responseInit: ResponseInit = { ...init, headers };

  if (result.type === 'json') {
    const body = transformer.stringify(result.body);
    return new Response(body, responseInit);
  }

  if (result.type === 'form') {
    const formData = new FormData();
    const formBody = result.body as Record<string, FormValue>;
    for (const [key, value] of Object.entries(formBody)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          formData.append(key, item);
        }
      } else {
        formData.append(key, value);
      }
    }
    return new Response(formData, responseInit);
  }

  if (result.type === 'redirect') {
    return new Response(null, responseInit);
  }

  return new Response(result.body as OutputTypeMap[typeof result.type], responseInit);
}
