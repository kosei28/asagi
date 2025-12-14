import { addRoute as addRou3Route, createRouter as createRou3, findRoute } from 'rou3';
import { Context } from './context';
import type { BuiltRoute } from './route';
import { jsonTransformer, TRANSFORMER_HEADER, type Transformer } from './transformer';
import type { Handler, HandlerResult, Middleware, OutputType } from './types';

const defaultContentTypes: Record<OutputType, string | undefined> = {
  json: 'application/json',
  text: 'text/plain; charset=utf-8',
  body: 'application/octet-stream',
};

const ensureResponse = (result: HandlerResult, transformer: Transformer): Response => {
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

  let response: Response;
  if (result.type === 'json') {
    const body = transformer.stringify(result.body);
    response = new Response(body, responseInit);
  } else {
    response = new Response(result.body, responseInit);
  }

  return response;
};

const runChain = async (
  stack: (Middleware<any, any, any, any> | Handler<any, any, any, any>)[],
  baseContext: { req: Request; params: any; var: any },
  transformer: Transformer
): Promise<Response> => {
  const context = new Context(baseContext.req, baseContext.params, baseContext.var, {});

  const invoke = async (index: number): Promise<void> => {
    const current = stack[index];
    if (!current) {
      return;
    }

    const next = async () => {
      await invoke(index + 1);
    };

    const result = await (current as Middleware<any, any, any, any>)(context, next);

    if (result !== undefined) {
      context.res = ensureResponse(result, transformer);
    }
  };

  await invoke(0);
  return context.res;
};

const transformerFromHeader = (name: string | null, list: Transformer[]): Transformer => {
  if (name) {
    const found = list.find((t) => t.name === name);
    if (found) return found;
  }
  return list[0] ?? jsonTransformer;
};

export type ServerOptions<InitVar extends object> = {
  basePath?: string;
  transformers?: Transformer[];
} & (keyof InitVar extends never ? { var?: Record<string, never> } : { var: InitVar });

export type Server = {
  fetch: (req: Request) => Promise<Response>;
};

type InferInitVar<R> = R extends BuiltRoute<infer InitVar, any, any, any, any, any>[] ? InitVar : never;

type ServerOptionsArg<InitVar extends object> = keyof InitVar extends never
  ? [options?: ServerOptions<InitVar>]
  : [options: ServerOptions<InitVar>];

export function createServer<Routes extends BuiltRoute<any, any, any, any, any, any>[]>(
  routes: Routes,
  ...args: ServerOptionsArg<InferInitVar<Routes>>
): Server {
  const options = args[0];
  const configuredTransformers = [jsonTransformer, ...(options?.transformers ?? [])];

  const r3 = createRou3<BuiltRoute<any, any, any, any, any, any>>();

  for (const route of routes) {
    addRou3Route(r3, route.method.toUpperCase(), route.path, route);
  }

  const basePath = options?.basePath ?? '';

  const fetch = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    let pathname = url.pathname;

    if (basePath && pathname.startsWith(basePath)) {
      pathname = pathname.slice(basePath.length) || '/';
    } else if (basePath) {
      return new Response('Not Found', { status: 404 });
    }

    const match =
      findRoute(r3, req.method, pathname, { params: true }) ?? findRoute(r3, 'ALL', pathname, { params: true });

    if (!match) {
      return new Response('Not Found', { status: 404 });
    }

    const params = match.params ?? {};
    const targetRoute = match.data;
    const transformer = transformerFromHeader(req.headers.get(TRANSFORMER_HEADER), configuredTransformers);
    const chain = [...targetRoute.middlewares, targetRoute.handler];
    const result = await runChain(
      chain,
      {
        req,
        params,
        var: options?.var ?? {},
      },
      transformer
    );
    return result;
  };

  return { fetch };
}
