import { describe, expect, expectTypeOf, it } from 'bun:test';
import { z } from 'zod';
import { createApp, createRouter, createServer, type Server } from '../src';

// Helper function to create a request
const req = (method: string, path: string, options?: RequestInit) => {
  return new Request(`http://localhost${path}`, { method, ...options });
};

// Helper function to create JSON request
const jsonReq = (method: string, path: string, body: unknown) => {
  return req(method, path, {
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
};

// Helper function to create form request
const formReq = (method: string, path: string, data: Record<string, FormDataEntryValue | FormDataEntryValue[]>) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      for (const item of value) formData.append(key, item);
    } else {
      formData.append(key, value);
    }
  }
  return req(method, path, { body: formData });
};

describe('App Builder', () => {
  describe('createApp', () => {
    it('should create a basic app', () => {
      const app = createApp();
      expect(app).toBeDefined();
      expect(typeof app.get).toBe('function');
      expect(typeof app.post).toBe('function');
    });

    it('should create an app with initial var type', () => {
      const app = createApp<{ userId: string }>();
      expect(app).toBeDefined();
    });
  });

  describe('basePath', () => {
    it('should set base path for routes', async () => {
      const app = createApp().basePath('/api');
      const routes = createRouter([app.get('/users').handle((c) => c.json({ users: [] }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/api/users'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ users: [] });
    });

    it('should handle nested base paths', async () => {
      const app = createApp().basePath('/api').basePath('/v1');
      const routes = createRouter([app.get('/items').handle((c) => c.json({ items: [] }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/api/v1/items'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ items: [] });
    });
  });

  describe('use (middleware)', () => {
    it('should apply middleware function', async () => {
      const app = createApp<{ count: number }>().use(async (c, next) => {
        c.var.count = 10;
        await next();
      });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ count: c.var.count }))]);
      const server = createServer(routes, { var: { count: 0 } });

      const res = await server.fetch(req('GET', '/test'));
      expect(await res.json()).toEqual({ count: 10 });
    });

    it('should chain multiple middlewares', async () => {
      const app = createApp<{ values: number[] }>()
        .use(async (c, next) => {
          c.var.values.push(1);
          await next();
        })
        .use(async (c, next) => {
          c.var.values.push(2);
          await next();
        });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ values: c.var.values }))]);
      const server = createServer(routes, { var: { values: [] } });

      const res = await server.fetch(req('GET', '/test'));
      expect(await res.json()).toEqual({ values: [1, 2] });
    });

    it('should allow middleware to return early response', async () => {
      const app = createApp()
        .use(async (c, next) => {
          return c.json({ blocked: true }, 403);
        })
        .use(async (c, next) => {
          await next();
        });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ reached: true }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ blocked: true });
    });

    it('should use MiddlewareBuilder', async () => {
      const app = createApp<{ authenticated: boolean }>();
      const authMiddleware = app.createMiddleware().use(async (c, next) => {
        c.var.authenticated = true;
        await next();
      });

      const appWithAuth = app.use(authMiddleware);
      const routes = createRouter([appWithAuth.get('/test').handle((c) => c.json({ auth: c.var.authenticated }))]);
      const server = createServer(routes, { var: { authenticated: false } });

      const res = await server.fetch(req('GET', '/test'));
      expect(await res.json()).toEqual({ auth: true });
    });

    it('should catch errors in middleware with try/catch around next()', async () => {
      const app = createApp<{ errorCaught: boolean }>().use(async (c, next) => {
        try {
          await next();
        } catch (error) {
          c.var.errorCaught = true;
          return c.json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
        }
      });

      const routes = createRouter([
        app.get('/error').handle(() => {
          throw new Error('Handler error');
        }),
        app.get('/success').handle((c) => c.json({ success: true })),
      ]);
      const server = createServer(routes, { var: { errorCaught: false } });

      // Test error case
      const errorRes = await server.fetch(req('GET', '/error'));
      expect(errorRes.status).toBe(500);
      expect(await errorRes.json()).toEqual({ error: 'Handler error' });

      // Test success case (middleware doesn't interfere)
      const successRes = await server.fetch(req('GET', '/success'));
      expect(successRes.status).toBe(200);
      expect(await successRes.json()).toEqual({ success: true });
    });

    it('should catch async errors in middleware', async () => {
      const app = createApp().use(async (c, next) => {
        try {
          await next();
        } catch (error) {
          return c.json({ caught: true, message: (error as Error).message }, 500);
        }
      });

      const routes = createRouter([
        app.get('/async-error').handle(async () => {
          await Promise.resolve();
          throw new Error('Async handler error');
        }),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/async-error'));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ caught: true, message: 'Async handler error' });
    });

    it('should catch errors from nested middleware', async () => {
      const app = createApp()
        .use(async (c, next) => {
          try {
            await next();
          } catch (error) {
            return c.json({ level: 'outer', message: (error as Error).message }, 500);
          }
        })
        .use(async (c, next) => {
          // This middleware throws
          throw new Error('Middleware error');
        });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ reached: true }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ level: 'outer', message: 'Middleware error' });
    });
  });

  describe('$var', () => {
    it('should narrow var type after middleware', () => {
      const app = createApp<{ user: string | null }>()
        .use(async (c, next) => {
          c.var.user = 'test-user';
          await next();
        })
        .$var<{ user: string }>();

      app.get('/test').handle((c) => {
        expectTypeOf(c.var.user).toEqualTypeOf<string>();
        return c.json({ user: c.var.user });
      });
    });
  });

  describe('createMiddleware', () => {
    it('should create reusable middleware', async () => {
      const app = createApp<{ role: string }>();

      const adminMiddleware = app.createMiddleware().use(async (c, next) => {
        if (c.var.role !== 'admin') {
          return c.json({ error: 'Forbidden' }, 403);
        }
        await next();
      });

      const routes = createRouter([
        app.get('/public').handle((c) => c.json({ public: true })),
        app
          .get('/admin')
          .use(adminMiddleware)
          .handle((c) => c.json({ admin: true })),
      ]);
      const server = createServer(routes, { var: { role: 'user' } });

      const publicRes = await server.fetch(req('GET', '/public'));
      expect(await publicRes.json()).toEqual({ public: true });

      const adminRes = await server.fetch(req('GET', '/admin'));
      expect(adminRes.status).toBe(403);
    });
  });

  describe('input (app-level)', () => {
    it('should validate json input at app level', async () => {
      const app = createApp().input({
        json: z.object({ name: z.string() }),
      });

      const routes = createRouter([app.post('/test').handle((c) => c.json({ name: c.input.json.name }))]);
      const server = createServer(routes);

      const res = await server.fetch(jsonReq('POST', '/test', { name: 'Alice' }));
      expect(await res.json()).toEqual({ name: 'Alice' });
    });
  });
});

