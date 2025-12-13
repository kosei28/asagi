export type Transformer = {
  name: string;
  stringify: (value: any) => string;
  parse: (value: string) => any;
};

export const TRANSFORMER_HEADER = 'x-asagi-transformer';

export const defaultTransformer: Transformer = {
  name: 'json',
  stringify: JSON.stringify,
  parse: JSON.parse,
};
