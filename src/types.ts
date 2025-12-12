import type { Context } from './context';

export type MaybePromise<T> = T | Promise<T>;

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

export type Middleware<Var extends object, Params extends Record<string, string>, Result extends HandlerResult> = (
  context: Context<Var, Params>,
  next: Next
) => MaybePromise<Result>;

export type Handler<Var extends object, Params extends Record<string, string>, Result extends HandlerResult> = (
  context: Context<Var, Params>
) => MaybePromise<Result>;