describe('Middleware Builder', () => {
  describe('use', () => {
    it('should chain middlewares in builder', async () => {
      const app = createApp<{ steps: string[] }>();
      const middleware = app
        .createMiddleware()
        .use(async (c, next) => {
          c.var.steps.push('first');
          await next();
        })
        .use(async (c, next) => {
          c.var.steps.push('second');
          await next();
        });

      const routes = createRouter([
        app
          .get('/test')
          .use(middleware)
          .handle((c) => c.json({ steps: c.var.steps })),
      ]);
      const server = createServer(routes, { var: { steps: [] } });

      const res = await server.fetch(req('GET', '/test'));
      expect(await res.json()).toEqual({ steps: ['first', 'second'] });
    });
  });

  describe('$var', () => {
    it('should update var type in middleware builder', () => {
      const app = createApp<{ data: string | null }>();
      const middleware = app
        .createMiddleware()
        .use(async (c, next) => {
          c.var.data = 'loaded';
          await next();
        })
        .$var<{ data: string }>();

      app
        .get('/test')
        .use(middleware)
        .handle((c) => {
          expectTypeOf(c.var.data).toEqualTypeOf<string>();
          return c.json({ data: c.var.data });
        });
    });
  });

  describe('input', () => {
    it('should validate input in middleware builder', async () => {
      const app = createApp();
      const middleware = app.createMiddleware().input({
        query: z.object({ page: z.string() }),
      });

      const routes = createRouter([
        app
          .get('/test')
          .use(middleware)
          .handle((c) => c.json({ page: c.input.query.page })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test?page=5'));
      expect(await res.json()).toEqual({ page: '5' });
    });
  });
});

describe('Route Builder', () => {
  describe('HTTP Methods', () => {
    const createMethodServer = (): Server => {
      const app = createApp();
      const routes = createRouter([
        app.get('/resource').handle((c) => c.json({ method: 'GET' })),
        app.post('/resource').handle((c) => c.json({ method: 'POST' })),
        app.put('/resource').handle((c) => c.json({ method: 'PUT' })),
        app.patch('/resource').handle((c) => c.json({ method: 'PATCH' })),
        app.delete('/resource').handle((c) => c.json({ method: 'DELETE' })),
        app.all('/any').handle((c) => c.json({ method: c.req.method })),
        app.on('OPTIONS', '/options').handle((c) => c.json({ method: 'OPTIONS' })),
      ]);
      return createServer(routes);
    };

    it('should handle GET request', async () => {
      const server = createMethodServer();
      const res = await server.fetch(req('GET', '/resource'));
      expect(await res.json()).toEqual({ method: 'GET' });
    });

    it('should handle POST request', async () => {
      const server = createMethodServer();
      const res = await server.fetch(req('POST', '/resource'));
      expect(await res.json()).toEqual({ method: 'POST' });
    });

    it('should handle PUT request', async () => {
      const server = createMethodServer();
      const res = await server.fetch(req('PUT', '/resource'));
      expect(await res.json()).toEqual({ method: 'PUT' });
    });

    it('should handle PATCH request', async () => {
      const server = createMethodServer();
      const res = await server.fetch(req('PATCH', '/resource'));
      expect(await res.json()).toEqual({ method: 'PATCH' });
    });

    it('should handle DELETE request', async () => {
      const server = createMethodServer();
      const res = await server.fetch(req('DELETE', '/resource'));
      expect(await res.json()).toEqual({ method: 'DELETE' });
    });

    it('should handle ALL method for any HTTP method', async () => {
      const server = createMethodServer();

      const getRes = await server.fetch(req('GET', '/any'));
      expect(await getRes.json()).toEqual({ method: 'GET' });

      const postRes = await server.fetch(req('POST', '/any'));
      expect(await postRes.json()).toEqual({ method: 'POST' });
    });

    it('should handle custom method with on()', async () => {
      const server = createMethodServer();
      const res = await server.fetch(req('OPTIONS', '/options'));
      expect(await res.json()).toEqual({ method: 'OPTIONS' });
    });
  });

  describe('Route params', () => {
    it('should extract route params', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/users/:id').handle((c) => c.json({ id: c.params.id }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/users/123'));
      expect(await res.json()).toEqual({ id: '123' });
    });

    it('should extract multiple route params', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .get('/users/:userId/posts/:postId')
          .handle((c) => c.json({ userId: c.params.userId, postId: c.params.postId })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/users/1/posts/2'));
      expect(await res.json()).toEqual({ userId: '1', postId: '2' });
    });
  });

  describe('use (route-level middleware)', () => {
    it('should apply middleware to specific route', async () => {
      const app = createApp<{ processed: boolean }>();
      const routes = createRouter([
        app.get('/without').handle((c) => c.json({ processed: c.var.processed })),
        app
          .get('/with')
          .use(async (c, next) => {
            c.var.processed = true;
            await next();
          })
          .handle((c) => c.json({ processed: c.var.processed })),
      ]);
      const server = createServer(routes, { var: { processed: false } });

      const withoutRes = await server.fetch(req('GET', '/without'));
      expect(await withoutRes.json()).toEqual({ processed: false });

      const withRes = await server.fetch(req('GET', '/with'));
      expect(await withRes.json()).toEqual({ processed: true });
    });
  });

  describe('input (route-level)', () => {
    it('should validate json body', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .post('/users')
          .input({ json: z.object({ name: z.string(), email: z.string().email() }) })
          .handle((c) => c.json({ user: c.input.json })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(jsonReq('POST', '/users', { name: 'Bob', email: 'bob@example.com' }));
      expect(await res.json()).toEqual({ user: { name: 'Bob', email: 'bob@example.com' } });
    });

    it('should validate query params', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .get('/search')
          .input({ query: z.object({ q: z.string(), limit: z.string() }) })
          .handle((c) => c.json({ query: c.input.query.q, limit: c.input.query.limit })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/search?q=test&limit=10'));
      expect(await res.json()).toEqual({ query: 'test', limit: '10' });
    });

    it('should validate route params with schema', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .get('/items/:id')
          .input({ params: z.object({ id: z.string().regex(/^\d+$/) }) })
          .handle((c) => c.json({ id: c.input.params.id })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/items/42'));
      expect(await res.json()).toEqual({ id: '42' });
    });

    it('should validate form data', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .post('/form')
          .input({ form: z.object({ username: z.string(), password: z.string() }) })
          .handle((c) => c.json({ username: c.input.form.username })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(formReq('POST', '/form', { username: 'admin', password: 'secret' }));
      expect(await res.json()).toEqual({ username: 'admin' });
    });

    it('should validate form data with File', async () => {
      const app = createApp();
      const routes = createRouter([
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
      ]);
      const server = createServer(routes);

      const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      const res = await server.fetch(formReq('POST', '/upload', { file }));
      const body = await res.json();
      expect(body).toEqual({ name: 'hello.txt', size: 5, type: 'text/plain' });
      expect(body.type).toMatch(/^text\/plain/);
    });

    it('should validate form data with multiple string values', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .post('/tags')
          .input({ form: z.object({ tag: z.array(z.string()) }) })
          .handle((c) => c.json({ tag: c.input.form.tag })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(formReq('POST', '/tags', { tag: ['a', 'b', 'c'] }));
      expect(await res.json()).toEqual({ tag: ['a', 'b', 'c'] });
    });

    it('should validate form data with multiple files', async () => {
      const app = createApp();
      const routes = createRouter([
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

      const file1 = new File(['hello'], 'hello.txt', { type: 'text/plain' });
      const file2 = new File(['world!'], 'world.txt', { type: 'text/plain' });
      const res = await server.fetch(formReq('POST', '/uploads', { file: [file1, file2] }));
      expect(await res.json()).toEqual({
        names: ['hello.txt', 'world.txt'],
        sizes: [5, 6],
        types: ['text/plain', 'text/plain'],
      });
    });

    it('should return 400 for invalid json input', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .post('/users')
          .input({ json: z.object({ name: z.string(), age: z.number() }) })
          .handle((c) => c.json({ success: true })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(jsonReq('POST', '/users', { name: 'Bob', age: 'not-a-number' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid input');
      expect(body.issues).toBeDefined();
    });

    it('should return 400 for invalid query input', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .get('/items')
          .input({ query: z.object({ page: z.string().regex(/^\d+$/) }) })
          .handle((c) => c.json({ page: c.input.query.page })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/items?page=invalid'));
      expect(res.status).toBe(400);
    });

    it('should combine multiple input schemas', async () => {
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

      const res = await server.fetch(jsonReq('POST', '/items/electronics?sort=price', { name: 'Phone' }));
      expect(await res.json()).toEqual({
        category: 'electronics',
        sort: 'price',
        name: 'Phone',
      });
    });

    it('should not allow setting both json and form input', () => {
      const app = createApp();

      // After setting json, form should be never
      const routeWithJson = app.post('/test').input({ json: z.object({ name: z.string() }) });
      routeWithJson.input({
        // @ts-expect-error form should not be allowed after json is set
        form: z.object({ field: z.string() }),
      });

      // After setting form, json should be never
      const routeWithForm = app.post('/test2').input({ form: z.object({ field: z.string() }) });
      routeWithForm.input({
        // @ts-expect-error json should not be allowed after form is set
        json: z.object({ name: z.string() }),
      });
    });

    it('should accept zod schemas in .input() (type-level)', () => {
      const app = createApp()
        .input({
          query: z.object({
            page: z.string().transform((v) => Number(v)),
            limit: z.coerce.number<string>(),
          }),
          params: z.object({
            id: z.coerce.number<string>(),
          }),
        })
        .input({
          json: z.object({
            name: z.string(),
            createdAt: z.coerce.date<string>(),
          }),
        });

      app.post('/users/:id').handle((c) => {
        expectTypeOf(c.input.query.page).toEqualTypeOf<number>();
        expectTypeOf(c.input.query.limit).toEqualTypeOf<number>();
        expectTypeOf(c.input.params.id).toEqualTypeOf<number>();
        expectTypeOf(c.input.json.name).toEqualTypeOf<string>();
        expectTypeOf(c.input.json.createdAt).toEqualTypeOf<Date>();
        return c.json({ ok: true });
      });
    });

    it('should reject incompatible schema types in .input() (type-level)', () => {
      const app = createApp();

      // @ts-expect-error .input() expects an object of schemas (not a single schema)
      app.get('/').input(z.object({ q: z.string() }));

      // @ts-expect-error unknown schema key should be rejected
      app.get('/').input({ headers: z.object({ 'x-test': z.string() }) });

      // @ts-expect-error cannot set both json and form at the same time
      app.post('/').input({ json: z.object({ ok: z.boolean() }), form: z.object({ ok: z.string() }) });

      // @ts-expect-error schema values must implement StandardSchemaV1
      app.get('/').input({ query: {} });

      // @ts-expect-error input type cannot be `unknown`
      app.post('/').input({ query: z.unknown() });

      // @ts-expect-error query schema input must be Record<string, string>
      app.get('/').input({ query: z.string() });

      // @ts-expect-error query schema input values must be strings (parsed output can differ)
      app.get('/').input({ query: z.record(z.string(), z.number()) });

      // @ts-expect-error query schema input values must be strings (parsed output can differ)
      app.get('/').input({ query: z.object({ page: z.number() }) });

      // @ts-expect-error params schema input must be Record<string, string>
      app.get('/').input({ params: z.string() });

      // @ts-expect-error params schema input values must be strings (parsed output can differ)
      app.get('/').input({ params: z.record(z.string(), z.number()) });

      // @ts-expect-error params schema input values must be strings (parsed output can differ)
      app.get('/').input({ params: z.object({ page: z.number() }) });

      // @ts-expect-error json schema input must be JSONValue
      app.post('/').input({ json: z.instanceof(Date) });

      // @ts-expect-error json schema input must be JSONValue
      app.post('/').input({ json: z.bigint() });

      // @ts-expect-error json schema input must be JSONValue
      app.post('/').input({ json: z.symbol() });

      // @ts-expect-error json schema input must be JSONValue
      app.post('/').input({ json: z.undefined() });

      // @ts-expect-error json schema input must be JSONValue
      app.post('/').input({ json: z.function() });

      // @ts-expect-error form schema input must be Record<string, ...> not a scalar
      app.post('/upload').input({ form: z.string() });

      // @ts-expect-error form schema input values must be string/string[]/File/File[]
      app.post('/upload').input({ form: z.object({ file: z.number() }) });

      // @ts-expect-error form schema input values must be string/string[]/File/File[]
      app.post('/upload').input({ form: z.record(z.string(), z.boolean()) });

      // @ts-expect-error form schema input values must be string/string[]/File/File[]
      app.post('/upload').input({ form: z.object({ nums: z.array(z.number()) }) });

      // @ts-expect-error form schema input values must be string/string[]/File/File[] (no nested objects)
      app.post('/upload').input({ form: z.object({ meta: z.object({ a: z.string() }) }) });
    });
  });

  describe('handle', () => {
    it('should execute handler and return response', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/').handle((c) => c.json({ message: 'Hello' }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: 'Hello' });
    });

    it('should handle direct Response object return', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/response').handle(() => new Response('Direct response', { status: 200 })),
        app.get('/json-response').handle(
          () =>
            new Response(JSON.stringify({ direct: true }), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            })
        ),
        app.get('/custom-headers').handle(
          () =>
            new Response('Custom', {
              status: 200,
              headers: {
                'X-Custom': 'header-value',
                'Content-Type': 'text/plain',
              },
            })
        ),
      ]);
      const server = createServer(routes);

      // Test plain text Response
      const textRes = await server.fetch(req('GET', '/response'));
      expect(textRes.status).toBe(200);
      expect(await textRes.text()).toBe('Direct response');

      // Test JSON Response with custom status
      const jsonRes = await server.fetch(req('GET', '/json-response'));
      expect(jsonRes.status).toBe(201);
      expect(await jsonRes.json()).toEqual({ direct: true });

      // Test Response with custom headers
      const customRes = await server.fetch(req('GET', '/custom-headers'));
      expect(customRes.status).toBe(200);
      expect(customRes.headers.get('X-Custom')).toBe('header-value');
      expect(await customRes.text()).toBe('Custom');
    });
  });
});

