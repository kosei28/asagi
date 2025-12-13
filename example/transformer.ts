import { createTransformer } from 'asagi';
import SuperJSON from 'superjson';

declare module 'asagi' {
  interface TransformKind<Body> {
    superjson: Body;
  }
}

export const superjsonTransformer = createTransformer({
  name: 'superjson',
  stringify: SuperJSON.stringify,
  parse: SuperJSON.parse,
});
