import type { BuiltRoute } from './route';

type RouterSource = BuiltRoute<any, any, any, any, any> | BuiltRoute<any, any, any, any, any>[];

type ExtractRoute<R extends RouterSource> =
  R extends BuiltRoute<any, any, any, any, any>[]
    ? R[number]
    : R extends BuiltRoute<any, any, any, any, any>
      ? R
      : never;

type FlattenRoutes<Routes extends RouterSource[]> = ExtractRoute<Routes[number]>[];

const flattenRoutes = <Routes extends RouterSource[]>(routes: Routes): FlattenRoutes<Routes> => {
  const acc: BuiltRoute<any, any, any, any, any>[] = [];
  for (const entry of routes) {
    if (Array.isArray(entry)) {
      acc.push(...entry);
    } else {
      acc.push(entry);
    }
  }
  return acc as FlattenRoutes<Routes>;
};

export function createRouter<const Routes extends RouterSource[]>(routes: Routes): FlattenRoutes<Routes> {
  return flattenRoutes(routes);
}
