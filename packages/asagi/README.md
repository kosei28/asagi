# asagi

A type-safe web framework for TypeScript.

## Features

**Type Safety**

- Type-safe RPC client
- Type-safe Caller (Server-side RPC)
- Type-safe context variables with `$var<T>()`
- Type-safe initial context variables with `createApp<T>()` and `createServer()`
- Fully typed middleware — response types from middleware and validators are properly inferred

**Routing & Middleware**

- Chainable middleware with `use()`
- Reusable middleware with `createMiddleware()`
- All middleware is per-route — no wasted middleware calls when the route doesn't match
- Nested routers with `basePath()` and `createRouter()`

**Validation & Serialization**

- Input validation with [Standard Schema](https://github.com/standard-schema/standard-schema) (Zod, Valibot, ArkType, etc.)
- JSON Transformer — Rich type support (Date, Map, Set) via SuperJSON or custom implementations

## Installation

```bash
npm install asagi
```

## Example

For a more detailed example, see [example](example/).

### Server

```ts
import { createApp, createRouter, createServer } from "asagi";
import { z } from "zod";

const app = createApp()
  .$var<{ user: User | null }>()
  .use(async (c, next) => {
    c.var.user = await getUser(c.req);
    await next();
  });

const authed = app
  .createMiddleware()
  .use(async (c, next) => {
    if (!c.var.user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  })
  .$var<{ user: User }>();

const itemsApp = app.basePath("/items");

const itemsRouter = createRouter([
  itemsApp
    .post("/")
    .use(authed)
    .input({ json: z.object({ name: z.string().min(1) }) })
    .handle(async (c) => {
      const item = c.input.json;
      await saveItem(item, c.var.user);
      return c.json({ success: true });
    }),

  itemsApp.get("/").handle(async (c) => {
    const items = await getItems();
    return c.json({ items });
  }),

  itemsApp.get("/:id").handle(async (c) => {
    const item = await getItem(c.params.id);
    if (!item) {
      return c.json({ error: "Not Found" }, 404);
    }
    return c.json({ item });
  }),
]);

const appRouter = createRouter([
  app
    .get("/me")
    .use(authed)
    .handle(async (c) => {
      return c.json({ user: c.var.user });
    }),

  itemsRouter,
]);

export type AppRouter = typeof appRouter;

export default createServer(appRouter);
```

### Client

```ts
import { createClient } from "asagi";
import type { AppRouter } from "./server";

const api = createClient<AppRouter>({
  baseUrl: "http://localhost:3000",
});

// POST /items
const { data } = await api.items.$post({
  json: { name: "New Item" },
});
console.log(data); // { success: boolean }

// GET /items/:id
const { data, error } = await api.items[":id"].$get({
  params: { id: "item123" },
});
if (!error) {
  console.log(data); // { item: Item }
}
```

### Caller

You can use `createCaller` to call the router directly from the server-side.

```ts
import { createCaller } from "asagi";

const caller = createCaller(appRouter);

// POST /items
const { data } = await caller.items.$post({
  json: { name: "New Item" },
});
console.log(data); // { success: boolean }

// GET /items/:id
const { data, error } = await caller.items[":id"].$get({
  params: { id: "item123" },
});
if (!error) {
  console.log(data); // { item: Item }
}
```

### JSON Transformer

You can use transformers to customize JSON serialization for complex types (Date, Map, Set, etc.) that are not natively supported.

Asagi supports registering multiple transformers. It automatically selects the appropriate one based on the client's request:

- **Rich Client**: Negotiates to use a specific transformer (e.g., SuperJSON) for rich type support.
- **Standard Client**: Falls back to standard JSON if no specific transformer is requested.

#### SuperJSON Transformer

You can use the official SuperJSON transformer to serialize complex types.

First, install the transformer package:

```bash
npm install @asagi/superjson-transformer
```

Server:

```ts
import { createApp, createServer } from "asagi";
import { superjsonTransformer } from "@asagi/superjson-transformer";

const app = createApp();

const appRouter = createRouter([
  app.get("/now").handle(async (c) => {
    return c.json({ now: new Date() });
  }),
]);

export default createServer(appRouter, {
  transformers: [superjsonTransformer],
});
```

JavaScript client (using Superjson):

```ts
import { createClient } from "asagi";
import { superjsonTransformer } from "@asagi/superjson-transformer";
import type { AppRouter } from "./server";

const api = createClient<AppRouter, typeof superjsonTransformer>({
  baseUrl: "http://localhost:3000",
  transformer: superjsonTransformer,
});

const { data } = await api.now.$get();
console.log(data.now); // Date object (deserialized by Superjson)
```

Other clients (using standard JSON):

```bash
# curl or other HTTP clients receive standard JSON
curl http://localhost:3000/now
# => {"now":"2025-01-01T00:00:00.000Z"}
```

#### Custom Transformer

You can also define your own custom transformers.

```ts
import SuperJSON from "superjson";
import { createTransformer } from "asagi";

declare module "asagi" {
  interface TransformKind<Body> {
    superjson: Body;
  }
}

export const superjsonTransformer = createTransformer({
  name: "superjson",
  stringify: SuperJSON.stringify,
  parse: SuperJSON.parse,
});
```

`TransformKind` is required to infer the return type of the client.
The official `@asagi/superjson-transformer` provides a strictly typed `SuperjsonParsed<T>` utility (instead of just `Body`) that ensures type safety for supported serializable values.

## Inspired by

- [Hono](https://github.com/honojs/hono)
- [Elysia](https://github.com/elysiajs/elysia)
- [tRPC](https://github.com/trpc/trpc)
- [oRPC](https://github.com/unnoq/orpc)
