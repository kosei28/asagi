import type { InputSchemas, OutputType, OutputTypeMap, ParsedInput, TypedOutput } from './types';

type OutputBuilder<Type extends OutputType> = {
  <T extends OutputTypeMap[Type], S extends number>(body: T, init: S): TypedOutput<Type, T, S>;
  <T extends OutputTypeMap[Type], S extends number>(
    body: T,
    init: ResponseInit & { status: S }
  ): TypedOutput<Type, T, S>;
  <T extends OutputTypeMap[Type]>(body: T, init?: Omit<ResponseInit, 'status'>): TypedOutput<Type, T, 200>;
};

type RedirectBuilder = {
  <S extends number>(path: string, init: S): TypedOutput<'redirect', never, S>;
  <S extends number>(path: string, init: ResponseInit & { status: S }): TypedOutput<'redirect', never, S>;
  (path: string, init?: Omit<ResponseInit, 'status'>): TypedOutput<'redirect', never, 302>;
};

export class Context<Var extends object, Params extends Record<string, string>, Input extends InputSchemas> {
  readonly req: Request;
  readonly params: Params;
  var: Var;
  res: Response;
  private _input: ParsedInput<Input>;

  constructor(req: Request, params: Params, initialVar: Var, initialInput: Input) {
    this.req = req;
    this.params = params;
    this.var = initialVar ?? ({} as Var);
    this.res = new Response(null, { status: 204 });
    this._input = (initialInput ?? {}) as ParsedInput<Input>;
  }

  get input(): ParsedInput<Input> {
    return this._input;
  }

  private createOutputBuilder = <Type extends OutputType>(type: Type): OutputBuilder<Type> => {
    return (body: OutputTypeMap[Type], init?: ResponseInit | number) => {
      const status = typeof init === 'number' ? init : (init?.status ?? 200);

      const rest = typeof init === 'number' || init === undefined ? {} : { ...init };

      return {
        type,
        body,
        status,
        ...rest,
      } as TypedOutput<any, any, any>;
    };
  };

  body = this.createOutputBuilder('body');
  text = this.createOutputBuilder('text');
  json = this.createOutputBuilder('json');
  form = this.createOutputBuilder('form');

  redirect: RedirectBuilder = (path: string, init?: ResponseInit | number) => {
    const status = typeof init === 'number' ? init : (init?.status ?? 302);
    const rest = typeof init === 'number' || init === undefined ? {} : { ...init };
    const headers = new Headers(rest.headers);
    headers.set('location', path);

    return {
      type: 'redirect',
      body: undefined as never,
      status,
      ...rest,
      headers,
    } as TypedOutput<'redirect', never, any>;
  };
}
