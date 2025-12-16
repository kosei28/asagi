export type MaybePromise<T> = T | Promise<T>;

type TrimLeadingSlash<T extends string> = T extends `/${infer Rest}` ? TrimLeadingSlash<Rest> : T;

type TrimTrailingSlash<T extends string> = T extends `${infer Rest}/` ? TrimTrailingSlash<Rest> : T;

type _JoinPath<A extends string, B extends string> = B extends `/${string}` ? `${A}${B}` : `${A}/${B}`;

export type JoinPath<A extends string, B extends string> = `/${TrimLeadingSlash<TrimTrailingSlash<_JoinPath<A, B>>>}`;

export type Enumerate<N extends number, Acc extends number[] = []> = Acc['length'] extends N
  ? Acc[number]
  : Enumerate<N, [...Acc, Acc['length']]>;

export type IntRange<F extends number, T extends number> = Exclude<Enumerate<T>, Enumerate<F>>;

export type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

export type MergeUnion<U> = UnionToIntersection<U> extends infer O ? { [K in keyof O]: O[K] } : never;

export type EmptyToNever<T> = keyof T extends never ? Record<string, never> : T;

export type FormValue = string | File | (string | File)[];

/*
 * The following code is copied from Hono.
 * https://github.com/honojs/hono/blob/main/src/utils/types.ts
 * Copyright (c) 2021 - present, Yusuke Wada and Hono contributors
 * Licensed under the MIT License.
 */

export type JSONPrimitive = string | boolean | number | null;
export type JSONArray = (JSONPrimitive | JSONObject | JSONArray)[];
export type JSONObject = {
  [key: string]: JSONPrimitive | JSONArray | JSONObject | object | InvalidJSONValue;
};
export type InvalidJSONValue = undefined | symbol | ((...args: unknown[]) => unknown);

type InvalidToNull<T> = T extends InvalidJSONValue ? null : T;

type IsInvalid<T> = T extends InvalidJSONValue ? true : false;

/**
 * symbol keys are omitted through `JSON.stringify`
 */
type OmitSymbolKeys<T> = { [K in keyof T as K extends symbol ? never : K]: T[K] };

export type JSONValue = JSONObject | JSONArray | JSONPrimitive;
/**
 * Convert a type to a JSON-compatible type.
 *
 * Non-JSON values such as `Date` implement `.toJSON()`,
 * so they can be transformed to a value assignable to `JSONObject`
 *
 * `JSON.stringify()` throws a `TypeError` when it encounters a `bigint` value,
 * unless a custom `replacer` function or `.toJSON()` method is provided.
 *
 * This behaviour can be controlled by the `TError` generic type parameter,
 * which defaults to `bigint | ReadonlyArray<bigint>`.
 * You can set it to `never` to disable this check.
 */
export type JSONParsed<T, TError = bigint | ReadonlyArray<bigint>> = T extends {
  toJSON(): infer J;
}
  ? (() => J) extends () => JSONPrimitive
    ? J
    : (() => J) extends () => { toJSON(): unknown }
      ? {}
      : JSONParsed<J, TError>
  : T extends JSONPrimitive
    ? T
    : T extends InvalidJSONValue
      ? never
      : T extends ReadonlyArray<unknown>
        ? { [K in keyof T]: JSONParsed<InvalidToNull<T[K]>, TError> }
        : T extends Set<unknown> | Map<unknown, unknown> | Record<string, never>
          ? {}
          : T extends object
            ? T[keyof T] extends TError
              ? never
              : {
                  [K in keyof OmitSymbolKeys<T> as IsInvalid<T[K]> extends true ? never : K]: boolean extends IsInvalid<
                    T[K]
                  >
                    ? JSONParsed<T[K], TError> | undefined
                    : JSONParsed<T[K], TError>;
                }
            : T extends unknown
              ? T extends TError
                ? never
                : JSONValue
              : never;
