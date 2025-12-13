import SuperJSON from 'superjson';
import { z } from 'zod';
import { createApp, createRouter } from '../src';

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

async function log(req: Request, res: Response) {
  console.log(`${req.method} ${req.url} - ${res.status}`);
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

const app = createApp()
  .use(async (c, next) => {
    await next();
    await log(c.req, c.res);
  })
  .$var<{ user: User | null }>()
  .use(async (c, next) => {
    c.var.user = await getUser(c.req);
    await next();
  });

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
  itemsApp.get('/').handle(async (c) => {
    const items = await getItems();
    return c.json({ items });
  }),

  itemsApp
    .post('/')
    .use(authed)
    .input({ json: z.object({ name: z.string().min(1) }) })
    .handle(async (c) => {
      const item = c.input.json;
      await saveItem(item, c.var.user);
      return c.json({ success: true });
    }),

  itemsApp.get('/:id').handle(async (c) => {
    const item = await getItem(c.params.id);
    if (!item) {
      return c.json({ error: 'Not Found' }, 404);
    }
    return c.json({ item });
  }),
]);

const appRouter = createRouter({ transformers: [{ name: 'superjson', ...SuperJSON }] }, [
  app.get('/status').handle(async (c) => {
    return c.json({
      status: 'ok',
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

export default appRouter;

export type AppRouter = typeof appRouter;
