import { superjsonTransformer } from '@asagi/superjson-transformer';
import { createApp, createRouter, createServer } from 'asagi';
import { z } from 'zod';

type User = {
  id: string;
  name: string;
};

type Item = {
  id: string;
  name: string;
};

type NewItem = {
  name: string;
};

async function getUser(req: Request): Promise<User | null> {
  return { id: 'user123', name: 'Alice' };
}

async function getItems(): Promise<Item[]> {
  return [
    { id: 'item1', name: 'Item 1' },
    { id: 'item2', name: 'Item 2' },
  ];
}

async function getItem(id: string): Promise<Item | null> {
  return { id, name: `Item ${id}` };
}

async function saveItem(item: NewItem, user: User) {
  // ...
}

async function log(req: Request, res: Response) {
  console.log(`${req.method} ${req.url} - ${res.status}`);
}

const app = createApp<{ user: User | null | undefined }>()
  .use(async (c, next) => {
    await next();
    await log(c.req, c.res);
  })
  .use(async (c, next) => {
    if (c.var.user === undefined) {
      c.var.user = await getUser(c.req);
    }
    await next();
  })
  .$var<{ user: User | null }>();

const authed = app
  .createMiddleware()
  .use(async (c, next) => {
    if (!c.var.user) {
      return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
  })
  .$var<{ user: User }>();

const itemsApp = app.basePath('/items').use(async (c, next) => {
  // ...
  await next();
});

const itemsRouter = createRouter([
  itemsApp
    .post('/')
    .use(authed)
    .input({ json: z.object({ name: z.string().min(1) }) })
    .handle(async (c) => {
      const item = c.input.json;
      await saveItem(item, c.var.user);
      return c.json({ success: true });
    }),

  itemsApp.get('/').handle(async (c) => {
    const items = await getItems();
    return c.json({ items });
  }),

  itemsApp.get('/:id').handle(async (c) => {
    const item = await getItem(c.params.id);
    if (!item) {
      return c.json({ error: 'Not Found' }, 404);
    }
    return c.json({ item });
  }),
]);

export const appRouter = createRouter([
  app.get('/now').handle(async (c) => {
    return c.json({
      now: new Date(),
    });
  }),

  app
    .get('/me')
    .use(authed)
    .handle(async (c) => {
      return c.json({ user: c.var.user });
    }),

  itemsRouter,
]);

export type AppRouter = typeof appRouter;

export default createServer(appRouter, {
  var: { user: undefined },
  transformers: [superjsonTransformer],
});
