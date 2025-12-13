import type { InputSchemas, Middleware, Output, UpdateVar } from './types';
import { createInputValidator, type ValidatorOutput } from './validators';

export type MiddlewareSource = Middleware<any, any, any, any> | MiddlewareBuilder<any, any, any>;

export type InferMiddlewareVar<M extends MiddlewareSource> =
  M extends MiddlewareBuilder<infer V1, any, any> ? V1 : M extends Middleware<infer V2, any, any, any> ? V2 : never;

export type InferMiddlewareInput<M extends MiddlewareSource> =
  M extends MiddlewareBuilder<any, infer I1, any> ? I1 : M extends Middleware<any, any, infer I2, any> ? I2 : {};

export type InferMiddlewareOutput<M extends MiddlewareSource> =
  M extends MiddlewareBuilder<any, any, infer O1>
    ? Exclude<O1, void | undefined>
    : M extends Middleware<any, any, any, infer O2>
      ? Exclude<O2, void | undefined>
      : never;

export class MiddlewareBuilder<Var extends object, Input extends Partial<InputSchemas>, O extends Output> {
  constructor(private readonly middlewares: Middleware<any, any, any, any>[]) {}

  $var<NewVar extends object>(): MiddlewareBuilder<UpdateVar<Var, NewVar>, Input, O> {
    return new MiddlewareBuilder(this.middlewares);
  }

  use<M extends MiddlewareSource = Middleware<Var, any, Input, any>>(
    middleware: M
  ): MiddlewareBuilder<Var & InferMiddlewareVar<M>, Input & InferMiddlewareInput<M>, O | InferMiddlewareOutput<M>> {
    return new MiddlewareBuilder([...this.middlewares, ...toMiddlewareList(middleware)]);
  }

  input<S extends Partial<InputSchemas>>(schemas: S): MiddlewareBuilder<Var, Input & S, O | ValidatorOutput> {
    const validator = createInputValidator(schemas);
    return new MiddlewareBuilder([...this.middlewares, validator]);
  }
}

const isMiddlewareBuilder = (value: MiddlewareSource): value is MiddlewareBuilder<any, any, any> => {
  return (
    value instanceof MiddlewareBuilder ||
    (typeof value === 'object' && value !== null && Array.isArray((value as any).middlewares))
  );
};

export const toMiddlewareList = (value: MiddlewareSource): Middleware<any, any, any, any>[] =>
  isMiddlewareBuilder(value) ? (value as any).middlewares : [value];
