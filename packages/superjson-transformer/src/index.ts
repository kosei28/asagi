import { createTransformer } from 'asagi';
import SuperJSON from 'superjson';
import type { SuperjsonParsed } from './types';

declare module 'asagi' {
  interface TransformKind<Body> {
    superjson: SuperjsonParsed<Body>;
  }
}

export const superjsonTransformer = createTransformer({
  name: 'superjson',
  stringify: SuperJSON.stringify,
  parse: SuperJSON.parse,
});

export type { SuperjsonParsed } from './types';
