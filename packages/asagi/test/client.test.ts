import { describe, expect, expectTypeOf, it, mock } from 'bun:test';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
import { type BuiltRoute, createApp, createClient, createRouter, createServer, type Server } from '../src';
import type { JSONParsed } from '../src/utils/types';

// Helper to create a fetch function from server for testing
function createTestFetch(server: Server) {
  return ((url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? url : new Request(url, init);
    return server.fetch(request);
  }) as typeof fetch;
}

describe('createClient', () => {
  describe('basic usage', () => {
    it('should create a client with baseUrl', () => {
      const client = createClient({ baseUrl: 'http://localhost:3000' });
      expect(client).toBeDefined();
    });

    it('should create a client without options', () => {
      const client = createClient();
      expect(client).toBeDefined();
    });

    it('should create a client with URL object as baseUrl', () => {
      const client = createClient({ baseUrl: new URL('http://localhost:3000') });
      expect(client).toBeDefined();
    });
  });

  describe('HTTP methods', () => {
    const app = createApp();
    const routes = createRouter([
      app.get('/resource').handle((c) => c.json({ method: 'GET' })),
      app.post('/resource').handle((c) => c.json({ method: 'POST' })),
      app.put('/resource').handle((c) => c.json({ method: 'PUT' })),
      app.patch('/resource').handle((c) => c.json({ method: 'PATCH' })),
      app.delete('/resource').handle((c) => c.json({ method: 'DELETE' })),
    ]);
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should handle GET request', async () => {
      const { data, error } = await client.resource.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'GET' });
    });

    it('should handle POST request', async () => {
      const { data, error } = await client.resource.$post();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'POST' });
    });

    it('should handle PUT request', async () => {
      const { data, error } = await client.resource.$put();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'PUT' });
    });

    it('should handle PATCH request', async () => {
      const { data, error } = await client.resource.$patch();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'PATCH' });
    });

    it('should handle DELETE request', async () => {
      const { data, error } = await client.resource.$delete();
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'DELETE' });
    });
  });

  describe('$all method', () => {
    it('should use requestInit.method when calling $all', async () => {
      const app = createApp();
      const routes = createRouter([app.all('/resource').handle((c) => c.json({ method: c.req.method }))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error } = await client.resource.$all({}, { method: 'POST' });
      expect(error).toBeUndefined();
      expect(data).toEqual({ method: 'POST' });
    });

    it('should fall back to ALL route when method-specific route is missing', async () => {
      const app = createApp();
      const routes = createRouter([app.all('/resource').handle((c) => c.json({ method: c.req.method }))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error } = await (client.resource as any).$get();
      expect(error).toBeUndefined();
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
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should send path parameter', async () => {
      const { data, error } = await client.users[':id'].$get({ params: { id: '123' } });
      expect(error).toBeUndefined();
      expect(data).toEqual({ id: '123' });
    });

    it('should send multiple path parameters', async () => {
      const { data, error } = await client.users[':userId'].posts[':postId'].$get({
        params: { userId: 'user1', postId: 'post1' },
      });
      expect(error).toBeUndefined();
      expect(data).toEqual({ userId: 'user1', postId: 'post1' });
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
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should send query parameters', async () => {
      const { data, error } = await client.search.$get({ query: { q: 'test', limit: '10' } });
      expect(error).toBeUndefined();
      expect(data).toEqual({ q: 'test', limit: '10' });
    });

    it('should send query parameters with optional value omitted', async () => {
      const { data, error } = await client.search.$get({ query: { q: 'test' } });
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
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should send JSON body', async () => {
      const { data, error, res } = await client.users.$post({
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
      app
        .post('/upload')
        .input({ form: z.object({ file: z.file() }) })
        .handle((c) =>
          c.json({
            name: c.input.form.file.name,
            size: c.input.form.file.size,
            type: c.input.form.file.type.split(';')[0],
          })
        ),
      app
        .post('/tags')
        .input({ form: z.object({ tag: z.array(z.string()) }) })
        .handle((c) => c.json({ tag: c.input.form.tag })),
      app
        .post('/uploads')
        .input({ form: z.object({ file: z.array(z.file()) }) })
        .handle((c) =>
          c.json({
            names: c.input.form.file.map((f) => f.name),
            sizes: c.input.form.file.map((f) => f.size),
            types: c.input.form.file.map((f) => f.type.split(';')[0]),
          })
        ),
    ]);
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should send form data', async () => {
      const { data, error } = await client.login.$post({
        form: { username: 'admin', password: 'secret' },
      });
      expect(error).toBeUndefined();
      expect(data).toEqual({ username: 'admin' });
    });

    it('should send form data with File', async () => {
      const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      const { data, error } = await client.upload.$post({ form: { file } });
      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data).toEqual({ name: 'hello.txt', size: 5, type: 'text/plain' });
      expect(data!.type).toMatch(/^text\/plain/);
    });

    it('should send form data with multiple string values', async () => {
      const { data, error } = await client.tags.$post({ form: { tag: ['a', 'b', 'c'] } });
      expect(error).toBeUndefined();
      expect(data).toEqual({ tag: ['a', 'b', 'c'] });
    });

    it('should send form data with multiple files', async () => {
      const file1 = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      const file2 = new File(['world!'], 'world.txt', { type: 'text/plain' });
      const { data, error } = await client.uploads.$post({ form: { file: [file1, file2] } });
      expect(error).toBeUndefined();
      expect(data).toEqual({
        names: ['hello.txt', 'world.txt'],
        sizes: [5, 6],
        types: ['text/plain', 'text/plain'],
      });
    });

    it('should handle form data with mixed string and File', async () => {
      const mixedApp = createApp();
      const mixedRoutes = createRouter([
        mixedApp
          .post('/mixed')
          .input({
            form: z.object({
              items: z.array(z.union([z.string(), z.file()])),
            }),
          })
          .handle((c) =>
            c.json({
              items: c.input.form.items.map((i) => (typeof i === 'string' ? i : i.name)),
            })
          ),
      ]);
      const mixedServer = createServer(mixedRoutes);

      const mixedClient = createClient<typeof mixedRoutes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(mixedServer),
      });
      const file = new File(['mixed'], 'mixed.txt', { type: 'text/plain' });
      const { data, error } = await mixedClient.mixed.$post({
        form: {
          items: ['string-item', file],
        },
      });

      expect(error).toBeUndefined();
      expect(data).toEqual({
        items: ['string-item', 'mixed.txt'],
      });
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
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should send combined input (params, query, json)', async () => {
      const { data, error } = await client.items[':category'].$post({
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

  describe('response handling', () => {
    const app = createApp();
    const routes = createRouter([
      app.get('/success').handle((c) => c.json({ message: 'ok' })),
      app.get('/created').handle((c) => c.json({ id: '123' }, 201)),
      app.get('/not-found').handle((c) => c.json({ error: 'Not Found' }, 404)),
      app.get('/server-error').handle((c) => c.json({ error: 'Internal Server Error' }, 500)),
    ]);
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should return data for 200 response', async () => {
      const { data, error, status, ok, res } = await client.success.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ message: 'ok' });
      expect(status).toBe(200);
      expect(ok).toBe(true);
      expect(res.status).toBe(200);
      expect(res.ok).toBe(true);
    });

    it('should return data for 201 response', async () => {
      const { data, error, status, ok, res } = await client.created.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ id: '123' });
      expect(status).toBe(201);
      expect(ok).toBe(true);
      expect(res.status).toBe(201);
      expect(res.ok).toBe(true);
    });

    it('should return error for 404 response', async () => {
      const { data, error, status, ok, res } = await client['not-found'].$get();
      expect(data).toBeUndefined();
      expect(error).toEqual({ error: 'Not Found' });
      expect(status).toBe(404);
      expect(ok).toBe(false);
      expect(res.status).toBe(404);
      expect(res.ok).toBe(false);
    });

    it('should return error for 500 response', async () => {
      const { data, error, status, ok, res } = await client['server-error'].$get();
      expect(data).toBeUndefined();
      expect(error).toEqual({ error: 'Internal Server Error' });
      expect(status).toBe(500);
      expect(ok).toBe(false);
      expect(res.status).toBe(500);
      expect(res.ok).toBe(false);
    });

    it('should provide json() method on res', async () => {
      const { res } = await client.success.$get();
      const json = await res.json();
      expect(json).toEqual({ message: 'ok' });
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

      async function mockFetch() {
        return new Response('{}');
      }
      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: mockFetch as any,
      });

      // Type checking - these should compile without errors (wrapped to prevent actual execution errors)
      function _testPost() {
        return client.users.$post({ json: { name: 'Alice' } });
      }
      function _testGet() {
        return client.users[':id'].$get({ params: { id: '123' } });
      }

      function _testPostMissingJson() {
        // @ts-expect-error - missing required json
        return client.users.$post({});
      }

      function _testGetMissingParams() {
        // @ts-expect-error - missing required params
        return client.users[':id'].$get();
      }

      function _testPostWrongType() {
        // @ts-expect-error - wrong type for name
        return client.users.$post({ json: { name: 123 } });
      }

      expect(true).toBe(true); // Dummy assertion for type-only test
    });

    it('should infer correct response types', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/success').handle((c) => c.json({ message: 'ok' })),
        app.get('/error').handle((c) => c.json({ error: 'fail' }, 400)),
      ]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const successResult = await client.success.$get();
      expectTypeOf(successResult.data).toEqualTypeOf<{ message: string }>();
      expectTypeOf(successResult.error).toEqualTypeOf<undefined>();
      expectTypeOf(successResult.ok).toEqualTypeOf<true>();
      expectTypeOf(successResult.status).toEqualTypeOf<200>();
      expectTypeOf(successResult.res.ok).toEqualTypeOf<true>();
      expectTypeOf(successResult.res.status).toEqualTypeOf<200>();
      expectTypeOf(successResult.res.json).returns.toEqualTypeOf<Promise<{ message: string }>>();

      const errorResult = await client.error.$get();
      expectTypeOf(errorResult.data).toEqualTypeOf<undefined>();
      expectTypeOf(errorResult.error).toEqualTypeOf<{ error: string }>();
      expectTypeOf(errorResult.ok).toEqualTypeOf<false>();
      expectTypeOf(errorResult.status).toEqualTypeOf<400>();
      expectTypeOf(errorResult.res.ok).toEqualTypeOf<false>();
      expectTypeOf(errorResult.res.status).toEqualTypeOf<400>();
      expectTypeOf(errorResult.res.json).returns.toEqualTypeOf<Promise<{ error: string }>>();
    });
  });

  describe('basePath handling', () => {
    it('should prepend basePath to requests', async () => {
      const app = createApp().basePath('/api');
      const routes = createRouter([app.get('/test').handle((c) => c.json({ path: new URL(c.req.url).pathname }))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error } = await client.api.test.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ path: '/api/test' });
    });
  });

  describe('custom fetch', () => {
    it('should use custom fetch function', async () => {
      const customFetch = mock(async (url: string, init?: RequestInit) => {
        return new Response(JSON.stringify({ custom: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      });

      const client = createClient<BuiltRoute<any, any, any, any, any, any>[]>({
        baseUrl: 'http://localhost',
        fetch: customFetch as any,
      });

      const { data } = await (client as any).test.$get();
      expect(customFetch).toHaveBeenCalled();
      expect(data).toEqual({ custom: true });
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
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
        requestInit: {
          headers: {
            Authorization: 'Bearer token123',
          },
        },
      });

      const { data, error } = await client.headers.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ auth: 'Bearer token123', custom: null });
    });

    it('should allow overriding requestInit per request', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/headers').handle((c) =>
          c.json({
            auth: c.req.headers.get('Authorization'),
          })
        ),
      ]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
        requestInit: {
          headers: {
            Authorization: 'Bearer default',
          },
        },
      });

      const { data, error } = await client.headers.$get(
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

  describe('nested paths', () => {
    const app = createApp();
    const routes = createRouter([
      app.get('/api/v1/users').handle((c) => c.json({ users: [] })),
      app
        .get('/api/v1/users/:id/posts/:postId/comments')
        .handle((c) => c.json({ userId: c.params.id, postId: c.params.postId })),
    ]);
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should handle deeply nested paths', async () => {
      const { data, error } = await client.api.v1.users.$get();
      expect(error).toBeUndefined();
      expect(data).toEqual({ users: [] });
    });

    it('should handle deeply nested paths with params', async () => {
      const { data, error } = await client.api.v1.users[':id'].posts[':postId'].comments.$get({
        params: { id: 'user1', postId: 'post1' },
      });
      expect(error).toBeUndefined();
      expect(data).toEqual({ userId: 'user1', postId: 'post1' });
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
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should return error for invalid input', async () => {
      const result = await client.users.$post({
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
      const result = await client.users.$post({
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
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should handle text response', async () => {
      const { data, res } = await client.text.$get();
      expect(data).toBe('Hello, World!');
      expectTypeOf(data).toEqualTypeOf<'Hello, World!'>();
      expectTypeOf(res.text).returns.toEqualTypeOf<Promise<'Hello, World!'>>();
      const text = await res.text();
      expect(text).toBe('Hello, World!');
    });
  });

  describe('empty response', () => {
    const app = createApp();
    const routes = createRouter([app.delete('/items/:id').handle((c) => c.body(null, 204))]);
    const server = createServer(routes);

    const client = createClient<typeof routes>({
      baseUrl: 'http://localhost',
      fetch: createTestFetch(server),
    });

    it('should handle 204 No Content response', async () => {
      const { data, error, status, ok } = await client.items[':id'].$delete({ params: { id: '123' } });
      expect(status).toBe(204);
      expect(ok).toBe(true);
      expect(data).toBeUndefined();
      expect(error).toBeUndefined();
      expectTypeOf(data).toEqualTypeOf<unknown>();
      expectTypeOf(error).toEqualTypeOf<undefined>();
      expectTypeOf(ok).toEqualTypeOf<true>();
      expectTypeOf(status).toEqualTypeOf<204>();
    });
  });

  describe('response typing edge cases', () => {
    it('should type data/error as unknown for c.body() output and parse based on content-type', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/binary').handle((c) => c.body(new Uint8Array([1, 2, 3]))),
        app.get('/json').handle((c) =>
          c.body(JSON.stringify({ hello: 'world' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        ),
        app
          .get('/text')
          .handle((c) => c.body('Hello, World!', { status: 200, headers: { 'content-type': 'text/plain' } })),
        app.get('/binary-error').handle((c) => c.body(new Uint8Array([4, 5, 6]), 400)),
        app.get('/json-error').handle((c) =>
          c.body(JSON.stringify({ error: 'bad' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        ),
      ]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const binaryResult = await client.binary.$get();
      expectTypeOf(binaryResult.data).toEqualTypeOf<unknown>();
      expectTypeOf(binaryResult.error).toEqualTypeOf<undefined>();
      expect(binaryResult.data).toBeUndefined();
      expect(binaryResult.error).toBeUndefined();

      const jsonResult = await client.json.$get();
      expectTypeOf(jsonResult.data).toEqualTypeOf<unknown>();
      expectTypeOf(jsonResult.error).toEqualTypeOf<undefined>();
      expect(jsonResult.data).toEqual({ hello: 'world' });
      expect(jsonResult.error).toBeUndefined();

      const textResult = await client.text.$get();
      expectTypeOf(textResult.data).toEqualTypeOf<unknown>();
      expectTypeOf(textResult.error).toEqualTypeOf<undefined>();
      expect(textResult.data).toBe('Hello, World!');
      expect(textResult.error).toBeUndefined();

      const binaryErrorResult = await client['binary-error'].$get();
      expectTypeOf(binaryErrorResult.data).toEqualTypeOf<undefined>();
      expectTypeOf(binaryErrorResult.error).toEqualTypeOf<unknown>();
      expect(binaryErrorResult.data).toBeUndefined();
      expect(binaryErrorResult.error).toBeUndefined();

      const jsonErrorResult = await client['json-error'].$get();
      expectTypeOf(jsonErrorResult.data).toEqualTypeOf<undefined>();
      expectTypeOf(jsonErrorResult.error).toEqualTypeOf<unknown>();
      expect(jsonErrorResult.data).toBeUndefined();
      expect(jsonErrorResult.error).toEqual({ error: 'bad' });
    });

    it('should type data/error as unknown for raw Response output (and parse only json/text at runtime)', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/raw-json').handle(
          () =>
            new Response(JSON.stringify({ hello: 'world' }), {
              headers: { 'content-type': 'application/json' },
            })
        ),
        app.get('/raw-text').handle(
          () =>
            new Response('plain text', {
              headers: { 'content-type': 'text/plain; charset=utf-8' },
            })
        ),
        app.get('/raw-binary').handle(
          () =>
            new Response('ignored', {
              headers: { 'content-type': 'application/octet-stream' },
            })
        ),
        app.get('/raw-error-json').handle(
          () =>
            new Response(JSON.stringify({ error: 'bad' }), {
              status: 400,
              headers: { 'content-type': 'application/json' },
            })
        ),
      ]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const jsonResult = await client['raw-json'].$get();
      expectTypeOf(jsonResult.data).toEqualTypeOf<unknown>();
      expectTypeOf(jsonResult.error).toEqualTypeOf<unknown>();
      expect(jsonResult.data).toEqual({ hello: 'world' });
      expect(jsonResult.error).toBeUndefined();

      const textResult = await client['raw-text'].$get();
      expectTypeOf(textResult.data).toEqualTypeOf<unknown>();
      expectTypeOf(textResult.error).toEqualTypeOf<unknown>();
      expect(textResult.data).toBe('plain text');
      expect(textResult.error).toBeUndefined();

      const binaryResult = await client['raw-binary'].$get();
      expectTypeOf(binaryResult.data).toEqualTypeOf<unknown>();
      expectTypeOf(binaryResult.error).toEqualTypeOf<unknown>();
      expect(binaryResult.data).toBeUndefined();
      expect(binaryResult.error).toBeUndefined();

      const errorResult = await client['raw-error-json'].$get();
      expectTypeOf(errorResult.data).toEqualTypeOf<unknown>();
      expectTypeOf(errorResult.error).toEqualTypeOf<unknown>();
      expect(errorResult.data).toBeUndefined();
      expect(errorResult.error).toEqual({ error: 'bad' });
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
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const okResult = await client.maybe.$get({ query: { ok: 'true' } });
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

      const badResult = await client.maybe.$get({ query: { ok: 'false' } });
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

  describe('form response', () => {
    it('should parse form-data response and set data', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/form').handle((c) => c.form({ name: 'Alice', age: '30' }))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error, status, ok } = await client.form.$get();
      expect(status).toBe(200);
      expect(ok).toBe(true);
      expect(error).toBeUndefined();
      expect(data).toEqual({ name: 'Alice', age: '30' });
      expectTypeOf(data).toEqualTypeOf<{ name: string; age: string }>();
    });

    it('should parse form-data response with File', async () => {
      const app = createApp();
      const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      const routes = createRouter([app.get('/form').handle((c) => c.form({ file }))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error, status } = await client.form.$get();
      expect(status).toBe(200);
      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data.file.name).toBe('hello.txt');
      expect(await data.file.text()).toBe('hello');
    });

    it('should parse form-data response with string array', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/form').handle((c) => c.form({ tags: ['a', 'b', 'c'] }))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error, status } = await client.form.$get();
      expect(status).toBe(200);
      expect(error).toBeUndefined();
      expect(data).toEqual({ tags: ['a', 'b', 'c'] });
    });

    it('should parse form-data response with File array', async () => {
      const app = createApp();
      const file1 = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      const file2 = new File(['world'], 'world.txt', { type: 'text/plain' });
      const routes = createRouter([app.get('/form').handle((c) => c.form({ files: [file1, file2] }))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error, status } = await client.form.$get();
      expect(status).toBe(200);
      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      const files = data.files;
      expect(files).toHaveLength(2);
      expect(files[0]!.name).toBe('hello.txt');
      expect(files[1]!.name).toBe('world.txt');
    });

    it('should parse form-data response with mixed types', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/form').handle((c) => {
          const file = new File(['mixed'], 'mixed.txt', { type: 'text/plain' });
          return c.form({
            string: 'text',
            file: file,
            mixed: ['text', file],
          });
        }),
      ]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error, status } = await client.form.$get();
      expect(status).toBe(200);
      expect(error).toBeUndefined();
      expect(data).toBeDefined();
      expect(data.string).toBe('text');
      const receivedFile = data.file;
      expect(receivedFile.name).toBe('mixed.txt');

      const mixed = data.mixed;
      expectTypeOf(mixed).toEqualTypeOf<(string | File)[]>();
      expect(mixed).toHaveLength(2);
      expect(mixed[0]).toBe('text');
      expect((mixed[1] as File).name).toBe('mixed.txt');
    });
  });

  describe('redirect response', () => {
    it('should have undefined data and error for redirect', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/redirect').handle((c) => c.redirect('/new-location'))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error, status, ok, res } = await client.redirect.$get();
      expect(status).toBe(302);
      expect(ok).toBe(false);
      expect(data).toBeUndefined();
      expect(error).toBeUndefined();
      expect(res.headers.get('location')).toBe('/new-location');
      expectTypeOf(data).toEqualTypeOf<undefined>();
      expectTypeOf(error).toEqualTypeOf<undefined>();
    });

    it('should handle redirect with custom status', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/redirect').handle((c) => c.redirect('/permanent', 301))]);
      const server = createServer(routes);

      const client = createClient<typeof routes>({
        baseUrl: 'http://localhost',
        fetch: createTestFetch(server),
      });

      const { data, error, status, res } = await client.redirect.$get();
      expect(status).toBe(301);
      expect(data).toBeUndefined();
      expect(error).toBeUndefined();
      expect(res.headers.get('location')).toBe('/permanent');
    });
  });
});
