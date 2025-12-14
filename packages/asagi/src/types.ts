import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Context } from './context';
import type { JSONValue, MaybePromise } from './utils/types';

export type InputBase = {
  json: JSONValue;
  form: Record<string, string | string[] | File | File[]>;
  query: Record<string, string>;
  params: Record<string, string>;
};

export type InputSchemas = {
  [K in keyof InputBase]?: StandardSchemaV1<InputBase[K], any>;
};

type InputSchemasWithoutBody = {
  query?: InputSchemas['query'];
  params?: InputSchemas['params'];
};

type InputSchemasWithJson = InputSchemasWithoutBody & {
  json?: InputSchemas['json'];
  form?: never;
};

type InputSchemasWithForm = InputSchemasWithoutBody & {
  form?: InputSchemas['form'];
  json?: never;
};

export type NewInputSchemas<Current extends InputSchemas> = 'json' extends keyof Current
  ? InputSchemasWithJson
  : 'form' extends keyof Current
    ? InputSchemasWithForm
    : InputSchemasWithJson | InputSchemasWithForm;

export type ParsedInput<S extends InputSchemas> = {
  [K in keyof S as S[K] extends StandardSchemaV1<any, any> ? K : never]: S[K] extends StandardSchemaV1<any, infer O>
    ? O
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

export type Output = TypedOutput<OutputType, any, number> | Response | undefined;

export type Next = () => Promise<void>;

export type UpdateVar<Var extends object, NewVar extends object> = Omit<Var, keyof NewVar> & NewVar;

export type Middleware<
  Var extends object,
  Params extends Record<string, string>,
  Input extends InputSchemas,
  Result extends Output | void,
> = (context: Context<Var, Params, Input>, next: Next) => MaybePromise<Result>;

export type Handler<
  Var extends object,
  Params extends Record<string, string>,
  Input extends InputSchemas,
  Result extends Output | void,
> = (context: Context<Var, Params, Input>) => MaybePromise<Result>;
