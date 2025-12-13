import type { InputFromSchemas, InputSchemas, Middleware, Output } from './types';
import { createInputValidator, type ValidatorOutput } from './validators';

export type MiddlewareSource = Middleware<any, any, any, any> | MiddlewareBuilder<any, any, any>;

export type InferMiddlewareVar<M extends MiddlewareSource> = M extends
  | MiddlewareBuilder<infer V, any, any>
  | Middleware<infer V, any, any, any>
  ? V
  : never;

export type InferMiddlewareInput<M extends MiddlewareSource> = M extends
  | MiddlewareBuilder<any, infer I, any>
  | Middleware<any, any, infer I, any>
  ? I
  : {};

export type InferMiddlewareOutput<M extends MiddlewareSource> = M extends
  | MiddlewareBuilder<any, any, infer O>
  | Middleware<any, any, any, infer O>
  ? Exclude<O, void | undefined>
  : never;

export class MiddlewareBuilder<Var extends object, Input extends object, O extends Output> {
  constructor(private readonly middlewares: Middleware<any, any, any, any>[]) {}

  $var<AddVar extends object>(): MiddlewareBuilder<Var & AddVar, Input, O> {
    return new MiddlewareBuilder(this.middlewares);
  }

  use<M extends MiddlewareSource = Middleware<Var, any, Input, any>>(
    middleware: M
  ): MiddlewareBuilder<Var & InferMiddlewareVar<M>, Input & InferMiddlewareInput<M>, O | InferMiddlewareOutput<M>> {
    return new MiddlewareBuilder([...this.middlewares, ...toMiddlewareList(middleware)]);
  }

  input<S extends Partial<InputSchemas>>(
    schemas: S
  ): MiddlewareBuilder<Var, Input & InputFromSchemas<S>, O | ValidatorOutput> {
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