describe('Context', () => {
  describe('req', () => {
    it('should provide access to request', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/test').handle((c) =>
          c.json({
            method: c.req.method,
            url: c.req.url,
          })
        ),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      const body = await res.json();
      expect(body.method).toBe('GET');
      expect(body.url).toContain('/test');
    });

    it('should allow reading headers', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/test').handle((c) => c.json({ auth: c.req.headers.get('Authorization') })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test', { headers: { Authorization: 'Bearer token123' } }));
      expect(await res.json()).toEqual({ auth: 'Bearer token123' });
    });
  });

  describe('params', () => {
    it('should provide route params', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/users/:id/posts/:postId').handle((c) => c.json({ userId: c.params.id, postId: c.params.postId })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/users/42/posts/100'));
      expect(await res.json()).toEqual({ userId: '42', postId: '100' });
    });
  });

  describe('var', () => {
    it('should allow setting and getting context variables', async () => {
      const app = createApp<{ counter: number }>()
        .use(async (c, next) => {
          c.var.counter += 1;
          await next();
        })
        .use(async (c, next) => {
          c.var.counter += 10;
          await next();
        });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ counter: c.var.counter }))]);
      const server = createServer(routes, { var: { counter: 0 } });

      const res = await server.fetch(req('GET', '/test'));
      expect(await res.json()).toEqual({ counter: 11 });
    });
  });

  describe('res', () => {
    it('should have default Response with status 204 as initial value', async () => {
      let initialStatus = 0;
      const app = createApp().use(async (c, next) => {
        initialStatus = c.res.status;
        await next();
      });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ ok: true }))]);
      const server = createServer(routes);

      await server.fetch(req('GET', '/test'));
      expect(initialStatus).toBe(204);
    });

    it('should get handler response after await next()', async () => {
      let resStatusAfterNext = 0;
      let resBodyAfterNext = '';
      const app = createApp().use(async (c, next) => {
        await next();
        resStatusAfterNext = c.res.status;
        resBodyAfterNext = await c.res.clone().text();
      });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ message: 'Hello' }, 201))]);
      const server = createServer(routes);

      await server.fetch(req('GET', '/test'));
      expect(resStatusAfterNext).toBe(201);
      expect(JSON.parse(resBodyAfterNext)).toEqual({ message: 'Hello' });
    });

    it('should completely overwrite c.res set before await next() with handler response', async () => {
      let resStatusAfterNext = 0;
      let resHeaderAfterNext: string | null = null;
      const app = createApp().use(async (c, next) => {
        // Set c.res before calling next()
        c.res = new Response('Middleware response', {
          status: 500,
          headers: { 'X-Middleware': 'before-next' },
        });
        await next();
        resStatusAfterNext = c.res.status;
        resHeaderAfterNext = c.res.headers.get('X-Middleware');
      });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ handler: true }, 200))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      // Handler response should completely overwrite middleware's c.res
      expect(resStatusAfterNext).toBe(200);
      expect(resHeaderAfterNext).toBeNull();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ handler: true });
    });

    it('should not change c.res when handler returns nothing', async () => {
      let resStatusBefore = 0;
      let resStatusAfter = 0;
      const app = createApp().use(async (c, next) => {
        resStatusBefore = c.res.status;
        await next();
        resStatusAfter = c.res.status;
      });

      const routes = createRouter([
        app.get('/test').handle(() => {
          // Handler returns nothing
        }),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      // When handler returns nothing, c.res remains unchanged (initial value with status 204)
      expect(resStatusBefore).toBe(204);
      expect(resStatusAfter).toBe(204);
      expect(res.status).toBe(204);
    });

    it('should allow modifying response by overwriting c.res after await next()', async () => {
      const app = createApp().use(async (c, next) => {
        await next();
        // Modify the response after handler
        const originalBody = await c.res.json();
        c.res = new Response(JSON.stringify({ ...originalBody, modified: true }), {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
            'X-Modified': 'true',
          },
        });
      });

      const routes = createRouter([app.get('/test').handle((c) => c.json({ original: true }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(202);
      expect(res.headers.get('X-Modified')).toBe('true');
      expect(await res.json()).toEqual({ original: true, modified: true });
    });
  });

  describe('input', () => {
    it('should provide validated input', async () => {
      const app = createApp();
      const routes = createRouter([
        app
          .post('/test')
          .input({
            json: z.object({ data: z.string() }),
            query: z.object({ format: z.string() }),
          })
          .handle((c) =>
            c.json({
              data: c.input.json.data,
              format: c.input.query.format,
            })
          ),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(jsonReq('POST', '/test?format=json', { data: 'hello' }));
      expect(await res.json()).toEqual({ data: 'hello', format: 'json' });
    });
  });

  describe('json response', () => {
    it('should return json with default 200 status', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.json({ success: true }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
    });

    it('should return json with custom status code', async () => {
      const app = createApp();
      const routes = createRouter([app.post('/test').handle((c) => c.json({ created: true }, 201))]);
      const server = createServer(routes);

      const res = await server.fetch(req('POST', '/test'));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({ created: true });
    });

    it('should return json with status in options', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.json({ error: 'Not found' }, { status: 404 }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(404);
    });

    it('should return json with custom headers', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/test').handle((c) => c.json({ data: 'test' }, { headers: { 'X-Custom-Header': 'custom-value' } })),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.headers.get('X-Custom-Header')).toBe('custom-value');
    });
  });

  describe('text response', () => {
    it('should return text with default 200 status', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.text('Hello, World!'))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello, World!');
    });

    it('should return text with custom status', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.text('Created', 201))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(201);
    });
  });

  describe('body response', () => {
    it('should return body with default 200 status', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.body('Raw body content'))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Raw body content');
    });

    it('should return body with custom status', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.body('Accepted', 202))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/test'));
      expect(res.status).toBe(202);
    });
  });
});

