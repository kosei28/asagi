# asagi

A type-safe web framework for TypeScript.

## Features

- Type-safe context variables with `var<T>()`
- Chainable middleware with `use()`
- Reusable middleware with `createMiddleware()`
- Nested routers with `basePath()` and `createRouter()`
- Path parameters support (e.g., `/items/:id`)

## Example

```ts
import { createApp, createRouter } from "asagi";

const app = createApp()
  .basePath("/api")
  .var<{ user: User | null }>()
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
  .var<{ user: User }>();

const router = createRouter([
  app.get("/status").handle(async (c) => {
    return c.json({ status: "ok" });
  }),
  app
    .get("/me")
    .use(authed)
    .handle(async (c) => {
      return c.json({ user: c.var.user });
    }),
]);

export default router;
```

For a more detailed example, see [example.ts](example.ts).
