import type { InferRouteParams } from 'rou3';
import {
  type InferMiddlewareInput,
  type InferMiddlewareOutput,
  type InferMiddlewareVar,
  MiddlewareBuilder,
  type MiddlewareSource,
  toMiddlewareList,
} from './middleware';
import { RouteBuilder } from './route';
import type { InputSchemas, Middleware, NewInputSchemas, Output, UpdateVar } from './types';
import { normalizePath, trimTrailingSlash } from './utils/paths';
import type { JoinPath, TrimTrailingSlash } from './utils/types';
import { createInputValidator, type ValidatorOutput } from './validators';

export class AppBuilder<
  InitVar extends object,
  Var extends object,
  Prefix extends string,
  Input extends InputSchemas,
  O extends Output,
> {
  constructor(
    private readonly prefix: Prefix,
    private readonly middlewares: Middleware<any, any, any, any>[]
  ) {}

  $var<NewVar extends object>(): AppBuilder<InitVar, UpdateVar<Var, NewVar>, Prefix, Input, O> {
    return new AppBuilder(this.prefix, this.middlewares);
  }

  basePath<Path extends string>(
    path: Path
  ): AppBuilder<InitVar, Var, TrimTrailingSlash<JoinPath<Prefix, Path>>, Input, O> {
    return new AppBuilder(
      trimTrailingSlash(normalizePath(`${this.prefix}${path}`)) as TrimTrailingSlash<JoinPath<Prefix, Path>>,
      this.middlewares
    );
  }

  use<M extends MiddlewareSource = Middleware<Var, InferRouteParams<Prefix>, Input, any>>(
    middleware: M
  ): AppBuilder<
    InitVar,
    Var & InferMiddlewareVar<M>,
    Prefix,
    Input & InferMiddlewareInput<M>,
    O | InferMiddlewareOutput<M>
  > {
    return new AppBuilder(this.prefix, [...this.middlewares, ...toMiddlewareList(middleware)]);
  }

  createMiddleware(): MiddlewareBuilder<Var, InferRouteParams<Prefix>, Input, O> {
    return new MiddlewareBuilder([]);
  }

  input<S extends NewInputSchemas<Input>>(
    schemas: S
  ): AppBuilder<InitVar, Var, Prefix, Input & S, O | ValidatorOutput> {
    const validator = createInputValidator(schemas);
    return new AppBuilder(this.prefix, [...this.middlewares, validator]);
  }

  private createRouteBuilder<Method extends string>(
    method: Method
  ): <Path extends string>(path: Path) => RouteBuilder<InitVar, Var, Prefix, Method, Path, Input, O> {
    return (path) => new RouteBuilder(this.prefix, path, method, this.middlewares);
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

export const createApp = <InitVar extends object = {}>(): AppBuilder<InitVar, InitVar, '', {}, never> => {
  return new AppBuilder('', []);
};
