import { getItems, writeItem, dataURItoBlob } from './utils.js';

declare global {
  interface Window {
    SyncManager?: unknown;
  }
}

function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>('#confirmation-toast')!;
  const msg = document.querySelector<HTMLSpanElement>('#toast-message')!;
  msg.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3000);
}

const shareImageButton = document.querySelector('#share-image-button') as HTMLButtonElement;
const createPostArea = document.querySelector('#create-post') as HTMLDivElement;
const closeCreatePostModalButton = document.querySelector(
  '#close-create-post-modal-btn'
) as HTMLButtonElement;
const sharedMomentsArea = document.querySelector('#shared-moments') as HTMLDivElement;
const form = document.querySelector('form') as HTMLFormElement;
const titleInput = document.querySelector('#title') as HTMLInputElement;
const locationInput = document.querySelector('#location') as HTMLInputElement;
const videoPlayer = document.querySelector('#player') as HTMLVideoElement;
const canvasElement = document.querySelector('#canvas') as HTMLCanvasElement;
const captureButton = document.querySelector('#capture-btn') as HTMLButtonElement;
const imagePicker = document.querySelector('#image-picker') as HTMLInputElement;
const imagePickerArea = document.querySelector('#pick-image') as HTMLDivElement;
let picture: Blob | undefined;

const locationButton = document.querySelector('#location-btn') as HTMLButtonElement;
const locationLoader = document.querySelector('#location-loader') as HTMLDivElement;
let fetchedLocation = { lat: 0, lng: 0 };

