import {
  type InferMiddlewareInput,
  type InferMiddlewareOutput,
  type InferMiddlewareVar,
  MiddlewareBuilder,
  type MiddlewareSource,
  toMiddlewareList,
} from './middleware';
import { normalizePath, trimTrailingSlash } from './paths';
import { type JoinPath, RouteBuilder, type TrimTrailingSlash } from './route';
import type { InputFromSchemas, InputSchemas, Middleware, Output } from './types';
import { createInputValidator, type ValidatorOutput } from './validators';

export class AppBuilder<Var extends object, Prefix extends string, Input extends object, O extends Output> {
  constructor(
    private readonly prefix: Prefix,
    private readonly middlewares: Middleware<any, any, any, any>[]
  ) {}

  private createRouteBuilder<Method extends string>(
    method: Method
  ): <Path extends string>(path: Path) => RouteBuilder<Var, Prefix, Method, Path, Input, O> {
    return (path) => new RouteBuilder(this.prefix, path, method, this.middlewares);
  }

  $var<AddVar extends object>(): AppBuilder<Var & AddVar, Prefix, Input, O> {
    return new AppBuilder(this.prefix, this.middlewares);
  }

  basePath<Path extends string>(path: Path): AppBuilder<Var, TrimTrailingSlash<JoinPath<Prefix, Path>>, Input, O> {
    return new AppBuilder(
      trimTrailingSlash(normalizePath(`${this.prefix}${path}`)) as TrimTrailingSlash<JoinPath<Prefix, Path>>,
      this.middlewares
    );
  }

  use<M extends MiddlewareSource = Middleware<Var, any, Input, any>>(
    middleware: M
  ): AppBuilder<Var & InferMiddlewareVar<M>, Prefix, Input & InferMiddlewareInput<M>, O | InferMiddlewareOutput<M>> {
    return new AppBuilder(this.prefix, [...this.middlewares, ...toMiddlewareList(middleware)]);
  }

  createMiddleware(): MiddlewareBuilder<Var, Input, O> {
    return new MiddlewareBuilder([]);
  }

  input<S extends Partial<InputSchemas>>(
    schemas: S
  ): AppBuilder<Var, Prefix, Input & InputFromSchemas<S>, O | ValidatorOutput> {
    const validator = createInputValidator(schemas);
    return new AppBuilder(this.prefix, [...this.middlewares, validator]);
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

export const createApp = <Var extends object = {}>(): AppBuilder<Var, '', {}, never> => {
  return new AppBuilder('', []);
};
