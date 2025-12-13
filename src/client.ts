import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { BuiltRoute } from './route';
import type { RouterInstance } from './router';
import type { InputSchemas, TypedOutput } from './types';
import type { EmptyToNever, IntRange, MergeUnion } from './utils/types';

type InputBase = {
  [K in keyof InputSchemas]?: InputSchemas[K] extends StandardSchemaV1<infer I, any> ? I : never;
};

type Input<S extends Partial<InputSchemas>> = {
  [K in keyof S as S[K] extends StandardSchemaV1<any, any> ? K : never]: S[K] extends StandardSchemaV1<infer I, any>
    ? I
    : never;
};

type ParamsForRoute<R> = R extends BuiltRoute<any, any, infer Params, any, any> ? Params : never;

type InputSchemasForRoute<R> = R extends BuiltRoute<any, any, any, infer Input, any> ? Input : {};

type InputForRoute<R extends BuiltRoute<any, any, any, any, any>> = Input<InputSchemasForRoute<R>> &
  (keyof ParamsForRoute<R> extends never ? {} : { params: ParamsForRoute<R> });

type InputRequired<R extends BuiltRoute<any, any, any, any, any>> = keyof InputForRoute<R> extends never ? false : true;

type OutputForRoute<R> = R extends BuiltRoute<any, any, any, any, infer O> ? O : never;

type OkStatuses = IntRange<200, 300>;

type IsOkStatus<S> = S extends number ? (S extends OkStatuses ? true : false) : boolean;

type TypedResponse<O> =
  O extends TypedOutput<infer Type, infer Body, infer Status>
    ? Omit<Response, 'json' | 'text' | 'status' | 'ok'> & {
        status: Status;
        ok: IsOkStatus<Status>;
        json(): Promise<Type extends 'json' ? Body : unknown>;
        text(): Promise<Type extends 'text' ? (Body extends string ? Body : string) : string>;
      }
    : Response;

type RequestFn<R extends BuiltRoute<any, any, any, any, any>> =
  InputRequired<R> extends true
    ? {
        (input: EmptyToNever<InputForRoute<R>>): Promise<TypedResponse<OutputForRoute<R>>>;
        (input: EmptyToNever<InputForRoute<R>>, requestInit: RequestInit): Promise<TypedResponse<OutputForRoute<R>>>;
      }
    : {
        (): Promise<TypedResponse<OutputForRoute<R>>>;
        (input: EmptyToNever<InputForRoute<R>>): Promise<TypedResponse<OutputForRoute<R>>>;
        (input: EmptyToNever<InputForRoute<R>>, requestInit: RequestInit): Promise<TypedResponse<OutputForRoute<R>>>;
      };

type RouteLeaf<R extends BuiltRoute<any, any, any, any, any>> = {
  [K in `$${Lowercase<R['method']>}`]: RequestFn<R>;
};

type SplitPath<P extends string> = string extends P
  ? []
  : P extends `/${infer Rest}`
    ? SplitPath<Rest>
    : P extends ''
      ? []
      : P extends `${infer Head}/${infer Tail}`
        ? [Head, ...SplitPath<Tail>]
        : [P];

type PathObject<Segments extends string[], Leaf> = Segments extends []
  ? Leaf
  : Segments extends [infer Head extends string, ...infer Tail extends string[]]
    ? { [K in Head]: PathObject<Tail, Leaf> }
    : Record<string, Leaf>;

type RouteTree<R extends BuiltRoute<any, any, any, any, any>> = PathObject<SplitPath<R['path']>, RouteLeaf<R>>;

type ClientFromRouter<R extends RouterInstance<any>> =
  R extends RouterInstance<infer Routes>
    ? MergeUnion<
        Routes[number] extends infer Route
          ? Route extends BuiltRoute<any, any, any, any, any>
            ? RouteTree<Route>
            : never
          : never
      >
    : never;

type NodeState = {
  baseUrl: string;
  segments: string[];
};

const buildPath = (segments: string[], params: Record<string, string>): string => {
  if (segments.length === 0) return '/';
  const parts = segments.map((segment) => {
    if (!segment.startsWith(':')) return segment;
    const key = segment.slice(1);
    const value = params[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    return encodeURIComponent(value);
  });
  return `/${parts.join('/')}`;
};

const buildQueryString = (query: Record<string, unknown> | undefined): string => {
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
};

const createNode = (state: NodeState): any => {
  const target = (() => {}) as any;

  const handler: ProxyHandler<any> = {
    get(_t, prop) {
      if (typeof prop === 'symbol') {
        return target[prop];
      }

      if (typeof prop === 'string' && prop.startsWith('$')) {
        const method = prop.slice(1).toUpperCase();
        return async (input?: InputBase, requestInit?: RequestInit) => {
          const path = buildPath(state.segments, input?.params ?? {});

          const queryString = buildQueryString(input?.query ?? {});
          const urlString = state.baseUrl
            ? new URL(`${path}${queryString}`, state.baseUrl).toString()
            : `${path}${queryString}`;

          const headers = new Headers(requestInit?.headers ?? {});

          let body: BodyInit | undefined = requestInit?.body ?? undefined;

          if (input?.json !== undefined) {
            body = JSON.stringify(input.json);
            if (!headers.has('content-type')) {
              headers.set('content-type', 'application/json');
            }
          } else {
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
              body = formData;
            }
          }

          const finalMethod = method === 'ALL' ? (requestInit?.method ?? 'GET') : method;

          const response = await fetch(urlString, {
            ...requestInit,
            method: finalMethod,
            headers,
            body,
          });
          return response;
        };
      }

      const nextSegments = [...state.segments, prop];
      return createNode({ ...state, segments: nextSegments });
    },
  };

  return new Proxy(target, handler);
};

export const createClient = <R extends RouterInstance<any>>(baseUrl: string | URL = ''): ClientFromRouter<R> => {
  const normalizedBase = baseUrl ? baseUrl.toString() : '';
  return createNode({ baseUrl: normalizedBase, segments: [] });
};
