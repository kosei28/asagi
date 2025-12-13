import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Context } from './context';

export type MaybePromise<T> = T | Promise<T>;

export type InputSchemas = {
  json: StandardSchemaV1<any, any>;
  form: StandardSchemaV1<any, any>;
  query: StandardSchemaV1<any, any>;
  params: StandardSchemaV1<any, any>;
};

export type InputFromSchemas<S extends Partial<InputSchemas>> = {
  [K in keyof S as S[K] extends StandardSchemaV1<any, any> ? K : never]: S[K] extends StandardSchemaV1<
    any,
    infer Output
  >
    ? Output
    : never;
};

export type OutputTypeMap = {
  json: any;
  text: string;
  body: BodyInit;
};

export type OutputType = keyof OutputTypeMap;

export type TypedOutput<Type extends OutputType, Body, Status extends number = number> = {
  type: Type;
  body: Body;
  status: Status;
  statusText?: string;
  headers?: HeadersInit;
};

export type Output = TypedOutput<OutputType, any, number> | Response;

export type Next = () => Promise<void>;

export type HandlerResult = TypedOutput<OutputType, any> | Response | void | undefined;

export type Middleware<
  Var extends object,
  Params extends Record<string, string>,
  Input extends object,
  Result extends HandlerResult,
> = (context: Context<Var, Params, Input>, next: Next) => MaybePromise<Result>;

export type Handler<
  Var extends object,
  Params extends Record<string, string>,
  Input extends object,
  Result extends HandlerResult,
> = (context: Context<Var, Params, Input>) => MaybePromise<Result>;
