import type { BuiltRoute } from './route';

type RouterSource = BuiltRoute<any, any, any, any, any, any> | BuiltRoute<any, any, any, any, any, any>[];

type ExtractRoute<R extends RouterSource> = R extends BuiltRoute<any, any, any, any, any, any>[]
  ? R[number]
  : R extends BuiltRoute<any, any, any, any, any, any>
    ? R
    : never;

type FlattenRoutes<R extends RouterSource> = ExtractRoute<R>;

const flattenRoutes = <R extends RouterSource>(routes: R[]): FlattenRoutes<R>[] => {
  const acc: BuiltRoute<any, any, any, any, any, any>[] = [];
  for (const entry of routes) {
    if (Array.isArray(entry)) {
      acc.push(...entry);
    } else {
      acc.push(entry);
    }
  }
  return acc as FlattenRoutes<R>[];
};

export function createRouter<R extends RouterSource>(routes: R[]): FlattenRoutes<R>[] {
  return flattenRoutes(routes);
}
