// Centralized frontend configuration, resolved from Vite environment variables
// (VITE_*) at build time. None of these values are secrets — the VAPID public
// key and Firebase coordinates are all client-visible by design. Each falls
// back to the original `pwagram-439bb` project so the app stays runnable
// without a `.env` file; set the variables (see `.env.example`) to point a fork
// at your own Firebase backend.

const env = import.meta.env;

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, '');

// Use `||` (not `??`) so a blank value in `.env` falls back to the default
// rather than producing an empty key / broken URL.
export const VAPID_PUBLIC_KEY =
  env.VITE_VAPID_PUBLIC_KEY ||
  'BH1lo34DNnIy__lc7nzIMyDr2tBmGqqoRThEoRzoj2GehQ8Yg4_X2JvkHfX06Vbqxjys6I0fz2mGLu2nkC45S5o';

// Realtime Database base URL, e.g. https://your-project.firebaseio.com
export const FIREBASE_DATABASE_URL = stripTrailingSlash(
  env.VITE_FIREBASE_DATABASE_URL || 'https://pwagram-439bb.firebaseio.com'
);

// Cloud Functions base URL, e.g. https://us-central1-your-project.cloudfunctions.net
export const FIREBASE_FUNCTIONS_URL = stripTrailingSlash(
  env.VITE_FIREBASE_FUNCTIONS_URL ||
    'https://us-central1-pwagram-439bb.cloudfunctions.net'
);

export const POSTS_URL = `${FIREBASE_DATABASE_URL}/posts.json`;
export const SUBSCRIPTIONS_URL = `${FIREBASE_DATABASE_URL}/subscriptions.json`;
export const STORE_POST_DATA_URL = `${FIREBASE_FUNCTIONS_URL}/storePostData`;
