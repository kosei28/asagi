import { createCaller } from 'asagi';
import { appRouter } from './index';

const api = createCaller(appRouter, {
  var: {
    user: { id: 'user123', name: 'Alice' },
  },
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
