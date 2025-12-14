import SuperJSON from 'superjson';
import { createTransformer } from '../src';

declare module '../src' {
  interface TransformKind<Body> {
    superjson: Body;
  }
}

export const superjsonTransformer = createTransformer({
  name: 'superjson',
  stringify: SuperJSON.stringify,
  parse: SuperJSON.parse,
});
