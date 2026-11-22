import { POSTS_URL, STORE_POST_DATA_URL } from "./config.js";
import { dataURItoBlob, getItems, writeItem } from "./utils.js";

declare global {
  interface Window {
    SyncManager?: unknown;
  }
}

export function showToast(message: string): void {
  const toast = document.querySelector<HTMLDivElement>("#confirmation-toast")!;
  const msg = document.querySelector<HTMLSpanElement>("#toast-message")!;
  msg.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 3000);
}

const shareImageButton = document.querySelector("#share-image-button") as HTMLButtonElement;
const createPostArea = document.querySelector("#create-post") as HTMLDivElement;
const closeCreatePostModalButton = document.querySelector(
  "#close-create-post-modal-btn",
) as HTMLButtonElement;
const sharedMomentsArea = document.querySelector("#shared-moments") as HTMLDivElement;
const form = document.querySelector("form") as HTMLFormElement;
const titleInput = document.querySelector("#title") as HTMLInputElement;
const locationInput = document.querySelector("#location") as HTMLInputElement;
const videoPlayer = document.querySelector("#player") as HTMLVideoElement;
const canvasElement = document.querySelector("#canvas") as HTMLCanvasElement;
const captureButton = document.querySelector("#capture-btn") as HTMLButtonElement;
const imagePicker = document.querySelector("#image-picker") as HTMLInputElement;
const imagePickerArea = document.querySelector("#pick-image") as HTMLDivElement;
let picture: Blob | undefined;

const locationButton = document.querySelector("#location-btn") as HTMLButtonElement;
const locationLoader = document.querySelector("#location-loader") as HTMLDivElement;
let fetchedLocation = { lat: 0, lng: 0 };

