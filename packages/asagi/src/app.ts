import type { InferRouteParams } from 'rou3';
import {
  type InferMiddlewareInput,
  type InferMiddlewareOutput,
  type InferMiddlewareVar,
  MiddlewareBuilder,
  type MiddlewareSource,
  resolveMiddleware,
} from './middleware';
import { RouteBuilder } from './route';
import type { InputSchemas, Middleware, NewInputSchemas, Output, UpdateVar } from './types';
import { joinPath } from './utils/path';
import type { JoinPath } from './utils/types';
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
    private readonly middlewares: Middleware<any, any, any, any>[],
    private readonly inputSchemas: InputSchemas
  ) {}

  $var<NewVar extends object>(): AppBuilder<InitVar, UpdateVar<Var, NewVar>, Prefix, Input, O> {
    return new AppBuilder(this.prefix, this.middlewares, this.inputSchemas);
  }

  basePath<Path extends string>(path: Path): AppBuilder<InitVar, Var, JoinPath<Prefix, Path>, Input, O> {
    return new AppBuilder(joinPath(this.prefix, path) as JoinPath<Prefix, Path>, this.middlewares, this.inputSchemas);
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
    const resolved = resolveMiddleware(middleware);

    return new AppBuilder(this.prefix, [...this.middlewares, ...resolved.middlewares], {
      ...this.inputSchemas,
      ...resolved.inputSchemas,
    });
  }

  createMiddleware(): MiddlewareBuilder<Var, InferRouteParams<Prefix>, Input, O> {
    return new MiddlewareBuilder([], {});
  }

  input<S extends NewInputSchemas<Input>>(
    schemas: S
  ): AppBuilder<InitVar, Var, Prefix, Input & S, O | ValidatorOutput> {
    const validator = createInputValidator(schemas);
    return new AppBuilder(this.prefix, [...this.middlewares, validator], {
      ...this.inputSchemas,
      ...schemas,
    });
  }

  private createRouteBuilder<Method extends string>(
    method: Method
  ): <Path extends string>(path: Path) => RouteBuilder<InitVar, Var, Prefix, Method, Path, Input, O> {
    return (path) => new RouteBuilder(this.prefix, path, method, this.middlewares, this.inputSchemas);
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

export function createApp<InitVar extends object = {}>(): AppBuilder<InitVar, InitVar, '', {}, never> {
  return new AppBuilder('', [], {});
}
