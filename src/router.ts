import { addRoute as addRou3Route, createRouter as createRou3, findRoute } from 'rou3';
import { Context } from './context';
import type { BuiltRoute } from './route';
import type { Handler, HandlerResult, Middleware } from './types';

export type RouterInput = BuiltRoute<any, any, any> | RouterInstance<any>;

export type RouterInstance<T extends readonly RouterInput[]> = {
  routes: BuiltRoute<any, any, any>[];
  fetch: (req: Request) => Promise<Response>;
  definitions: T;
};

const flattenRoutes = (input: readonly RouterInput[]): BuiltRoute<any, any, any>[] => {
  const acc: BuiltRoute<any, any, any>[] = [];
  for (const entry of input) {
    if ((entry as RouterInstance<any>).routes) {
      acc.push(...(entry as RouterInstance<any>).routes);
    } else {
      acc.push(entry as BuiltRoute<any, any, any>);
    }
  }
  return acc;
};

const ensureResponse = (result: HandlerResult): Response => {
  if (result === undefined) {
    return new Response(null, { status: 204 });
  }

  if (result instanceof Response) {
    return result;
  }

  const init: ResponseInit =
    result.status !== undefined || result.headers ? { status: result.status, headers: result.headers } : {};
  const headers = new Headers(init.headers);
  const responseInit: ResponseInit = { ...init, headers };

  let response: Response;
  if (result.type === 'json') {
    response = Response.json(result.body, responseInit);
  } else {
    response = new Response(result.body as any, responseInit);
  }

  return response;
};

const runChain = async (
  stack: (Middleware<any, any, any> | Handler<any, any, any>)[],
  baseContext: { req: Request; params: any; var: any }
): Promise<Response> => {
  const context = new Context(baseContext.req, baseContext.params, baseContext.var);

  const invoke = async (index: number): Promise<void> => {
    const current = stack[index];
    if (!current) {
      return;
    }

    const next = async () => {
      await invoke(index + 1);
    };

    const result = await (current as Middleware<any, any, any>)(context, next);

    if (result !== undefined) {
      context.res = ensureResponse(result);
    }
  };

  await invoke(0);
  return context.res;
};

export const createRouter = <const Defs extends readonly RouterInput[]>(definitions: Defs): RouterInstance<Defs> => {
  const routes = flattenRoutes(definitions);
  const r3 = createRou3<BuiltRoute<any, any, any>>();

  for (const route of routes) {
    addRou3Route(r3, route.method.toUpperCase(), route.path, route);
  }

  const fetch = async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const match =
      (findRoute(r3, req.method, url.pathname, { params: true }) as any) ??
      (findRoute(r3, 'ALL', url.pathname, { params: true }) as any);

    if (!match) {
      return new Response('Not Found', { status: 404 });
    }

    const params = (match.params ?? {}) as Record<string, string>;
    const targetRoute = match.data as BuiltRoute<any, any, any>;
    const chain = [...targetRoute.middlewares, targetRoute.handler];
    const result = await runChain(chain, {
      req,
      params,
      var: {},
    });
    return result;
  };

  return { routes, fetch, definitions } as RouterInstance<Defs>;
};