locationButton.addEventListener("click", () => {
  if (!("geolocation" in navigator)) return;

  locationButton.style.display = "none";
  locationLoader.style.display = "block";

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      fetchedLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      };
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${fetchedLocation.lat}&lon=${fetchedLocation.lng}`,
          { headers: { "Accept-Language": navigator.language || "en" } },
        );
        if (res.ok) {
          const data = await res.json();
          const addr = data.address || {};
          const place = addr.city || addr.town || addr.village || addr.suburb || addr.county || "";
          const region = addr.state || addr.country || "";
          locationInput.value = [place, region].filter(Boolean).join(", ");
        }
      } catch {
        // geocoding failed — leave input empty so user can type manually
      }
      locationButton.style.display = "inline";
      locationLoader.style.display = "none";
      (document.querySelector("#manual-location") as HTMLElement).classList.add("is-focused");
    },
    () => {
      locationButton.style.display = "inline";
      locationLoader.style.display = "none";
      alert("Failed to fetch location. Please enter manually!");
      fetchedLocation = { lat: 0, lng: 0 };
    },
    { timeout: 10000 },
  );
});

function initializeLocation() {
  if (!("geolocation" in navigator)) {
    locationButton.style.display = "none";
  }
}

/**
 * polyfill for navigator.mediaDevices.getUserMedia
 */
async function initializeMedia() {
  if (!("mediaDevices" in navigator)) {
    (navigator as unknown as { mediaDevices: MediaDevices }).mediaDevices = {} as MediaDevices;
  }

  if (!("getUserMedia" in navigator.mediaDevices)) {
    (navigator.mediaDevices as any).getUserMedia = (constraints: MediaStreamConstraints) => {
      const getUserMedia =
        (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia;

      if (!getUserMedia) {
        return Promise.reject(new Error("getUserMedia is not implemented"));
      }

      return new Promise<MediaStream>((resolve, reject) =>
        getUserMedia.call(navigator, constraints, resolve, reject),
      );
    };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    videoPlayer.srcObject = stream;
    videoPlayer.style.display = "block";
  } catch {
    imagePickerArea.style.display = "block";
  }
}

captureButton.addEventListener("click", () => {
  canvasElement.style.display = "block";
  videoPlayer.style.display = "none";
  captureButton.style.display = "none";
  const context = canvasElement.getContext("2d")!;
  context.drawImage(
    videoPlayer,
    0,
    0,
    canvasElement.width,
    videoPlayer.videoHeight / (videoPlayer.videoWidth / canvasElement.width),
  );
  (videoPlayer.srcObject as MediaStream).getVideoTracks().forEach((track) => track.stop());
  picture = dataURItoBlob(canvasElement.toDataURL());
});

imagePicker.addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files![0];
  if (!file) return;
  // CSS background-image ignores EXIF orientation, so bake the rotation into
  // the pixels now by drawing through a canvas with imageOrientation applied.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const offscreen = document.createElement("canvas");
    offscreen.width = bitmap.width;
    offscreen.height = bitmap.height;
    offscreen.getContext("2d")!.drawImage(bitmap, 0, 0);
    offscreen.toBlob(
      (blob) => {
        picture = blob ?? undefined;
      },
      file.type || "image/jpeg",
      0.92,
    );
  } catch {
    picture = file;
  }
});

let closeHideTimer: number | undefined;

export function openCreatePostModal() {
  if (closeHideTimer !== undefined) {
    window.clearTimeout(closeHideTimer);
    closeHideTimer = undefined;
  }
  createPostArea.style.display = "block";
  // Wait a frame so the display change is applied before the slide-up starts.
  setTimeout(() => {
    createPostArea.style.transform = "translateY(0)";
  }, 1);
  initializeMedia();
  initializeLocation();
  if (window.deferredPrompt) {
    void window.deferredPrompt.prompt();
    void window.deferredPrompt.userChoice.then(() => {
      window.deferredPrompt = null;
    });
  }
}
shareImageButton.addEventListener("click", openCreatePostModal);

function hideCreatePostArea() {
  createPostArea.style.display = "none";
  closeHideTimer = undefined;
}

export function closeCreatePostModal() {
  imagePickerArea.style.display = "none";
  videoPlayer.style.display = "none";
  canvasElement.style.display = "none";
  captureButton.style.display = "inline";
  locationButton.style.display = "inline";
  locationLoader.style.display = "none";
  if (videoPlayer.srcObject) {
    (videoPlayer.srcObject as MediaStream).getVideoTracks().forEach((track) => track.stop());
  }
  createPostArea.style.transform = "translateY(100vh)";
  const onEnd = (event: TransitionEvent) => {
    if (event.target !== createPostArea || event.propertyName !== "transform") return;
    createPostArea.removeEventListener("transitionend", onEnd);
    hideCreatePostArea();
  };
  createPostArea.addEventListener("transitionend", onEnd);
  // Fallback for environments (and reduced-motion) that never fire transitionend.
  if (closeHideTimer !== undefined) window.clearTimeout(closeHideTimer);
  closeHideTimer = window.setTimeout(() => {
    createPostArea.removeEventListener("transitionend", onEnd);
    hideCreatePostArea();
  }, 350);
}
closeCreatePostModalButton.addEventListener("click", closeCreatePostModal);

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
  const cardWrapper = document.createElement("div");
  cardWrapper.className = "shared-moment-card bg-white rounded-lg shadow-md overflow-hidden";

  const cardTitle = document.createElement("div");
  cardTitle.className = "card-image-area bg-cover bg-center bg-no-repeat bg-black flex items-end";
  cardTitle.style.backgroundImage = `url(${card.image})`;

  const cardTitleText = document.createElement("h2");
  cardTitleText.className = "p-3 text-white text-base font-medium drop-shadow";
  cardTitleText.textContent = card.title;
  cardTitle.appendChild(cardTitleText);

  const cardText = document.createElement("div");
  cardText.className = "p-3 text-gray-600 text-center text-sm";
  cardText.textContent = card.location;

  cardWrapper.appendChild(cardTitle);
  cardWrapper.appendChild(cardText);
  sharedMomentsArea!.appendChild(cardWrapper);
}

function createCards(cards: PostCard[]) {
  cards.forEach((card) => createCard(card));
}

// Sample moments bundled with the app. Used only when the live Firebase feed
// cannot be reached *and* there is nothing in IDB — we do not provision a
// cloud project just to populate the demo.
export const FALLBACK_POSTS: PostCard[] = [
  {
    image: "/src/images/sf-boat.jpg",
    title: "Sailboats at the pier",
    location: "San Francisco, CA",
  },
  {
    image: "/src/images/main-image.jpg",
    title: "A walk downtown",
    location: "San Francisco, CA",
  },
];

function setFeedStatus(message: string | null, kind: "empty" | "error" | null = null): void {
  const el = document.getElementById("feed-status");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.removeAttribute("data-kind");
    return;
  }
  el.hidden = false;
  el.textContent = message;
  if (kind) el.dataset.kind = kind;
  else el.removeAttribute("data-kind");
}

async function readCachedPosts(): Promise<PostCard[]> {
  if (!("indexedDB" in window)) return [];
  try {
    return (await getItems("posts")) as PostCard[];
  } catch {
    return [];
  }
}

// Prefer the live feed, then IDB, then a small local sample so a 404/offline
// demo still shows something rather than a blank page.
export async function loadDataAndUpdate(): Promise<void> {
  const cachedPromise = readCachedPosts();

  let network: { ok: true; posts: PostCard[] } | { ok: false };
  try {
    const res = await fetch(POSTS_URL);
    if (!res.ok) {
      network = { ok: false };
    } else {
      const data = (await res.json()) as Record<string, PostCard> | null;
      network = { ok: true, posts: data ? Object.values(data) : [] };
    }
  } catch {
    network = { ok: false };
  }

  const cached = await cachedPromise;

  if (network.ok) {
    clearCards();
    if (network.posts.length) {
      setFeedStatus(null);
      createCards(network.posts);
    } else {
      setFeedStatus("No moments yet — tap + to share one.", "empty");
    }
    return;
  }

  if (cached.length) {
    clearCards();
    setFeedStatus(null);
    createCards(cached);
    return;
  }

  clearCards();
  setFeedStatus("Live feed is unavailable right now. Showing sample moments.", "error");
  createCards(FALLBACK_POSTS);
}

void loadDataAndUpdate();

async function submitPost() {
  const id = new Date().toISOString();
  const postData = new FormData();
  postData.append("id", id);
  postData.append("title", titleInput.value);
  postData.append("location", locationInput.value);
  postData.append("file", picture!, id + ".png");
  postData.append("rawLocationLat", String(fetchedLocation.lat));
  postData.append("rawLocationLng", String(fetchedLocation.lng));

  try {
    await fetch(STORE_POST_DATA_URL, { method: "POST", body: postData });
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
    rawLocation: fetchedLocation,
  };
  try {
    await writeItem("sync-posts", post);
    await (sw as any).sync.register("sync-new-posts");
    showToast("Your Post was saved for syncing!");
  } catch {
    // sync registration failed — post remains in IDB and will retry
  }
}

export function clearPostForm() {
  titleInput.value = "";
  locationInput.value = "";
  picture = undefined;
  imagePicker.value = "";
}

form.addEventListener("submit", async (evt) => {
  evt.preventDefault();
  if (titleInput.value.trim() === "" || locationInput.value.trim() === "") {
    alert("Please enter valid data!");
    return;
  }
  if (!picture) {
    alert("Please capture or pick an image!");
    return;
  }
  closeCreatePostModal();

  const swReg =
    "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;

  if (swReg?.active && "SyncManager" in window) {
    await submitPostViaSyncManager();
  } else {
    await submitPost();
  }
  clearPostForm();
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const msg = event as MessageEvent;
    if (msg.ports?.[0]) msg.ports[0].postMessage("ACK");
    if (msg.data === "refresh") {
      loadDataAndUpdate();
    }
  });
}