describe('createServer', () => {
  describe('basic fetch', () => {
    it('should handle basic request', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/').handle((c) => c.json({ ok: true }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    });

    it('should return 404 for unmatched routes', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/exists').handle((c) => c.json({ exists: true }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/not-exists'));
      expect(res.status).toBe(404);
    });

    it('should return 404 for wrong HTTP method', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.json({ method: 'GET' }))]);
      const server = createServer(routes);

      const res = await server.fetch(req('POST', '/test'));
      expect(res.status).toBe(404);
    });
  });

  describe('basePath option', () => {
    it('should apply server-level basePath', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/users').handle((c) => c.json({ users: [] }))]);
      const server = createServer(routes, { basePath: '/api' });

      const res = await server.fetch(req('GET', '/api/users'));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ users: [] });
    });

    it('should return 404 for requests without basePath', async () => {
      const app = createApp();
      const routes = createRouter([app.get('/users').handle((c) => c.json({ users: [] }))]);
      const server = createServer(routes, { basePath: '/api' });

      const res = await server.fetch(req('GET', '/users'));
      expect(res.status).toBe(404);
    });

    it('should combine server basePath with app basePath', async () => {
      const app = createApp().basePath('/v1');
      const routes = createRouter([app.get('/items').handle((c) => c.json({ items: [] }))]);
      const server = createServer(routes, { basePath: '/api' });

      const res = await server.fetch(req('GET', '/api/v1/items'));
      expect(res.status).toBe(200);
    });
  });

  describe('var option', () => {
    it('should provide initial var to context', async () => {
      const app = createApp<{ appName: string; version: number }>();
      const routes = createRouter([
        app.get('/info').handle((c) => c.json({ name: c.var.appName, version: c.var.version })),
      ]);
      const server = createServer(routes, {
        var: { appName: 'TestApp', version: 1 },
      });

      const res = await server.fetch(req('GET', '/info'));
      expect(await res.json()).toEqual({ name: 'TestApp', version: 1 });
    });

    it('should require var option when app has InitVar', () => {
      const app = createApp<{ userId: string }>();
      const routes = createRouter([app.get('/test').handle((c) => c.json({ userId: c.var.userId }))]);

      // @ts-expect-error var option is required when InitVar is defined
      createServer(routes);

      // @ts-expect-error var option is required even with empty options
      createServer(routes, {});

      // @ts-expect-error var must have the correct type
      createServer(routes, { var: { userId: 123 } });

      // @ts-expect-error var must have all required properties
      createServer(routes, { var: {} });

      // This should work (correct type)
      createServer(routes, { var: { userId: 'test' } });
    });

    it('should not require var option when app has no InitVar', () => {
      const app = createApp();
      const routes = createRouter([app.get('/test').handle((c) => c.json({ ok: true }))]);

      // These should all work without var option
      createServer(routes);
      createServer(routes, {});
      createServer(routes, { basePath: '/api' });

      // @ts-expect-error var should not accept any properties when InitVar is not defined
      createServer(routes, { var: { unexpected: 'value' } });
    });
  });

  describe('error handling', () => {
    it('should return 500 for unhandled errors', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/error').handle(() => {
          throw new Error('Something went wrong');
        }),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/error'));
      expect(res.status).toBe(500);
    });

    it('should return 500 for async errors', async () => {
      const app = createApp();
      const routes = createRouter([
        app.get('/async-error').handle(async () => {
          await Promise.reject(new Error('Async error'));
        }),
      ]);
      const server = createServer(routes);

      const res = await server.fetch(req('GET', '/async-error'));
      expect(res.status).toBe(500);
    });
  });
});

