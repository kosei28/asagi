import {
  type InferMiddlewareOutput,
  type InferMiddlewareVarFromInput,
  MiddlewareBuilder,
  type MiddlewareSource,
  toMiddlewareList,
} from './middleware';
import { normalizePath, trimTrailingSlash } from './paths';
import { type JoinPath, RouteBuilder, type TrimTrailingSlash } from './route';
import type { Middleware, Output } from './types';

export class AppBuilder<Var extends object, Prefix extends string, O extends Output> {
  constructor(
    private readonly prefix: Prefix,
    private readonly middlewares: Middleware<any, any, any>[]
  ) {}

  private createRouteBuilder<Method extends string>(
    method: Method
  ): <Path extends string>(path: Path) => RouteBuilder<Var, Prefix, Method, Path, O> {
    return (path) => new RouteBuilder<Var, Prefix, Method, typeof path, O>(this.prefix, path, method, this.middlewares);
  }

  var<AddVar extends object>(): AppBuilder<Var & AddVar, Prefix, O> {
    return new AppBuilder<Var & AddVar, Prefix, O>(this.prefix, this.middlewares);
  }

  basePath<Path extends string>(path: Path): AppBuilder<Var, TrimTrailingSlash<JoinPath<Prefix, Path>>, O> {
    return new AppBuilder<Var, TrimTrailingSlash<JoinPath<Prefix, Path>>, O>(
      trimTrailingSlash(normalizePath(`${this.prefix}${path}`)) as TrimTrailingSlash<JoinPath<Prefix, Path>>,
      this.middlewares
    );
  }

  use<M extends MiddlewareSource = Middleware<Var, any, any>>(
    middleware: M
  ): AppBuilder<Var & InferMiddlewareVarFromInput<M>, Prefix, O | InferMiddlewareOutput<M>> {
    return new AppBuilder<Var & InferMiddlewareVarFromInput<M>, Prefix, O | InferMiddlewareOutput<M>>(this.prefix, [
      ...this.middlewares,
      ...toMiddlewareList(middleware),
    ]);
  }

  createMiddleware(): MiddlewareBuilder<Var, O> {
    return new MiddlewareBuilder<Var, O>([]);
  }

  all = this.createRouteBuilder('ALL');
  get = this.createRouteBuilder('GET');
  post = this.createRouteBuilder('POST');
  put = this.createRouteBuilder('PUT');
  patch = this.createRouteBuilder('PATCH');
  delete = this.createRouteBuilder('DELETE');

  on<Method extends string, Path extends string>(method: Method, path: Path) {
    const normalized = method.toUpperCase() as Uppercase<Method>;
    return this.createRouteBuilder(normalized)(path);
  }
}

export const createApp = <Var extends object = {}>(): AppBuilder<Var, '', never> => {
  return new AppBuilder<Var, '', never>('', []);
};
