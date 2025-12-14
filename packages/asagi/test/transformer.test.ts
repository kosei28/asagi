import { describe, expect, expectTypeOf, it } from 'bun:test';
import { createApp, createClient, createRouter, createServer, createTransformer, type Server } from '../src';
import type { TransformerParsed, TransformKind } from '../src/transformer';
import type { JSONParsed } from '../src/utils/types';

declare module '../src/transformer' {
  interface TransformKind<Body> {
    custom: Body;
  }
}

// Helper to create a fetch function from server for testing
function createTestFetch(server: Server) {
  return ((url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? url : new Request(url, init);
    return server.fetch(request);
  }) as typeof fetch;
}

describe('transformer', () => {
  describe('types', () => {
    it('should map json kind to JSONParsed', () => {
      type Body = {
        id: string;
        createdAt: Date;
        tags: Set<string>;
        meta?: {
          foo: number;
          bar: undefined;
          baz: () => void;
        };
      };

      type HasJsonKind = 'json' extends keyof TransformKind ? true : false;
      expectTypeOf<HasJsonKind>().toEqualTypeOf<true>();
      expectTypeOf<TransformKind<Body>['json']>().toEqualTypeOf<JSONParsed<Body>>();
      expectTypeOf<TransformerParsed<'json', Body>>().toEqualTypeOf<JSONParsed<Body>>();

      expectTypeOf<TransformerParsed<'json', Body>['createdAt']>().toEqualTypeOf<string>();
      expectTypeOf<TransformerParsed<'json', Body>['tags']>().toEqualTypeOf<{}>();
      expectTypeOf<NonNullable<TransformerParsed<'json', Body>['meta']>>().toEqualTypeOf<{ foo: number }>();
    });

    it('should allow extending TransformKind for custom transformer', async () => {
      type Body = { value: number; createdAt: Date };

      const customTransformer = createTransformer({
        name: 'custom',
        stringify: JSON.stringify,
        parse: JSON.parse,
      });

      type HasCustomKind = 'custom' extends keyof TransformKind ? true : false;
      expectTypeOf<HasCustomKind>().toEqualTypeOf<true>();
      expectTypeOf<TransformerParsed<'custom', Body>>().toEqualTypeOf<Body>();

      const app = createApp();
      const routes = createRouter([
        app.get('/data').handle((c) => c.json({ value: 42, createdAt: new Date('2020-01-01T00:00:00.000Z') })),
      ]);
      const server = createServer(routes, { transformers: [customTransformer] });

      const client = createClient<typeof routes, typeof customTransformer>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
        transformer: customTransformer,
      });

      const result = await client.data.$get();
      expectTypeOf(result.data).toEqualTypeOf<Body>();
    });
  });

  describe('server', () => {
    const customTransformer = createTransformer({
      name: 'custom',
      stringify: (value) => JSON.stringify({ wrapped: value }),
      parse: (text) => JSON.parse(text).wrapped,
    });

    it('should default to json transformer when no transformer header is provided', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/data').handle((c) => c.json({ value: 42 }))]);
      const server = createServer(routes, { transformers: [customTransformer] });

      const res = await server.fetch(new Request('http://localhost/data'));
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.text()).toBe(JSON.stringify({ value: 42 }));
    });

    it('should use transformer specified by header when configured on server', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/data').handle((c) => c.json({ value: 42 }))]);
      const server = createServer(routes, { transformers: [customTransformer] });

      const req = new Request('http://localhost/data', {
        headers: {
          'x-asagi-transformer': 'custom',
        },
      });
      const res = await server.fetch(req);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.text()).toBe(JSON.stringify({ wrapped: { value: 42 } }));
    });

    it('should fall back to json transformer for unknown transformer header', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/data').handle((c) => c.json({ value: 42 }))]);
      const server = createServer(routes, { transformers: [customTransformer] });

      const req = new Request('http://localhost/data', {
        headers: {
          'x-asagi-transformer': 'unknown',
        },
      });
      const res = await server.fetch(req);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.text()).toBe(JSON.stringify({ value: 42 }));
    });

    it('should ignore transformer header when transformer is not configured on server', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/data').handle((c) => c.json({ value: 42 }))]);
      const server = createServer(routes);

      const req = new Request('http://localhost/data', {
        headers: {
          'x-asagi-transformer': 'custom',
        },
      });
      const res = await server.fetch(req);
      expect(res.headers.get('content-type')).toContain('application/json');
      expect(await res.text()).toBe(JSON.stringify({ value: 42 }));
    });
  });

  describe('client', () => {
    it('should use default json transformer', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/data').handle((c) => c.json({ value: 42 }))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data } = await client.data.$get();
      expect(data).toEqual({ value: 42 });
    });

    it('should use default json transformer even if server has custom transformer', async () => {
      const customTransformer = createTransformer({
        name: 'custom',
        stringify: (value) => JSON.stringify({ wrapped: value }),
        parse: (text) => JSON.parse(text).wrapped,
      });

      const app = createApp();
      const routes = createRouter([app.get('/data').handle((c) => c.json({ value: 42 }))]);
      const server = createServer(routes, { transformers: [customTransformer] });

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, res } = await client.data.$get();
      expect(data).toEqual({ value: 42 });
      expect(await res.text()).toBe(JSON.stringify({ value: 42 }));
    });

    it('should use custom transformer', async () => {
      const customTransformer = createTransformer({
        name: 'custom',
        stringify: (value) => JSON.stringify({ wrapped: value }),
        parse: (text) => JSON.parse(text).wrapped,
      });

      const app = createApp();
      const routes = createRouter([app.get('/data').handle((c) => c.json({ value: 42 }))]);
      const server = createServer(routes, { transformers: [customTransformer] });

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
        transformer: customTransformer,
      });

      const { data } = await client.data.$get();
      expect(data).toEqual({ value: 42 });
    });
  });
});
