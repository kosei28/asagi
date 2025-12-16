import type { StandardSchemaV1 } from '@standard-schema/spec';
import { buildBody, buildHeaders, buildPath, buildQueryString, buildUrl, mergeRequestInit } from './request';
import type { BuiltRoute } from './route';
import {
  jsonTransformer,
  TRANSFORMER_HEADER,
  type Transformer,
  type TransformerParsed,
  type TransformKind,
} from './transformer';
import type { InputBase, InputSchemas, TypedOutput } from './types';
import type { EmptyToNever, FormValue, IntRange, MergeUnion } from './utils/types';

export type Input<S extends InputSchemas> = {
  [K in keyof S as S[K] extends StandardSchemaV1<any, any> ? K : never]: S[K] extends StandardSchemaV1<infer I, any>
    ? I
    : never;
};

export type ParamsForRoute<R> = R extends BuiltRoute<any, any, any, infer Params, any, any> ? Params : never;

export type InputSchemasForRoute<R> = R extends BuiltRoute<any, any, any, any, infer Input, any> ? Input : {};

export type InputForRoute<R extends BuiltRoute<any, any, any, any, any, any>> = Input<InputSchemasForRoute<R>> &
  (keyof ParamsForRoute<R> extends never ? {} : { params: ParamsForRoute<R> });

export type InputRequired<R extends BuiltRoute<any, any, any, any, any, any>> = keyof InputForRoute<R> extends never
  ? false
  : true;

export type OutputForRoute<R> = R extends BuiltRoute<any, any, any, any, any, infer O> ? O : never;

export type OkStatuses = IntRange<200, 300>;

export type ErrorStatuses = IntRange<400, 600>;

export type BodyOfOutput<O> = O extends TypedOutput<any, infer Body, any> ? Body : never;

export type TypedResponse<O, Kind extends keyof TransformKind> = O extends TypedOutput<
  infer Type,
  infer Body,
  infer Status
>
  ? Omit<Response, 'json' | 'text' | 'status' | 'ok'> & {
      status: Status;
      ok: Status extends OkStatuses ? true : false;
      json(): Promise<Type extends 'json' ? TransformerParsed<Kind, Body> : unknown>;
      text(): Promise<Type extends 'text' ? (Body extends string ? Body : string) : string>;
    }
  : Response;

type ClientResult<O, Kind extends keyof TransformKind> = O extends TypedOutput<infer Type, any, infer Status>
  ? Type extends 'body'
    ? {
        data: Status extends OkStatuses ? unknown : undefined;
        error: Status extends ErrorStatuses ? unknown : undefined;
        status: Status;
        ok: Status extends OkStatuses ? true : false;
        res: TypedResponse<O, Kind>;
      }
    : Type extends 'redirect'
      ? {
          data: undefined;
          error: undefined;
          status: Status;
          ok: Status extends OkStatuses ? true : false;
          res: TypedResponse<O, Kind>;
        }
      : {
          data: Status extends OkStatuses ? BodyOfOutput<O> : undefined;
          error: Status extends ErrorStatuses ? BodyOfOutput<O> : undefined;
          status: Status;
          ok: Status extends OkStatuses ? true : false;
          res: TypedResponse<O, Kind>;
        }
  : { data: unknown; error: unknown; status: number; ok: boolean; res: Response };

type RequestFn<
  R extends BuiltRoute<any, any, any, any, any, any>,
  Kind extends keyof TransformKind,
> = InputRequired<R> extends true
  ? {
      (input: EmptyToNever<InputForRoute<R>>): Promise<ClientResult<OutputForRoute<R>, Kind>>;
      (input: EmptyToNever<InputForRoute<R>>, requestInit: RequestInit): Promise<ClientResult<OutputForRoute<R>, Kind>>;
    }
  : {
      (): Promise<ClientResult<OutputForRoute<R>, Kind>>;
      (input: EmptyToNever<InputForRoute<R>>): Promise<ClientResult<OutputForRoute<R>, Kind>>;
      (input: EmptyToNever<InputForRoute<R>>, requestInit: RequestInit): Promise<ClientResult<OutputForRoute<R>, Kind>>;
    };

export type RouteLeaf<R extends BuiltRoute<any, any, any, any, any, any>, Leaf> = {
  [K in `$${Lowercase<R['method']>}`]: Leaf;
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

export type RouteTree<R extends BuiltRoute<any, any, any, any, any, any>, Leaf> = PathObject<
  SplitPath<R['path']>,
  RouteLeaf<R, Leaf>
>;

export type ClientFromRouter<
  R extends BuiltRoute<any, any, any, any, any, any>,
  Kind extends keyof TransformKind,
> = MergeUnion<R extends any ? RouteTree<R, RequestFn<R, Kind>> : never>;

export type ClientOptions = {
  baseUrl?: string | URL;
  transformer?: Transformer;
  fetch?: typeof fetch;
  requestInit?: RequestInit;
};

async function parseFormData(formData: FormData): Promise<Record<string, FormValue>> {
  const result: Record<string, FormValue> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key);
    if (values.length === 1) {
      result[key] = values[0] as string | File;
    } else {
      result[key] = values as string[] | File[];
    }
  }
  return result;
}

async function parseBody(response: Response, transformer: Transformer): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return transformer.parse(await response.text());
  }

  if (contentType.startsWith('text/')) {
    return response.text();
  }

  if (contentType.includes('multipart/form-data')) {
    return parseFormData(await response.formData());
  }

  return undefined;
}

type NodeState = {
  baseUrl: string;
  segments: string[];
  transformer: Transformer;
  fetch: typeof fetch;
  requestInit?: RequestInit;
};

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
          const path = buildPath(state.segments, input?.params);
          const queryString = buildQueryString(input?.query);
          const urlString = buildUrl(state.baseUrl, path, queryString);
          const mergedInit = mergeRequestInit(state.requestInit, requestInit);
          const headers = new Headers(mergedInit.headers);
          buildHeaders(headers, input);
          headers.set(TRANSFORMER_HEADER, state.transformer.name);
          const body = buildBody(input, headers, mergedInit);
          const finalMethod = method === 'ALL' ? (mergedInit.method ?? 'GET') : method;

          const response = await state.fetch(urlString, {
            ...mergedInit,
            method: finalMethod,
            headers,
            body,
          });

          const wrapped = new Proxy(response, {
            get(target, prop) {
              if (prop === 'json') {
                return async () => state.transformer.parse(await target.clone().text());
              }
              const value = Reflect.get(target, prop, target);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          });

          const parsedBody = await parseBody(response.clone(), state.transformer);

          const ok = response.status >= 200 && response.status < 300;
          const isError = response.status >= 400 && response.status < 600;

          return {
            data: ok ? parsedBody : undefined,
            error: isError ? parsedBody : undefined,
            status: response.status,
            ok,
            res: wrapped,
          };
        };
      }

      const nextSegments = [...state.segments, prop];
      return createNode({ ...state, segments: nextSegments });
    },
  };

  return new Proxy(target, handler);
}

export function createClient<
  Routes extends BuiltRoute<any, any, any, any, any, any>[],
  T extends Transformer = Transformer<'json'>,
>(
  options: ClientOptions = {}
): ClientFromRouter<
  Routes[number],
  T extends Transformer<infer Kind> ? (Kind extends keyof TransformKind ? Kind : never) : never
> {
  return createNode({
    baseUrl: options.baseUrl ? options.baseUrl.toString() : '',
    segments: [],
    transformer: options.transformer ?? jsonTransformer,
    fetch: options.fetch ?? globalThis.fetch,
    requestInit: options.requestInit,
  });
}
