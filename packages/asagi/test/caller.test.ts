import { describe, expect, expectTypeOf, it } from 'bun:test';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
import { createApp, createCaller, createRouter } from '../src';
import type { JSONParsed } from '../src/utils/types';

describe('createCaller', () => {
  describe('basic usage', () => {
    it('should create a caller with baseUrl', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.json({ origin: new URL(c.req.url).origin }))]);
      const caller = createCaller(routes, { baseUrl: 'http://localhost:3000' });

      const { data } = await caller.test.$get();
      expect(data).toEqual({ origin: 'http://localhost:3000' });
    });

    it('should create a caller without options (default baseUrl)', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.json({ origin: new URL(c.req.url).origin }))]);
      const caller = createCaller(routes);

      const { data } = await caller.test.$get();
      expect(data).toEqual({ origin: 'http://localhost' });
    });

    it('should accept URL object as baseUrl', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.json({ origin: new URL(c.req.url).origin }))]);
      const caller = createCaller(routes, { baseUrl: new URL('http://localhost:3001') });

      const { data } = await caller.test.$get();
      expect(data).toEqual({ origin: 'http://localhost:3001' });
    });
  });

  describe('HTTP methods', () => {
    const app = createApp();
    const routes = createRouter([
      app.get('/resource').handle((c) => c.json({ method: c.req.method })),
      app.post('/resource').handle((c) => c.json({ method: c.req.method })),
      app.put('/resource').handle((c) => c.json({ method: c.req.method })),
      app.patch('/resource').handle((c) => c.json({ method: c.req.method })),
      app.delete('/resource').handle((c) => c.json({ method: c.req.method })),
    ]);

    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should handle GET request', async () => {
      const { data, error } = await caller.resource.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'GET' });
    });

    it('should handle POST request', async () => {
      const { data, error } = await caller.resource.$post();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'POST' });
    });

    it('should handle PUT request', async () => {
      const { data, error } = await caller.resource.$put();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'PUT' });
    });

    it('should handle PATCH request', async () => {
      const { data, error } = await caller.resource.$patch();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'PATCH' });
    });

    it('should handle DELETE request', async () => {
      const { data, error } = await caller.resource.$delete();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'DELETE' });
    });
  });

  describe('$all method', () => {
    it('should use requestInit.method when calling $all', async () => {
      const app = createApp();
      const routes = createRouter([app.all('/resource').handle((c) => c.json({ method: c.req.method }))]);
      const caller = createCaller(routes, { baseUrl: 'http://localhost' });

      const { data } = await caller.resource.$all({}, { method: 'POST' });
      expect(data).toEqual({ method: 'POST' });
    });

    it('should fall back to ALL route when method-specific route is missing', async () => {
      const app = createApp();
      const routes = createRouter([app.all('/resource').handle((c) => c.json({ method: c.req.method }))]);
      const caller = createCaller(routes, { baseUrl: 'http://localhost' });

      const { data } = await (caller.resource as any).$get();
      expect(data).toEqual({ method: 'GET' });
    });
  });

  describe('path parameters', () => {
    const app = createApp();
    const routes = createRouter([
      app.get('/users/:id').handle((c) => c.json({ id: c.params.id })),
      app
        .get('/users/:userId/posts/:postId')
        .handle((c) => c.json({ userId: c.params.userId, postId: c.params.postId })),
    ]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should send path parameter', async () => {
      const { data, error } = await caller.users[':id'].$get({ params: { id: '123' } });
      expect(error).toBeUndefined();
      expect(data).toEqual({ id: '123' });
    });

    it('should send multiple path parameters', async () => {
      const { data, error } = await caller.users[':userId'].posts[':postId'].$get({
        params: { userId: 'user1', postId: 'post1' },
      });
      expect(error).toBeUndefined();
      expect(data).toEqual({ userId: 'user1', postId: 'post1' });
    });

    it('should throw for missing path params', async () => {
      await expect((caller.users[':id'].$get as any)() as Promise<unknown>).rejects.toThrow(
        /Missing path parameter: id/
      );
    });
  });

  describe('query parameters', () => {
    const app = createApp();
    const routes = createRouter([
      app
        .get('/search')
        .input({ query: z.object({ q: z.string(), limit: z.string().optional() }) })
        .handle((c) => c.json({ q: c.input.query.q, limit: c.input.query.limit })),
    ]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should send query parameters', async () => {
      const { data, error } = await caller.search.$get({ query: { q: 'test', limit: '10' } });
      expect(error).toBeUndefined();
      expect(data).toEqual({ q: 'test', limit: '10' });
    });

    it('should send query parameters with optional value omitted', async () => {
      const { data, error } = await caller.search.$get({ query: { q: 'test' } });
      expect(error).toBeUndefined();
      expect(data).toEqual({ q: 'test', limit: undefined });
    });
  });

  describe('JSON body', () => {
    const app = createApp();
    const routes = createRouter([
      app
        .post('/users')
        .input({ json: z.object({ name: z.string(), email: z.string() }) })
        .handle((c) => c.json({ user: c.input.json }, 201)),
    ]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should send JSON body', async () => {
      const { data, error, res } = await caller.users.$post({
        json: { name: 'Alice', email: 'alice@example.com' },
      });
      expect(error).toBeUndefined();
      expect(res.status).toBe(201);
      expect(data).toEqual({ user: { name: 'Alice', email: 'alice@example.com' } });
    });
  });

  describe('form data', () => {
    const app = createApp();
    const routes = createRouter([
      app
        .post('/login')
        .input({ form: z.object({ username: z.string(), password: z.string() }) })
        .handle((c) => c.json({ username: c.input.form.username })),
    ]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should send form data', async () => {
      const { data, error } = await caller.login.$post({
        form: { username: 'admin', password: 'secret' },
      });
      expect(error).toBeUndefined();
      expect(data).toEqual({ username: 'admin' });
    });
  });

  describe('combined input', () => {
    const app = createApp();
    const routes = createRouter([
      app
        .post('/items/:category')
        .input({
          params: z.object({ category: z.string() }),
          query: z.object({ sort: z.string().optional() }),
          json: z.object({ name: z.string() }),
        })
        .handle((c) =>
          c.json({
            category: c.input.params.category,
            sort: c.input.query.sort,
            name: c.input.json.name,
          })
        ),
    ]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should send combined input (params, query, json)', async () => {
      const { data, error } = await caller.items[':category'].$post({
        params: { category: 'electronics' },
        query: { sort: 'price' },
        json: { name: 'Phone' },
      });
      expect(error).toBeUndefined();
      expect(data).toEqual({
        category: 'electronics',
        sort: 'price',
        name: 'Phone',
      });
    });
  });

  describe('basePath', () => {
    it('should include app basePath in resolved route tree', async () => {
      const app = createApp().basePath('/api');
      const routes = createRouter([app.get('/test').handle((c) => c.json({ path: new URL(c.req.url).pathname }))]);
      const caller = createCaller(routes, { baseUrl: 'http://localhost' });

      const { data, error } = await caller.api.test.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ path: '/api/test' });
    });
  });

  describe('nested paths', () => {
    const app = createApp();
    const routes = createRouter([
      app.get('/api/v1/users').handle((c) => c.json({ users: [] })),
      app
        .get('/api/v1/users/:id/posts/:postId/comments')
        .handle((c) => c.json({ userId: c.params.id, postId: c.params.postId })),
    ]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should handle deeply nested paths', async () => {
      const { data, error } = await caller.api.v1.users.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ users: [] });
    });

    it('should handle deeply nested paths with params', async () => {
      const { data, error } = await caller.api.v1.users[':id'].posts[':postId'].comments.$get({
        params: { id: 'user1', postId: 'post1' },
      });
      expect(error).toBeUndefined();
      expect(data).toEqual({ userId: 'user1', postId: 'post1' });
    });
  });

  describe('response handling', () => {
    const app = createApp();
    const routes = createRouter([
      app.get('/success').handle((c) => c.json({ message: 'ok' })),
      app.get('/created').handle((c) => c.json({ id: '123' }, 201)),
      app.get('/not-found').handle((c) => c.json({ error: 'Not Found' }, 404)),
      app.get('/server-error').handle((c) => c.json({ error: 'Internal Server Error' }, 500)),
    ]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should return data for 200 response', async () => {
      const { data, error, status, ok, res } = await caller.success.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ message: 'ok' });
      expect(status).toBe(200);
      expect(ok).toBe(true);
      expect(res.status).toBe(200);
      expect(res.ok).toBe(true);
    });

    it('should return data for 201 response', async () => {
      const { data, error, status, ok, res } = await caller.created.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ id: '123' });
      expect(status).toBe(201);
      expect(ok).toBe(true);
      expect(res.status).toBe(201);
      expect(res.ok).toBe(true);
    });

    it('should return error for 404 response', async () => {
      const { data, error, status, ok, res } = await caller['not-found'].$get();
      expect(data).toBeUndefined();
      expect(error).toEqual({ error: 'Not Found' });
      expect(status).toBe(404);
      expect(ok).toBe(false);
      expect(res.status).toBe(404);
      expect(res.ok).toBe(false);
    });

    it('should return error for 500 response', async () => {
      const { data, error, status, ok, res } = await caller['server-error'].$get();
      expect(data).toBeUndefined();
      expect(error).toEqual({ error: 'Internal Server Error' });
      expect(status).toBe(500);
      expect(ok).toBe(false);
      expect(res.status).toBe(500);
      expect(res.ok).toBe(false);
    });

    it('should provide json() method on res', async () => {
      const { res } = await caller.success.$get();
      const json = await res.json();
      expect(json).toEqual({ message: 'ok' });
    });

    it('should throw when route is not found', async () => {
      await expect((caller as any).missing.$get()).rejects.toThrow(/Route not found/);
    });
  });

  describe('validation errors', () => {
    const app = createApp();
    const routes = createRouter([
      app
        .post('/users')
        .input({ json: z.object({ name: z.string().min(1), age: z.number() }) })
        .handle((c) => c.json({ success: true })),
    ]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should return error for invalid input', async () => {
      const result = await caller.users.$post({
        json: { name: '', age: 'not-a-number' as any },
      });

      expect(result.status).toBe(400);
      expect(result.ok).toBe(false);
      expect(result.data).toBeUndefined();

      if (!result.ok) {
        expect(result.error.error).toBe('Invalid input');
        expect(Array.isArray(result.error.issues)).toBe(true);
        expectTypeOf(result.error).toEqualTypeOf<{ error: string; issues: StandardSchemaV1.Issue[] }>();
        expectTypeOf(result.status).toEqualTypeOf<400>();
        expectTypeOf(result.ok).toEqualTypeOf<false>();
      } else {
        throw new Error('Expected validation to fail');
      }
    });

    it('should provide typed res.json() for validation errors', async () => {
      const result = await caller.users.$post({
        json: { name: '', age: 'not-a-number' as any },
      });

      if (!result.ok) {
        const body = await result.res.json();
        expect(body).toHaveProperty('error', 'Invalid input');
        expectTypeOf(body).toEqualTypeOf<JSONParsed<{ error: string; issues: StandardSchemaV1.Issue[] }>>();
      } else {
        throw new Error('Expected validation to fail');
      }
    });
  });

  describe('text response', () => {
    const app = createApp();
    const routes = createRouter([app.get('/text').handle((c) => c.text('Hello, World!'))]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should handle text response', async () => {
      const { data, res } = await caller.text.$get();
      expect(data).toBe('Hello, World!');
      expectTypeOf(data).toEqualTypeOf<'Hello, World!'>();
      const text = await res.text();
      expect(text).toBe('Hello, World!');
    });
  });

  describe('empty response', () => {
    const app = createApp();
    const routes = createRouter([app.delete('/items/:id').handle((c) => c.body(null, 204))]);
    const caller = createCaller(routes, { baseUrl: 'http://localhost' });

    it('should handle 204 No Content response (body output)', async () => {
      const { data, error, status, ok } = await caller.items[':id'].$delete({ params: { id: '123' } });
      expect(status).toBe(204);
      expect(ok).toBe(true);
      expect(data).toBeNull();
      expect(error).toBeUndefined();
      expectTypeOf(data).toEqualTypeOf<null>();
      expectTypeOf(ok).toEqualTypeOf<true>();
      expectTypeOf(status).toEqualTypeOf<204>();
    });
  });

  describe('output edge cases', () => {
    it('should return only res when handler returns undefined', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/no-output').handle(() => {})]);
      const caller = createCaller(routes, { baseUrl: 'http://localhost' });

      const result: any = await (caller as any)['no-output'].$get();
      expect(result).toHaveProperty('res');
      expect(result.res.status).toBe(204);
    });

    it('should return only res when handler returns a raw Response', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/raw').handle(
          () =>
            new Response(JSON.stringify({ hello: 'world' }), {
              headers: { 'content-type': 'application/json' },
            })
        ),
      ]);
      const caller = createCaller(routes, { baseUrl: 'http://localhost' });

      const result: any = await (caller as any).raw.$get();
      expect(result).toHaveProperty('res');
      expect(await result.res.json()).toEqual({ hello: 'world' });
      expect(result.data).toBeUndefined();
      expect(result.error).toBeUndefined();
    });
  });

  describe('response typing edge cases', () => {
    it('should return body payload for c.body() output (any status)', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/binary').handle((c) => c.body(new Uint8Array([1, 2, 3]))),
        app.get('/binary-error').handle((c) => c.body(new Uint8Array([4, 5, 6]), 418)),
      ]);
      const caller = createCaller(routes, { baseUrl: 'http://localhost' });

      const okResult = await caller.binary.$get();
      expect(okResult.data).toEqual(new Uint8Array([1, 2, 3]));
      expect(okResult.error).toBeUndefined();
      expect(okResult.status).toBe(200);
      expect(okResult.ok).toBe(true);
      expectTypeOf(okResult.status).toEqualTypeOf<200>();
      expectTypeOf(okResult.ok).toEqualTypeOf<true>();

      const errorResult = await caller['binary-error'].$get();
      expect(errorResult.data).toBeUndefined();
      expect(errorResult.error).toEqual(new Uint8Array([4, 5, 6]));
      expect(errorResult.status).toBe(418);
      expect(errorResult.ok).toBe(false);
      expectTypeOf(errorResult.status).toEqualTypeOf<418>();
      expectTypeOf(errorResult.ok).toEqualTypeOf<false>();
    });

    it('should narrow result types by ok and status when a route returns multiple responses', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .get('/maybe')
          .input({ query: z.object({ ok: z.enum(['true', 'false']) }) })
          .handle((c) =>
            c.input.query.ok === 'true' ? c.json({ ok: true as const }, 200) : c.json({ reason: 'bad' as const }, 422)
          ),
      ]);
      const caller = createCaller(routes, { baseUrl: 'http://localhost' });

      const okResult = await caller.maybe.$get({ query: { ok: 'true' } });
      if (okResult.ok) {
        expect(okResult.data).toEqual({ ok: true });
        expect(okResult.error).toBeUndefined();
        expectTypeOf(okResult.ok).toEqualTypeOf<true>();
        expectTypeOf(okResult.status).toEqualTypeOf<200>();
        expectTypeOf(okResult.data).toEqualTypeOf<{ ok: true }>();
        expectTypeOf(okResult.error).toEqualTypeOf<undefined>();
      } else {
        throw new Error('Expected okResult.ok to be true');
      }

      const badResult = await caller.maybe.$get({ query: { ok: 'false' } });
      if (!badResult.ok) {
        expect(badResult.data).toBeUndefined();
        expect(badResult.status).toBe(422);
        expectTypeOf(badResult.ok).toEqualTypeOf<false>();
        expectTypeOf(badResult.status).toEqualTypeOf<400 | 422>();
        expectTypeOf(badResult.data).toEqualTypeOf<undefined>();
      } else {
        throw new Error('Expected badResult.ok to be false');
      }

      switch (badResult.status) {
        case 400: {
          expectTypeOf(badResult.ok).toEqualTypeOf<false>();
          expectTypeOf(badResult.data).toEqualTypeOf<undefined>();
          expectTypeOf(badResult.error).toEqualTypeOf<{ error: string; issues: StandardSchemaV1.Issue[] }>();
          break;
        }
        case 422: {
          expectTypeOf(badResult.ok).toEqualTypeOf<false>();
          expectTypeOf(badResult.data).toEqualTypeOf<undefined>();
          expectTypeOf(badResult.error).toEqualTypeOf<{ reason: 'bad' }>();
          expect(badResult.error).toEqual({ reason: 'bad' });
          break;
        }
        default: {
          const _exhaustive: never = badResult;
          throw new Error(`Unexpected status`);
        }
      }
    });
  });

  describe('type safety', () => {
    it('should infer correct input and output types', () => {
      const app = createApp();
      const routes = createRouter([
        app
          .post('/users')
          .input({ json: z.object({ name: z.string() }) })
          .handle((c) => c.json({ id: '1', name: c.input.json.name }, 201)),
        app.get('/users/:id').handle((c) => c.json({ id: c.params.id, name: 'User' })),
      ]);

      const caller = createCaller(routes, { baseUrl: 'http://localhost' });

      const _testPost = () => caller.users.$post({ json: { name: 'Alice' } });
      const _testGet = () => caller.users[':id'].$get({ params: { id: '123' } });

      // @ts-expect-error - missing required json
      const _testPostMissingJson = () => caller.users.$post({});

      // @ts-expect-error - missing required params
      const _testGetMissingParams = () => caller.users[':id'].$get();

      // @ts-expect-error - wrong type for name
      const _testPostWrongType = () => caller.users.$post({ json: { name: 123 } });

      expect(true).toBe(true);
    });

    it('should require var option when InitVar is defined', () => {
      const app = createApp<{ userId: string }>();
      const routes = createRouter([app.get('/me').handle((c) => c.json({ userId: c.var.userId }))]);

      // @ts-expect-error - missing required var
      const _missingVar = () => createCaller(routes);

      const _ok = () => createCaller(routes, { var: { userId: 'u1' } });
      expect(true).toBe(true);
    });
  });

  describe('requestInit option', () => {
    it('should merge default requestInit with request', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/headers').handle((c) =>
          c.json({
            auth: c.req.headers.get('Authorization'),
            custom: c.req.headers.get('X-Custom'),
          })
        ),
      ]);

      const caller = createCaller(routes, {
        baseUrl: 'http://localhost',
        requestInit: {
          headers: {
            Authorization: 'Bearer token123',
          },
        },
      });

      const { data, error } = await caller.headers.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ auth: 'Bearer token123', custom: null });
    });

    it('should allow overriding requestInit per request', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/headers').handle((c) => c.json({ auth: c.req.headers.get('Authorization') })),
      ]);

      const caller = createCaller(routes, {
        baseUrl: 'http://localhost',
        requestInit: {
          headers: {
            Authorization: 'Bearer default',
          },
        },
      });

      const { data, error } = await caller.headers.$get(
        {},
        {
          headers: {
            Authorization: 'Bearer override',
          },
        }
      );
      expect(error).toBeUndefined();
      expect(data).toEqual({ auth: 'Bearer override' });
    });
  });
});
