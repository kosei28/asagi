import type { InferRouteParams } from 'rou3';
import {
  type InferMiddlewareOutput,
  type InferMiddlewareVarFromInput,
  type MiddlewareSource,
  toMiddlewareList,
} from './middleware';
import { normalizePath, trimTrailingSlash } from './paths';
import type { Handler, Middleware, Output } from './types';

export type JoinPath<A extends string, B extends string> = `${A}${B}` extends `//${infer Rest}`
  ? `/${Rest}`
  : `${A}${B}`;

export type TrimTrailingSlash<T extends string> = T extends `${infer Body}/` ? Body : T;

export type InferHandlerOutput<T> =
  T extends Handler<any, any, infer O> ? (O extends void | undefined ? Response : O) : never;

export type BuiltRoute<Method extends string, Path extends string, O extends Output> = {
  method: Method;
  path: Path;
  middlewares: Middleware<any, any, any>[];
  handler: Handler<any, any, O>;
};

export class RouteBuilder<
  Var extends object,
  Prefix extends string,
  Method extends string,
  Path extends string,
  O extends Output,
> {
  constructor(
    private readonly prefix: Prefix,
    private readonly path: Path,
    private readonly method: Method,
    private readonly middlewares: Middleware<any, any, any>[]
  ) {}

  var<AddVar extends object>(): RouteBuilder<Var & AddVar, Prefix, Method, Path, O> {
    return new RouteBuilder<Var & AddVar, Prefix, Method, Path, O>(
      this.prefix,
      this.path,
      this.method,
      this.middlewares
    );
  }

  use<M extends MiddlewareSource = Middleware<Var, InferRouteParams<JoinPath<Prefix, Path>>, any>>(
    middleware: M
  ): RouteBuilder<Var & InferMiddlewareVarFromInput<M>, Prefix, Method, Path, O | InferMiddlewareOutput<M>> {
    return new RouteBuilder(this.prefix, this.path, this.method, [
      ...this.middlewares,
      ...toMiddlewareList(middleware),
    ]);
  }

  handle<H extends Handler<Var, InferRouteParams<JoinPath<Prefix, Path>>, any>>(
    handler: H
  ): BuiltRoute<Method, TrimTrailingSlash<JoinPath<Prefix, Path>>, O | InferHandlerOutput<H>> {
    const fullPath = trimTrailingSlash(normalizePath(`${this.prefix}${this.path}`)) || '/';
    return {
      method: this.method,
      path: fullPath as TrimTrailingSlash<JoinPath<Prefix, Path>>,
      middlewares: this.middlewares,
      handler,
    };
  }
}
