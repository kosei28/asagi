import type { Middleware, Output } from './types';

export type MiddlewareSource = Middleware<any, any, any> | MiddlewareBuilder<any, any>;

export type InferMiddlewareVarFromInput<M extends MiddlewareSource> = M extends
  | MiddlewareBuilder<infer V, any>
  | Middleware<infer V, any, any>
  ? V
  : never;

export type InferMiddlewareOutput<M extends MiddlewareSource> = M extends
  | MiddlewareBuilder<any, infer O>
  | Middleware<any, any, infer O>
  ? Exclude<O, void>
  : never;

export class MiddlewareBuilder<Var extends object, O extends Output> {
  constructor(private readonly middlewares: Middleware<any, any, any>[]) {}

  var<AddVar extends object>(): MiddlewareBuilder<Var & AddVar, O> {
    return new MiddlewareBuilder<Var & AddVar, O>(this.middlewares);
  }

  use<M extends MiddlewareSource = Middleware<Var, any, any>>(
    middleware: M
  ): MiddlewareBuilder<Var & InferMiddlewareVarFromInput<M>, O | InferMiddlewareOutput<M>> {
    return new MiddlewareBuilder<Var & InferMiddlewareVarFromInput<M>, O | InferMiddlewareOutput<M>>([
      ...this.middlewares,
      ...toMiddlewareList(middleware),
    ]);
  }
}

const isMiddlewareBuilder = (value: MiddlewareSource): value is MiddlewareBuilder<any, any> => {
  return (
    value instanceof MiddlewareBuilder ||
    (typeof value === 'object' && value !== null && Array.isArray((value as any).middlewares))
  );
};

export const toMiddlewareList = (value: MiddlewareSource): Middleware<any, any, any>[] =>
  isMiddlewareBuilder(value) ? (value as any).middlewares : [value];
