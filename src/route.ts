import type { InferRouteParams } from 'rou3';
import {
  type InferMiddlewareInput,
  type InferMiddlewareOutput,
  type InferMiddlewareVar,
  type MiddlewareSource,
  toMiddlewareList,
} from './middleware';
import { normalizePath, trimTrailingSlash } from './paths';
import type { Handler, InputFromSchemas, InputSchemas, Middleware, Output } from './types';
import { createInputValidator, type ValidatorOutput } from './validators';

export type JoinPath<A extends string, B extends string> = `${A}${B}` extends `//${infer Rest}`
  ? `/${Rest}`
  : `${A}${B}`;

export type TrimTrailingSlash<T extends string> = T extends `${infer Body}/` ? Body : T;

export type InferHandlerOutput<T> =
  T extends Handler<any, any, any, infer O> ? (O extends void | undefined ? Response : O) : never;

export type BuiltRoute<
  Method extends string,
  Path extends string,
  Params extends Record<string, string>,
  Input extends object,
  O extends Output,
> = {
  method: Method;
  path: Path;
  middlewares: Middleware<any, Params, Input, any>[];
  handler: Handler<any, Params, Input, O>;
};

export class RouteBuilder<
  Var extends object,
  Prefix extends string,
  Method extends string,
  Path extends string,
  Input extends object,
  O extends Output,
> {
  constructor(
    private readonly prefix: Prefix,
    private readonly path: Path,
    private readonly method: Method,
    private readonly middlewares: Middleware<any, any, any, any>[]
  ) {}

  $var<AddVar extends object>(): RouteBuilder<Var & AddVar, Prefix, Method, Path, Input, O> {
    return new RouteBuilder<Var & AddVar, Prefix, Method, Path, Input, O>(
      this.prefix,
      this.path,
      this.method,
      this.middlewares
    );
  }

  use<M extends MiddlewareSource = Middleware<Var, InferRouteParams<JoinPath<Prefix, Path>>, Input, any>>(
    middleware: M
  ): RouteBuilder<
    Var & InferMiddlewareVar<M>,
    Prefix,
    Method,
    Path,
    Input & InferMiddlewareInput<M>,
    O | InferMiddlewareOutput<M>
  > {
    return new RouteBuilder(this.prefix, this.path, this.method, [
      ...this.middlewares,
      ...toMiddlewareList(middleware),
    ]);
  }

  handle<H extends Handler<Var, InferRouteParams<JoinPath<Prefix, Path>>, Input, any>>(
    handler: H
  ): BuiltRoute<
    Method,
    TrimTrailingSlash<JoinPath<Prefix, Path>>,
    InferRouteParams<JoinPath<Prefix, Path>>,
    Input,
    O | InferHandlerOutput<H>
  > {
    const fullPath = trimTrailingSlash(normalizePath(`${this.prefix}${this.path}`)) || '/';
    return {
      method: this.method,
      path: fullPath as TrimTrailingSlash<JoinPath<Prefix, Path>>,
      middlewares: this.middlewares,
      handler,
    };
  }

  input<S extends Partial<InputSchemas>>(
    schemas: S
  ): RouteBuilder<Var, Prefix, Method, Path, Input & InputFromSchemas<S>, O | ValidatorOutput> {
    const validator = createInputValidator(schemas);
    return new RouteBuilder(this.prefix, this.path, this.method, [...this.middlewares, validator]);
  }
}
