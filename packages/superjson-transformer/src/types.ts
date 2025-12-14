// Inspired by Hono's utility types:
// https://github.com/honojs/hono/blob/main/src/utils/types.ts
// Copyright (c) 2021 - present, Yusuke Wada and Hono contributors
// Licensed under the MIT License.

export type SuperjsonPrimitive = string | boolean | number | null | undefined | bigint;

export type SuperjsonArray = (
  | SuperjsonPrimitive
  | SuperjsonObject
  | SuperjsonArray
  | Date
  | RegExp
  | Set<unknown>
  | Map<unknown, unknown>
  | Error
  | URL
)[];

export type SuperjsonObject = {
  [key: string]:
    | SuperjsonPrimitive
    | SuperjsonArray
    | SuperjsonObject
    | Date
    | RegExp
    | Set<unknown>
    | Map<unknown, unknown>
    | Error
    | URL
    | object
    | InvalidSuperjsonValue;
};

export type InvalidSuperjsonValue = symbol | ((...args: unknown[]) => unknown);

type IsInvalid<T> = T extends InvalidSuperjsonValue ? true : false;

type OmitSymbolKeys<T> = { [K in keyof T as K extends symbol ? never : K]: T[K] };

export type SuperjsonValue =
  | SuperjsonPrimitive
  | SuperjsonArray
  | SuperjsonObject
  | Date
  | RegExp
  | Set<unknown>
  | Map<unknown, unknown>
  | Error
  | URL;

/**
 * Convert a type to the shape obtained after SuperJSON serialization/deserialization.
 *
 * SuperJSON preserves:
 * - `undefined`
 * - `bigint`
 * - `Date`
 * - `RegExp`
 * - `Set`
 * - `Map`
 * - `Error`
 * - `URL`
 *
 * Functions and symbols are not supported.
 */
export type SuperjsonParsed<T, TError = never> = T extends { toJSON(): infer J }
  ? SuperjsonParsed<J, TError>
  : T extends SuperjsonPrimitive
    ? T
    : T extends InvalidSuperjsonValue
      ? never
      : T extends ReadonlyArray<unknown>
        ? { [K in keyof T]: SuperjsonParsed<T[K], TError> }
        : T extends Set<infer U>
          ? Set<SuperjsonParsed<U, TError>>
          : T extends Map<infer K, infer V>
            ? Map<SuperjsonParsed<K, TError>, SuperjsonParsed<V, TError>>
            : T extends Date | RegExp | Error | URL
              ? T
              : T extends object
                ? T[keyof T] extends TError
                  ? never
                  : {
                      [K in keyof OmitSymbolKeys<T> as IsInvalid<T[K]> extends true
                        ? never
                        : K]: boolean extends IsInvalid<T[K]>
                        ? SuperjsonParsed<T[K], TError> | undefined
                        : SuperjsonParsed<T[K], TError>;
                    }
                : T extends unknown
                  ? T extends TError
                    ? never
                    : SuperjsonValue
                  : never;
