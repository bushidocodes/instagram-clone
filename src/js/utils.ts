import { openDB } from 'idb';

const dbPromise = openDB('posts-store', 1, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('posts')) {
      db.createObjectStore('posts', { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains('sync-posts')) {
      db.createObjectStore('sync-posts', { keyPath: 'id' });
    }
  }
});

export async function writeItem(storeName: string, item: unknown): Promise<IDBValidKey> {
  return (await dbPromise).put(storeName, item);
}

export async function getItems(storeName: string): Promise<unknown[]> {
  return (await dbPromise).getAll(storeName);
}

export async function getItem(storeName: string, id: IDBKeyRange | IDBValidKey): Promise<unknown> {
  return (await dbPromise).get(storeName, id);
}

export async function deleteItems(storeName: string): Promise<void> {
  return (await dbPromise).clear(storeName);
}

export async function deleteItem(storeName: string, id: IDBKeyRange | IDBValidKey): Promise<void> {
  return (await dbPromise).delete(storeName, id);
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function dataURItoBlob(dataURI: string): Blob {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
}
