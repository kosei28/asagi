import { addRoute as addRou3Route, createRouter as createRou3, findRoute } from 'rou3';
import { Context } from './context';
import type { BuiltRoute } from './route';
import type { Handler, HandlerResult, Middleware, OutputType } from './types';

export type RouterInstance<Routes extends BuiltRoute<any, any, any, any, any>[]> = {
  routes: Routes;
  fetch: (req: Request) => Promise<Response>;
};

export type RouterSource = BuiltRoute<any, any, any, any, any> | RouterInstance<any>;

export type FlattenRoutes<Routes extends RouterSource[]> = Routes extends [infer First, ...infer Rest]
  ? First extends RouterInstance<infer R>
    ? [...R, ...FlattenRoutes<Extract<Rest, RouterSource[]>>]
    : First extends BuiltRoute<any, any, any, any, any>
      ? [First, ...FlattenRoutes<Extract<Rest, RouterSource[]>>]
      : FlattenRoutes<Extract<Rest, RouterSource[]>>
  : [];

const flattenRoutes = <Routes extends RouterSource[]>(routes: Routes): FlattenRoutes<Routes> => {
  const acc: BuiltRoute<any, any, any, any, any>[] = [];
  for (const entry of routes) {
    if ((entry as RouterInstance<any>).routes) {
      acc.push(...(entry as RouterInstance<any>).routes);
    } else {
      acc.push(entry as BuiltRoute<any, any, any, any, any>);
    }
  }
  return acc as FlattenRoutes<Routes>;
};

const defaultContentTypes: Record<OutputType, string | undefined> = {
  json: 'application/json',
  text: 'text/plain; charset=utf-8',
  body: 'application/octet-stream',
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

  const contentType = defaultContentTypes[(result as any).type as OutputType];
  if (contentType && !headers.has('content-type')) {
    headers.set('content-type', contentType);
  }

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
  stack: (Middleware<any, any, any, any> | Handler<any, any, any, any>)[],
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

    const result = await (current as Middleware<any, any, any, any>)(context, next);

    if (result !== undefined) {
      context.res = ensureResponse(result);
    }
  };

  await invoke(0);
  return context.res;
};

export const createRouter = <const Routes extends RouterSource[]>(
  routes: Routes
): RouterInstance<FlattenRoutes<Routes>> => {
  const flattenedRoutes = flattenRoutes(routes);
  const r3 = createRou3<BuiltRoute<any, any, any, any, any>>();

  for (const route of flattenedRoutes) {
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
    const targetRoute = match.data as BuiltRoute<any, any, any, any, any>;
    const chain = [...targetRoute.middlewares, targetRoute.handler];
    const result = await runChain(chain, {
      req,
      params,
      var: {},
    });
    return result;
  };

  return { routes: flattenedRoutes, fetch };
};