describe('createRouter', () => {
  it('should flatten nested route arrays', async () => {
    const app = createApp();

    const userRoutes = [
      app.get('/users').handle((c) => c.json({ users: [] })),
      app.post('/users').handle((c) => c.json({ created: true })),
    ];

    const itemRoutes = [app.get('/items').handle((c) => c.json({ items: [] }))];

    const routes = createRouter([...userRoutes, ...itemRoutes]);
    const server = createServer(routes);

    const usersRes = await server.fetch(req('GET', '/users'));
    expect(await usersRes.json()).toEqual({ users: [] });

    const itemsRes = await server.fetch(req('GET', '/items'));
    expect(await itemsRes.json()).toEqual({ items: [] });
  });

  it('should handle single route', async () => {
    const app = createApp();
    const routes = createRouter([app.get('/single').handle((c) => c.json({ single: true }))]);
    const server = createServer(routes);

    const res = await server.fetch(req('GET', '/single'));
    expect(await res.json()).toEqual({ single: true });
  });
});

describe('Integration: Complete workflow', () => {
  it('should handle complex app with multiple features', async () => {
    // Define types
    type User = { id: string; name: string };
    type AppVar = { user: User | null; requestId: string };

    // Create app with initial var
    const app = createApp<AppVar>();

    // Add request ID middleware
    const withRequestId = app.createMiddleware().use(async (c, next) => {
      c.var.requestId = crypto.randomUUID();
      await next();
    });

    // Add auth middleware
    const withAuth = app
      .createMiddleware()
      .use(async (c, next) => {
        const auth = c.req.headers.get('Authorization');
        if (auth === 'Bearer valid-token') {
          c.var.user = { id: '1', name: 'Alice' };
        }
        await next();
      })
      .$var<{ user: User | null }>();

    // Protected middleware
    const requireAuth = app.createMiddleware().use(async (c, next) => {
      if (!c.var.user) {
        return c.json({ error: 'Unauthorized' }, 401);
      }
      await next();
    });

    // API routes
    const apiApp = app.basePath('/api').use(withRequestId).use(withAuth);

    // Define routes
    const routes = createRouter([
      // Public route
      apiApp
        .get('/health')
        .handle((c) => c.json({ status: 'ok', requestId: c.var.requestId })),

      // Protected route
      apiApp
        .get('/me')
        .use(requireAuth)
        .handle((c) => c.json({ user: c.var.user })),

      // Route with validation
      apiApp
        .post('/items')
        .use(requireAuth)
        .input({
          json: z.object({
            name: z.string().min(1),
            price: z.number().positive(),
          }),
        })
        .handle((c) =>
          c.json(
            {
              item: {
                id: crypto.randomUUID(),
                name: c.input.json.name,
                price: c.input.json.price,
                createdBy: c.var.user!.id,
              },
            },
            201
          )
        ),

      // Route with params and query
      apiApp
        .get('/items/:id')
        .input({
          params: z.object({ id: z.string().uuid() }),
          query: z.object({ include: z.string().optional() }),
        })
        .handle((c) =>
          c.json({
            id: c.input.params.id,
            include: c.input.query.include,
          })
        ),
    ]);

    const server = createServer(routes, { var: { user: null, requestId: '' } });

    // Test health endpoint
    const healthRes = await server.fetch(req('GET', '/api/health'));
    expect(healthRes.status).toBe(200);
    const healthBody = await healthRes.json();
    expect(healthBody.status).toBe('ok');
    expect(healthBody.requestId).toBeDefined();

    // Test unauthorized access
    const unauthorizedRes = await server.fetch(req('GET', '/api/me'));
    expect(unauthorizedRes.status).toBe(401);

    // Test authorized access
    const authorizedRes = await server.fetch(
      req('GET', '/api/me', { headers: { Authorization: 'Bearer valid-token' } })
    );
    expect(authorizedRes.status).toBe(200);
    expect(await authorizedRes.json()).toEqual({
      user: { id: '1', name: 'Alice' },
    });

    // Test create item with validation
    const createRes = await server.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ name: 'Widget', price: 29.99 }),
      })
    );
    expect(createRes.status).toBe(201);
    const createBody = await createRes.json();
    expect(createBody.item.name).toBe('Widget');
    expect(createBody.item.createdBy).toBe('1');

    // Test validation error
    const invalidRes = await server.fetch(
      new Request('http://localhost/api/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: JSON.stringify({ name: '', price: -10 }),
      })
    );
    expect(invalidRes.status).toBe(400);

    // Test params and query validation
    const itemId = crypto.randomUUID();
    const itemRes = await server.fetch(req('GET', `/api/items/${itemId}?include=details`));
    expect(itemRes.status).toBe(200);
    expect(await itemRes.json()).toEqual({
      id: itemId,
      include: 'details',
    });

    // Test invalid UUID param
    const invalidParamRes = await server.fetch(req('GET', '/api/items/not-a-uuid'));
    expect(invalidParamRes.status).toBe(400);
  });
});
