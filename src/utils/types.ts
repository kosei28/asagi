export type MaybePromise<T> = T | Promise<T>;

export type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;

export type IntRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>;

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type MergeUnion<U> = UnionToIntersection<U> extends infer O ? { [K in keyof O]: O[K] } : never;

export type EmptyToNever<T> = keyof T extends never ? Record<string, never> : T;
