import type {
  BodyOfOutput,
  InputForRoute,
  InputRequired,
  OkStatuses,
  OutputForRoute,
  RouteTree,
  TypedResponse,
} from './client';
import { buildBody, buildPath, buildQueryString, buildTemplatePath, buildUrl, mergeRequestInit } from './request';
import type { BuiltRoute } from './route';
import { runChain } from './server';
import { jsonTransformer } from './transformer';
import type { InputBase, TypedOutput } from './types';
import type { EmptyToNever, MergeUnion } from './utils/types';

type CallerResult<O> =
  O extends TypedOutput<any, any, infer Status>
    ? Status extends OkStatuses
      ? { data: BodyOfOutput<O>; error: undefined; status: Status; ok: true; res: TypedResponse<O, 'json'> }
      : { data: undefined; error: BodyOfOutput<O>; status: Status; ok: false; res: TypedResponse<O, 'json'> }
    : { data: undefined; error: undefined; status: number; ok: boolean; res: Response };

type RequestFn<R extends BuiltRoute<any, any, any, any, any, any>> =
  InputRequired<R> extends true
    ? {
        (input: EmptyToNever<InputForRoute<R>>): Promise<CallerResult<OutputForRoute<R>>>;
        (input: EmptyToNever<InputForRoute<R>>, requestInit: RequestInit): Promise<CallerResult<OutputForRoute<R>>>;
      }
    : {
        (): Promise<CallerResult<OutputForRoute<R>>>;
        (input: EmptyToNever<InputForRoute<R>>): Promise<CallerResult<OutputForRoute<R>>>;
        (input: EmptyToNever<InputForRoute<R>>, requestInit: RequestInit): Promise<CallerResult<OutputForRoute<R>>>;
      };

export type CallerFromRouter<Routes extends BuiltRoute<any, any, any, any, any, any>[]> = MergeUnion<
  Routes[number] extends infer Route
    ? Route extends BuiltRoute<any, any, any, any, any, any>
      ? RouteTree<Route, RequestFn<Route>>
      : never
    : never
>;

export type CallerOptions<InitVar extends object> = {
  baseUrl?: string | URL;
  requestInit?: RequestInit;
} & (keyof InitVar extends never ? { var?: Record<string, never> } : { var: InitVar });

type NodeState = {
  baseUrl: string;
  segments: string[];
  initVar: object;
  routes: BuiltRoute<any, any, any, any, any, any>[];
  requestInit?: RequestInit;
};

function findRouteByTemplate(
  routes: BuiltRoute<any, any, any, any, any, any>[],
  method: string,
  templatePath: string
): BuiltRoute<any, any, any, any, any, any> | null {
  const upperMethod = method.toUpperCase();
  const exact = routes.find((r) => r.path === templatePath && r.method.toUpperCase() === upperMethod);
  if (exact) return exact;
  const fallback = routes.find((r) => r.path === templatePath && r.method.toUpperCase() === 'ALL');
  return fallback ?? null;
}

function createNode(state: NodeState): any {
  const target = (() => {}) as any;

  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (typeof prop === 'symbol') {
        return target[prop];
      }

      if (typeof prop === 'string' && prop.startsWith('$')) {
        const method = prop.slice(1).toUpperCase();

        return async (input?: InputBase, requestInit?: RequestInit) => {
          const templatePath = buildTemplatePath(state.segments);
          const path = buildPath(state.segments, input?.params);
          const queryString = buildQueryString(input?.query);
          const urlString = buildUrl(state.baseUrl, path, queryString);
          const mergedInit = mergeRequestInit(state.requestInit, requestInit);
          const headers = new Headers(mergedInit.headers);
          const body = buildBody(input, headers, mergedInit);
          const finalMethod = method === 'ALL' ? (mergedInit.method ?? 'GET') : method;

          const req = new Request(urlString, {
            ...mergedInit,
            method: finalMethod,
            headers,
            body,
          });

          const targetRoute = findRouteByTemplate(state.routes, finalMethod, templatePath);

          if (!targetRoute) {
            throw new Error(`Route not found for ${finalMethod} ${templatePath}`);
          }

          const stack = [...targetRoute.middlewares, targetRoute.handler];
          const { output, response } = await runChain(
            stack,
            {
              req,
              params: input?.params ?? {},
              var: state.initVar,
            },
            jsonTransformer
          );

          if (!output || output instanceof Response) {
            return { res: response };
          }

          return output.status >= 200 && output.status < 300
            ? { data: output.body, status: output.status, ok: true, res: response }
            : { error: output.body, status: output.status, ok: false, res: response };
        };
      }

      const nextSegments = [...state.segments, prop];
      return createNode({ ...state, segments: nextSegments });
    },
  };

  return new Proxy(target, handler);
}

type InferInitVar<R> = R extends BuiltRoute<infer InitVar, any, any, any, any, any>[] ? InitVar : never;

type CallerOptionsArg<InitVar extends object> = keyof InitVar extends never
  ? [options?: CallerOptions<InitVar>]
  : [options: CallerOptions<InitVar>];

export function createCaller<Routes extends BuiltRoute<any, any, any, any, any, any>[]>(
  routes: Routes,
  ...args: CallerOptionsArg<InferInitVar<Routes>>
): CallerFromRouter<Routes> {
  const options = args[0];

  return createNode({
    baseUrl: options?.baseUrl ? options.baseUrl.toString() : 'http://localhost',
    segments: [],
    initVar: options?.var ?? {},
    routes,
    requestInit: options?.requestInit,
  });
}
