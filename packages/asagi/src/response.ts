import type { Transformer } from './transformer';
import type { Output, OutputType, OutputTypeMap } from './types';

const defaultContentTypes: Record<OutputType, string | undefined> = {
  json: 'application/json',
  text: 'text/plain; charset=utf-8',
  body: 'application/octet-stream',
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

  return new Response(result.body as OutputTypeMap[typeof result.type], responseInit);
}
