import type { OutputType, OutputTypeMap, TypedOutput } from './types';

type OutputBuilder<Type extends OutputType> = {
  <T extends OutputTypeMap[Type], S extends number>(body: T, init: S): TypedOutput<Type, T, S>;
  <T extends OutputTypeMap[Type], S extends number>(
    body: T,
    init: ResponseInit & { status: S }
  ): TypedOutput<Type, T, S>;
  <T extends OutputTypeMap[Type]>(body: T, init?: Omit<ResponseInit, 'status'>): TypedOutput<Type, T, 200>;
};

export class Context<Var extends object, Params extends Record<string, string>> {
  req: Request;
  params: Params;
  var: Var;
  res: Response;

  constructor(req: Request, params: Params, initialVar?: Var) {
    this.req = req;
    this.params = params;
    this.var = initialVar ?? ({} as Var);
    this.res = new Response(null, { status: 204 });
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

  json = this.createOutputBuilder('json');
  text = this.createOutputBuilder('text');
  body = this.createOutputBuilder('body');
}
