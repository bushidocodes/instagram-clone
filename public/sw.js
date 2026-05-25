importScripts("/src/js/idb.js");
importScripts("/src/js/utils.js");

const SW_VERSION = 78;

const STATIC_CACHE_NAME = `static-v${SW_VERSION}`;
const STATIC_FILES = [
  "/",
  "/help/",
  "/index.html",
  "/fallback.html",
  "/src/css/app.css",
  "/src/css/feed.css",
  "/src/css/help.css",
  "/src/images/main-image.jpg",
  "/src/images/failwhale.jpg",
  "/manifest.json",
  "/src/js/idb.js",
  "/src/js/app.js",
  "/src/js/feed.js",
  "/src/js/utils.js",
  "/src/js/material.min.js",
  "https://fonts.googleapis.com/css?family=Roboto:400,700",
  "https://fonts.googleapis.com/icon?family=Material+Icons",
  "https://cdnjs.cloudflare.com/ajax/libs/material-design-lite/1.3.0/material.indigo-pink.min.css"
];

const POSTS_URL = "https://pwagram-439bb.firebaseio.com/posts.json";
const UPLOAD_POSTS_URL =
  "https://us-central1-pwagram-439bb.cloudfunctions.net/storePostData";

const CACHE_BLACKLIST = [
  "https://us-central1-pwagram-439bb.cloudfunctions.net/storePostData"
];

const DYNAMIC_CACHE_NAME = `dynamic-v${SW_VERSION}`;

function trimCache(cacheName, maxItems) {
  caches.open(cacheName).then(cache => {
    cache.keys().then(keys => {
      if (keys.length > maxItems) {
        cache.delete(keys[0]).then(trimCache(cacheName, maxItems));
      }
    });
  });
}

function cacheAppShell() {
  return caches.open(STATIC_CACHE_NAME).then(cache => {
    cache.addAll(STATIC_FILES);
  });
}

function deleteOldCaches() {
  return caches.keys().then(keys =>
    Promise.all(
      keys.map(key => {
        if (!key.includes(`-v${SW_VERSION}`)) {
          return caches.delete(key);
        }
        return Promise.resolve();
      })
    )
  );
}

function isInArray(string, array) {
  const cachePath =
    string.indexOf(self.origin) === 0
      ? string.substring(self.origin.length)
      : string;
  return array.indexOf(cachePath) > -1;
}

function sendMessageToClient(client, msg) {
  return new Promise((resolve, reject) => {
    const msgChan = new MessageChannel();
    msgChan.port1.onmessage = event => {
      if (event.data.error) {
        reject(event.data.error);
      } else {
        resolve(event.data);
      }
    };
    client.postMessage(msg, [msgChan.port2]);
  });
}

function sendMessageToAllClients(msg) {
  return clients.matchAll().then(allClients => {
    allClients.forEach(client => sendMessageToClient(client, msg).catch(() => {}));
  });
}

function fetchAndCachePosts(event) {
  return fetch(event.request)
    .then(res => {
      const cloneRes = res.clone();
      if (cloneRes.ok) {
        deleteItems("posts")
          .then(() => cloneRes.json())
          .then(resAsJSON =>
            Object.values(resAsJSON).forEach(item => writeItem("posts", item))
          );
      }
      return res;
    })
    .catch(err => Promise.reject(err));
}

// Cache-first for static shell; network-first with dynamic cache fallback for
// everything else. Serves fallback HTML/image when fully offline.
function fetchFromDynamicCacheAndFallbackToNetwork(event) {
  return caches.match(event.request).then(cacheResponse => {
    if (!cacheResponse) {
      return fetch(event.request)
        .then(fetchResponse => {
          // opaque responses (cross-origin images without CORS) can still be
          // cached and returned to <img> tags even though we can't inspect them
          if (fetchResponse.ok || fetchResponse.type === "opaque") {
            return caches.open(DYNAMIC_CACHE_NAME).then(cache => {
              cache.put(event.request.url, fetchResponse.clone());
              return fetchResponse;
            });
          }
        })
        .catch(() => {
          return caches.open(STATIC_CACHE_NAME).then(cache => {
            if (event.request.headers.get("accept").includes("text/html")) {
              return cache.match("/fallback.html");
            }
            if (event.request.headers.get("accept").includes("image/")) {
              return cache.match("/src/images/failwhale.jpg");
            }
          });
        });
    }
    return cacheResponse;
  });
}

async function syncNewPosts() {
  const posts = await getItems("sync-posts");
  const uploads = posts.map(async post => {
    const postData = new FormData();
    postData.append("id", post.id);
    postData.append("title", post.title);
    postData.append("location", post.location);
    postData.append("rawLocationLat", post.rawLocation.lat);
    postData.append("rawLocationLng", post.rawLocation.lng);
    postData.append("file", post.picture, `${post.id}.png`);

    const res = await fetch(UPLOAD_POSTS_URL, { method: "POST", body: postData });
    if (!res.ok) throw new Error(res.statusText);
    const resData = await res.json();
    return deleteItem("sync-posts", resData.id);
  });

  await Promise.all(uploads);
  sendMessageToAllClients("refresh");
}

self.addEventListener("install", event => {
  event.waitUntil(cacheAppShell());
});

self.addEventListener("activate", event => {
  event.waitUntil(deleteOldCaches());
  return self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.url === POSTS_URL) {
    event.respondWith(fetchAndCachePosts(event));
  } else if (isInArray(event.request.url, STATIC_FILES)) {
    event.respondWith(caches.match(event.request));
  } else {
    event.respondWith(fetchFromDynamicCacheAndFallbackToNetwork(event));
  }
});

self.addEventListener("sync", event => {
  if (event.tag === "sync-new-posts") {
    event.waitUntil(syncNewPosts());
  }
});

self.addEventListener("notificationclick", event => {
  const { notification } = event;
  event.waitUntil(
    clients.matchAll().then(clientsArr => {
      const client = clientsArr.find(c => c.visibilityState === "visible");
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

self.addEventListener("notificationclose", () => {});

self.addEventListener("push", event => {
  event.preventDefault();
  const {
    title = "New!",
    content = "Something new happened!",
    openUrl = "/"
  } = JSON.parse(event.data.text());
  const options = {
    body: content,
    icon: "/src/images/icons/app-icon-96x96.png",
    badge: "/src/images/icons/app-icon-96x96.png",
    data: { openUrl }
  };
  return event.waitUntil(self.registration.showNotification(title, options));
});
