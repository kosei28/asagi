# @asagijs/superjson-transformer

SuperJSON transformer for Asagi.

## Installation

```bash
npm install @asagijs/superjson-transformer
```

## Usage

### Server

Register the transformer in the server options.

```ts
import { createApp, createServer } from "asagi";
import { superjsonTransformer } from "@asagijs/superjson-transformer";

const app = createApp();

const appRouter = createRouter([
  app.get("/now").handle(async (c) => {
    return c.json({ now: new Date() });
  }),
]);

export default createServer(app, {
  transformers: [superjsonTransformer],
});
```

### Client

Pass the transformer to the client factory.

```ts
import { createClient } from "asagi";
import { superjsonTransformer } from "@asagijs/superjson-transformer";
import type { AppRouter } from "./server";

const api = createClient<AppRouter, typeof superjsonTransformer>({
  baseUrl: "http://localhost:3000",
  transformer: superjsonTransformer,
});
```

Now you can send and receive rich types like `Date`, `Map`, and `Set`.

```ts
const { data } = await api.now.$get();
console.log(data.now); // Date object
```
