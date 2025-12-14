import { addRoute as addRou3Route, createRouter as createRou3, findRoute } from 'rou3';
import { Context } from './context';
import { ensureResponse } from './response';
import type { BuiltRoute } from './route';
import { jsonTransformer, TRANSFORMER_HEADER, type Transformer } from './transformer';
import type { Handler, Middleware, Output } from './types';

export const runChain = async (
  stack: (Middleware<any, any, any, any> | Handler<any, any, any, any>)[],
  baseContext: { req: Request; params: Record<string, string>; var: any },
  transformer: Transformer
): Promise<{ output?: Output; response: Response }> => {
  const context = new Context(baseContext.req, baseContext.params, baseContext.var, {});
  let output: Output;

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
      output = result;
      context.res = ensureResponse(result, transformer);
    }
  };

  try {
    await invoke(0);
  } catch {
    context.res = new Response('Internal Server Error', { status: 500 });
  }

  return {
    output: output,
    response: context.res,
  };
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

type InferInitVar<R> = R extends BuiltRoute<infer InitVar, any, any, any, any, any> ? InitVar : never;

type ServerOptionsArg<InitVar extends object> = keyof InitVar extends never
  ? [options?: ServerOptions<InitVar>]
  : [options: ServerOptions<InitVar>];

export function createServer<R extends BuiltRoute<any, any, any, any, any, any>>(
  routes: R[],
  ...args: ServerOptionsArg<InferInitVar<R>>
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

    const result = await runChain(
      [...match.data.middlewares, match.data.handler],
      {
        req,
        params: match.params ?? {},
        var: options?.var ?? {},
      },
      transformerFromHeader(req.headers.get(TRANSFORMER_HEADER), configuredTransformers)
    );
    return result.response;
  };

  return { fetch };
}
