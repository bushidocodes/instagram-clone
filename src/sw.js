import { precacheAndRoute, matchPrecache } from 'workbox-precaching';
import { registerRoute, setCatchHandler } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { openDB } from 'idb';

// Injected by vite-plugin-pwa at build time ([] in dev)
precacheAndRoute(self.__WB_MANIFEST);

// ─── Caching strategies ───────────────────────────────────────────────────────

// Google Fonts — cache first, 1-year TTL
registerRoute(
  ({ url }) =>
    url.origin === 'https://fonts.googleapis.com' ||
    url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 })
    ]
  })
);

// CDN assets (Material Design Lite) — cache first, 1-year TTL
registerRoute(
  ({ url }) => url.origin === 'https://cdnjs.cloudflare.com',
  new CacheFirst({
    cacheName: 'cdn-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 365 * 24 * 60 * 60 })
    ]
  })
);

// Firebase posts — network first; on success, sync result into IDB so the
// browser-side cache-then-network pattern in feed.js sees fresh data.
const POSTS_URL = 'https://pwagram-439bb.firebaseio.com/posts.json';

registerRoute(
  ({ url }) => url.href === POSTS_URL,
  async ({ event }) => {
    try {
      const res = await fetch(event.request);
      if (res.ok) {
        const data = await res.clone().json();
        const db = await dbPromise;
        const tx = db.transaction('posts', 'readwrite');
        await tx.store.clear();
        for (const item of Object.values(data)) tx.store.put(item);
        await tx.done;
      }
      return res;
    } catch {
      return Response.error();
    }
  }
);

// Offline fallbacks
setCatchHandler(async ({ event }) => {
  if (event.request.destination === 'document') {
    return (await matchPrecache('/fallback.html')) ?? Response.error();
  }
  if (event.request.destination === 'image') {
    return (await matchPrecache('/src/images/failwhale.jpg')) ?? Response.error();
  }
  return Response.error();
});

// ─── IndexedDB (replaces the legacy idb.js importScripts path) ───────────────

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

// ─── Background Sync ─────────────────────────────────────────────────────────

const UPLOAD_POSTS_URL =
  'https://us-central1-pwagram-439bb.cloudfunctions.net/storePostData';

async function syncNewPosts() {
  const db = await dbPromise;
  const posts = await db.getAll('sync-posts');
  await Promise.all(
    posts.map(async post => {
      const postData = new FormData();
      postData.append('id', post.id);
      postData.append('title', post.title);
      postData.append('location', post.location);
      postData.append('rawLocationLat', post.rawLocation.lat);
      postData.append('rawLocationLng', post.rawLocation.lng);
      postData.append('file', post.picture, `${post.id}.png`);
      const res = await fetch(UPLOAD_POSTS_URL, { method: 'POST', body: postData });
      if (!res.ok) throw new Error(res.statusText);
      await db.delete('sync-posts', post.id);
    })
  );
  // Notify all open clients to refresh the feed
  const allClients = await clients.matchAll();
  for (const client of allClients) {
    const chan = new MessageChannel();
    client.postMessage('refresh', [chan.port2]);
  }
}

self.addEventListener('sync', event => {
  if (event.tag === 'sync-new-posts') {
    event.waitUntil(syncNewPosts());
  }
});

// ─── Push notifications ───────────────────────────────────────────────────────

self.addEventListener('push', event => {
  event.preventDefault();
  const {
    title = 'New!',
    content = 'Something new happened!',
    openUrl = '/'
  } = JSON.parse(event.data.text());
  event.waitUntil(
    self.registration.showNotification(title, {
      body: content,
      icon: '/src/images/icons/app-icon-96x96.png',
      badge: '/src/images/icons/app-icon-96x96.png',
      data: { openUrl }
    })
  );
});

self.addEventListener('notificationclick', event => {
  const { notification } = event;
  event.waitUntil(
    clients.matchAll().then(clientsArr => {
      const client = clientsArr.find(c => c.visibilityState === 'visible');
      if (client) {
        client.navigate(notification.data.openUrl);
        client.focus();
      } else {
        clients.openWindow(notification.data.openUrl);
      }
    })
  );
  notification.close();
});

self.addEventListener('notificationclose', () => {});

// ─── Lifecycle ────────────────────────────────────────────────────────────────

// Allow the page to trigger skipWaiting when a new SW is available.
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  // Legacy ACK for feed.js message handler
  if (event.ports?.[0]) event.ports[0].postMessage('ACK');
});