locationButton.addEventListener('click', () => {
  if (!('geolocation' in navigator)) return;

  locationButton.style.display = 'none';
  locationLoader.style.display = 'block';

  navigator.geolocation.getCurrentPosition(
    async pos => {
      fetchedLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${fetchedLocation.lat}&lon=${fetchedLocation.lng}`,
          { headers: { 'Accept-Language': navigator.language || 'en' } }
        );
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          const place = addr.city || addr.town || addr.village || addr.suburb || addr.county || '';
          const region = addr.state || addr.country || '';
          locationInput.value = [place, region].filter(Boolean).join(', ');
        }
      } catch {
        // geocoding failed — leave input empty so user can type manually
      }
      locationButton.style.display = 'inline';
      locationLoader.style.display = 'none';
      (document.querySelector('#manual-location') as HTMLElement).classList.add('is-focused');
    },
    () => {
      locationButton.style.display = 'inline';
      locationLoader.style.display = 'none';
      alert('Failed to fetch location. Please enter manually!');
      fetchedLocation = { lat: 0, lng: 0 };
    },
    { timeout: 10000 }
  );
});

function initializeLocation() {
  if (!('geolocation' in navigator)) {
    locationButton.style.display = 'none';
  }
}

/**
 * polyfill for navigator.mediaDevices.getUserMedia
 */
async function initializeMedia() {
  if (!('mediaDevices' in navigator)) {
    (navigator as unknown as { mediaDevices: MediaDevices }).mediaDevices = {} as MediaDevices;
  }

  if (!('getUserMedia' in navigator.mediaDevices)) {
    (navigator.mediaDevices as any).getUserMedia = (constraints: MediaStreamConstraints) => {
      const getUserMedia =
        (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;

      if (!getUserMedia) {
        return Promise.reject(new Error('getUserMedia is not implemented'));
      }

      return new Promise<MediaStream>((resolve, reject) =>
        getUserMedia.call(navigator, constraints, resolve, reject)
      );
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoPlayer.srcObject = stream;
    videoPlayer.style.display = 'block';
  } catch {
    imagePickerArea.style.display = 'block';
  }
}

captureButton.addEventListener('click', () => {
  canvasElement.style.display = 'block';
  videoPlayer.style.display = 'none';
  captureButton.style.display = 'none';
  const context = canvasElement.getContext('2d')!;
  context.drawImage(
    videoPlayer,
    0,
    0,
    canvasElement.width,
    videoPlayer.videoHeight / (videoPlayer.videoWidth / canvasElement.width)
  );
  (videoPlayer.srcObject as MediaStream).getVideoTracks().forEach(track => track.stop());
  picture = dataURItoBlob(canvasElement.toDataURL());
});

imagePicker.addEventListener('change', async event => {
  const file = (event.target as HTMLInputElement).files![0];
  if (!file) return;
  // CSS background-image ignores EXIF orientation, so bake the rotation into
  // the pixels now by drawing through a canvas with imageOrientation applied.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const offscreen = document.createElement('canvas');
    offscreen.width = bitmap.width;
    offscreen.height = bitmap.height;
    offscreen.getContext('2d')!.drawImage(bitmap, 0, 0);
    offscreen.toBlob(blob => { picture = blob ?? undefined; }, file.type || 'image/jpeg', 0.92);
  } catch {
    picture = file;
  }
});

async function openCreatePostModal() {
  setTimeout(() => {
    createPostArea.style.transform = 'translateY(0)';
  }, 1);
  initializeMedia();
  initializeLocation();
  if (window.deferredPrompt) {
    window.deferredPrompt.prompt();
    await window.deferredPrompt.userChoice;
    window.deferredPrompt = null;
  }
}
shareImageButton.addEventListener('click', openCreatePostModal);

function closeCreatePostModal() {
  imagePickerArea.style.display = 'none';
  videoPlayer.style.display = 'none';
  canvasElement.style.display = 'none';
  captureButton.style.display = 'inline';
  locationButton.style.display = 'inline';
  locationLoader.style.display = 'none';
  if (videoPlayer.srcObject) {
    (videoPlayer.srcObject as MediaStream).getVideoTracks().forEach(track => track.stop());
  }
  setTimeout(() => {
    createPostArea.style.transform = 'translateY(100vh)';
  }, 1);
}
closeCreatePostModalButton.addEventListener('click', closeCreatePostModal);

function clearCards() {
  while (sharedMomentsArea.hasChildNodes()) {
    sharedMomentsArea.removeChild(sharedMomentsArea.lastChild!);
  }
}

interface PostCard {
  image: string;
  title: string;
  location: string;
}

function createCard(card: PostCard): void {
  const cardWrapper = document.createElement('div');
  cardWrapper.className = 'shared-moment-card bg-white rounded-lg shadow-md overflow-hidden';

  const cardTitle = document.createElement('div');
  cardTitle.className = 'card-image-area bg-cover bg-center bg-no-repeat bg-black flex items-end';
  cardTitle.style.backgroundImage = `url(${card.image})`;

  const cardTitleText = document.createElement('h2');
  cardTitleText.className = 'p-3 text-white text-base font-medium drop-shadow';
  cardTitleText.textContent = card.title;
  cardTitle.appendChild(cardTitleText);

  const cardText = document.createElement('div');
  cardText.className = 'p-3 text-gray-600 text-center text-sm';
  cardText.textContent = card.location;

  cardWrapper.appendChild(cardTitle);
  cardWrapper.appendChild(cardText);
  sharedMomentsArea!.appendChild(cardWrapper);
}

function createCards(cards: PostCard[]) {
  cards.forEach(card => createCard(card));
}

// Cache-then-network: start both fetches in parallel; IDB renders first if
// the network hasn't responded yet, then network overwrites with fresher data.
function loadDataAndUpdate() {
  const url = 'https://pwagram-439bb.firebaseio.com/posts.json';
  let networkDataReceived = false;

  fetch(url)
    .then(res => (res.ok ? res.json() : null))
    .then((data: Record<string, PostCard> | null) => {
      if (!data) return;
      networkDataReceived = true;
      clearCards();
      createCards(Object.values(data));
    })
    .catch(() => {});

  if ('indexedDB' in window) {
    getItems('posts').then(posts => {
      if (!networkDataReceived) {
        clearCards();
        createCards(posts as PostCard[]);
      }
    });
  }
}

loadDataAndUpdate();

async function submitPost() {
  const id = new Date().toISOString();
  const postData = new FormData();
  postData.append('id', id);
  postData.append('title', titleInput.value);
  postData.append('location', locationInput.value);
  postData.append('file', picture!, id + '.png');
  postData.append('rawLocationLat', String(fetchedLocation.lat));
  postData.append('rawLocationLng', String(fetchedLocation.lng));

  try {
    await fetch(
      'https://us-central1-pwagram-439bb.cloudfunctions.net/storePostData',
      { method: 'POST', body: postData }
    );
    clearPostForm();
    loadDataAndUpdate();
  } catch {
    // network unavailable — post will sync on reconnect via Background Sync
  }
}

async function submitPostViaSyncManager() {
  const sw = await navigator.serviceWorker.ready;
  const post = {
    id: new Date().toISOString(),
    title: titleInput.value,
    location: locationInput.value,
    picture,
    rawLocation: fetchedLocation
  };
  try {
    await writeItem('sync-posts', post);
    await (sw as any).sync.register('sync-new-posts');
    showToast('Your Post was saved for syncing!');
  } catch {
    // sync registration failed — post remains in IDB and will retry
  }
}

function clearPostForm() {
  titleInput.value = '';
  locationInput.value = '';
}

form.addEventListener('submit', async evt => {
  evt.preventDefault();
  if (titleInput.value.trim() === '' || locationInput.value.trim() === '') {
    alert('Please enter valid data!');
    return;
  }
  closeCreatePostModal();

  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    await submitPostViaSyncManager();
    clearPostForm();
  } else {
    submitPost();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    (event as MessageEvent).ports[0].postMessage('ACK');
    if ((event as MessageEvent).data === 'refresh') {
      loadDataAndUpdate();
    }
  });
}
