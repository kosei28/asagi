import type { InferRouteParams } from 'rou3';
import {
  type InferMiddlewareInput,
  type InferMiddlewareOutput,
  type InferMiddlewareVar,
  type MiddlewareSource,
  toMiddlewareList,
} from './middleware';
import type { Handler, InputSchemas, Middleware, NewInputSchemas, Output, UpdateVar } from './types';
import { normalizePath, trimTrailingSlash } from './utils/paths';
import type { JoinPath, TrimTrailingSlash } from './utils/types';
import { createInputValidator, type ValidatorOutput } from './validators';

type InferHandlerOutput<T> =
  T extends Handler<any, any, any, infer O> ? (O extends void | undefined ? Response : O) : never;

export type BuiltRoute<
  InitVar extends object,
  Method extends string,
  Path extends string,
  Params extends Record<string, string>,
  Input extends InputSchemas,
  O extends Output,
> = {
  method: Method;
  path: Path;
  middlewares: Middleware<any, Params, Input, any>[];
  handler: Handler<any, Params, Input, O>;
  /**
   * Type-only property for inferring InitVar. Do not use at runtime.
   * @internal
   * @deprecated This property exists only for type inference and is never set at runtime.
   */
  _initVar?: InitVar;
};

export class RouteBuilder<
  InitVar extends object,
  Var extends object,
  Prefix extends string,
  Method extends string,
  Path extends string,
  Input extends InputSchemas,
  O extends Output,
> {
  constructor(
    private readonly prefix: Prefix,
    private readonly path: Path,
    private readonly method: Method,
    private readonly middlewares: Middleware<any, any, any, any>[]
  ) {}

  $var<NewVar extends object>(): RouteBuilder<InitVar, UpdateVar<Var, NewVar>, Prefix, Method, Path, Input, O> {
    return new RouteBuilder<InitVar, UpdateVar<Var, NewVar>, Prefix, Method, Path, Input, O>(
      this.prefix,
      this.path,
      this.method,
      this.middlewares
    );
  }

  use<M extends MiddlewareSource = Middleware<Var, InferRouteParams<JoinPath<Prefix, Path>>, Input, any>>(
    middleware: M
  ): RouteBuilder<
    InitVar,
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
    InitVar,
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

  input<S extends NewInputSchemas<Input>>(
    schemas: S
  ): RouteBuilder<InitVar, Var, Prefix, Method, Path, Input & S, O | ValidatorOutput> {
    const validator = createInputValidator(schemas);
    return new RouteBuilder(this.prefix, this.path, this.method, [...this.middlewares, validator]);
  }
}
