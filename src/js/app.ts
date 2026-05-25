import { urlBase64ToUint8Array } from './utils.js';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

declare global {
  interface Window {
    deferredPrompt: BeforeInstallPromptEvent | null;
  }
}

window.deferredPrompt = null;
const enableNotificationsButtons = document.querySelectorAll(
  '.enable-notifications'
);

async function displayConfirmNotification() {
  const title = 'Successfully subscribed';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const options: any = {
    body: 'Awesome!',
    icon: '/src/images/icons/app-icon-96x96.png',
    image: '/src/images/sf-boat.jpg',
    dir: 'ltr',
    lang: 'en-US',
    vibrate: [100, 50, 200],
    badge: '/src/images/icons/app-icon-96x96.png',
    tag: 'confirm-notification',
    renotify: true,
    actions: [
      {
        action: 'confirm',
        title: 'Okay',
        icon: '/src/images/icons/app-icon-96x96.png'
      },
      {
        action: 'cancel',
        title: 'Cancel',
        icon: '/src/images/icons/app-icon-96x96.png'
      }
    ]
  };
  if ('serviceWorker' in navigator) {
    const sw = await navigator.serviceWorker.ready;
    sw.showNotification(title, options);
  } else {
    new Notification(title, options);
  }
}

async function configurePushSub() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const sw = await navigator.serviceWorker.ready;
    const existingSub = await sw.pushManager.getSubscription();
    if (existingSub !== null) return;

    const VAPID_PUBLIC_KEY =
      'BH1lo34DNnIy__lc7nzIMyDr2tBmGqqoRThEoRzoj2GehQ8Yg4_X2JvkHfX06Vbqxjys6I0fz2mGLu2nkC45S5o';
    const newSub = await sw.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer
    });
    const res = await fetch(
      'https://pwagram-439bb.firebaseio.com/subscriptions.json',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(newSub)
      }
    );
    if (res.ok) displayConfirmNotification();
  } catch {
    // push subscription failed or permission was denied
  }
}

async function askForNotificationPermission() {
  const permission = await Notification.requestPermission();
  if (permission === 'granted') {
    enableNotificationsButtons.forEach(btn => {
      (btn as HTMLElement).style.display = 'inline-block';
    });
    configurePushSub();
  }
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    window.deferredPrompt = event as BeforeInstallPromptEvent;
    return false;
  });

  if ('SyncManager' in window) {
    navigator.serviceWorker.ready
      .then(sw => (sw as unknown as { sync: { register(tag: string): Promise<void> } }).sync.register('sync-new-posts'))
      .catch(() => {});
  }

  if ('Notification' in window && Notification.permission === 'default') {
    enableNotificationsButtons.forEach(btn => {
      (btn as HTMLElement).style.display = 'inline-block';
      btn.addEventListener('click', askForNotificationPermission);
    });
  }
}
