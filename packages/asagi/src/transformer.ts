import type { JSONParsed } from './utils/types';

export const TRANSFORMER_HEADER = 'x-asagi-transformer';

export interface TransformKind<Body = unknown> {
  json: JSONParsed<Body>;
}

export type TransformerParsed<Kind extends keyof TransformKind, Body> = TransformKind<Body>[Kind];

export type Transformer<Name extends string = string> = {
  name: Name;
  stringify: (value: any) => string;
  parse: (value: string) => any;
};

export function createTransformer<Name extends string>(transformer: Transformer<Name>): Transformer<Name> {
  return transformer;
}

export const jsonTransformer = createTransformer({
  name: 'json',
  stringify: JSON.stringify,
  parse: JSON.parse,
});
