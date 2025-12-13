import { createClient } from '../src';
import type { AppRouter } from './index';

const api = createClient<AppRouter>('http://localhost:3000');

async function fetchStatus() {
  const res = await api.status.$get();
  const body = await res.json(); // { status: string }
  console.log('status:', body.status);
}

async function fetchItem(id: string) {
  const res = await api.items[':id'].$get({
    params: { id },
  });
  if (res.ok) {
    const body = await res.json(); // { item: Item }
    console.log('item:', body.item);
  }
}

async function createItem(name: string) {
  const res = await api.items.$post({
    json: { name },
  });
  if (res.ok) {
    const body = await res.json(); // { success: boolean }
    console.log('create item success:', body.success);
  }
}

await fetchStatus();
await fetchItem('item123');
await createItem('New Item');
