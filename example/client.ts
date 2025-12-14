import { createClient } from 'asagi';
import type { AppRouter } from './index';
import { superjsonTransformer } from './transformer';

const api = createClient<AppRouter, typeof superjsonTransformer>({
  baseUrl: 'http://localhost:3000',
  transformer: superjsonTransformer,
});

async function fetchStatus() {
  const { data } = await api.now.$get();
  console.log('now:', data.now);
}

async function fetchItem(id: string) {
  const { data, error } = await api.items[':id'].$get({
    params: { id },
  });
  if (!error) {
    console.log('item:', data.item);
  }
}

async function createItem(name: string) {
  const { data, error } = await api.items.$post({
    json: { name },
  });
  if (!error) {
    console.log('create item success:', data.success);
  }
}

await fetchStatus();
await fetchItem('item123');
await createItem('New Item');
