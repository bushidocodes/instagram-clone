const shareImageButton = document.querySelector("#share-image-button");
const createPostArea = document.querySelector("#create-post");
const closeCreatePostModalButton = document.querySelector(
  "#close-create-post-modal-btn"
);
const sharedMomentsArea = document.querySelector("#shared-moments");
const form = document.querySelector("form");
const titleInput = document.querySelector("#title");
const locationInput = document.querySelector("#location");
const videoPlayer = document.querySelector("#player");
const canvasElement = document.querySelector("#canvas");
const captureButton = document.querySelector("#capture-btn");
const imagePicker = document.querySelector("#image-picker");
const imagePickerArea = document.querySelector("#pick-image");
let picture;

const locationButton = document.querySelector("#location-btn");
const locationLoader = document.querySelector("#location-loader");
let fetchedLocation = { lat: 0, lng: 0 };

locationButton.addEventListener("click", () => {
  if (!("geolocation" in navigator)) return;

  locationButton.style.display = "none";
  locationLoader.style.display = "block";

  navigator.geolocation.getCurrentPosition(
    async pos => {
      fetchedLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${fetchedLocation.lat}&lon=${fetchedLocation.lng}`,
          { headers: { "Accept-Language": navigator.language || "en" } }
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
      document.querySelector("#manual-location").classList.add("is-focused");
    },
    () => {
      locationButton.style.display = "inline";
      locationLoader.style.display = "none";
      alert("Failed to fetch location. Please enter manually!");
      fetchedLocation = { lat: 0, lng: 0 };
    },
    { timeout: 10000 }
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
    navigator.mediaDevices = {};
  }

  if (!("getUserMedia" in navigator.mediaDevices)) {
    navigator.mediaDevices.getUserMedia = constraints => {
      const getUserMedia =
        navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

      if (!getUserMedia) {
        return Promise.reject(new Error("getUserMedia is not implemented"));
      }

      return new Promise((resolve, reject) =>
        getUserMedia.call(navigator, constraints, resolve, reject)
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
  const context = canvasElement.getContext("2d");
  context.drawImage(
    videoPlayer,
    0,
    0,
    canvasElement.width,
    videoPlayer.videoHeight / (videoPlayer.videoWidth / canvasElement.width)
  );
  videoPlayer.srcObject.getVideoTracks().forEach(track => track.stop());
  picture = dataURItoBlob(canvasElement.toDataURL());
});

imagePicker.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;
  // CSS background-image ignores EXIF orientation, so bake the rotation into
  // the pixels now by drawing through a canvas with imageOrientation applied.
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const offscreen = document.createElement("canvas");
    offscreen.width = bitmap.width;
    offscreen.height = bitmap.height;
    offscreen.getContext("2d").drawImage(bitmap, 0, 0);
    offscreen.toBlob(blob => { picture = blob; }, file.type || "image/jpeg", 0.92);
  } catch {
    picture = file;
  }
});

async function openCreatePostModal() {
  setTimeout(() => {
    createPostArea.style.transform = "translateY(0)";
  }, 1);
  initializeMedia();
  initializeLocation();
  if (window.deferredPrompt) {
    window.deferredPrompt.prompt();
    await window.deferredPrompt.userChoice;
    window.deferredPrompt = null;
  }
}
shareImageButton.addEventListener("click", openCreatePostModal);

function closeCreatePostModal() {
  imagePickerArea.style.display = "none";
  videoPlayer.style.display = "none";
  canvasElement.style.display = "none";
  captureButton.style.display = "inline";
  locationButton.style.display = "inline";
  locationLoader.style.display = "none";
  if (videoPlayer.srcObject) {
    videoPlayer.srcObject.getVideoTracks().forEach(track => track.stop());
  }
  setTimeout(() => {
    createPostArea.style.transform = "translateY(100vh)";
  }, 1);
}
closeCreatePostModalButton.addEventListener("click", closeCreatePostModal);

function clearCards() {
  while (sharedMomentsArea.hasChildNodes()) {
    sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
  }
}

function createCard(card) {
  const cardWrapper = document.createElement("div");
  cardWrapper.className = "shared-moment-card mdl-card mdl-shadow--2dp";
  const cardTitle = document.createElement("div");
  cardTitle.className = "mdl-card__title";
  cardTitle.style.backgroundImage = `url(${card.image})`;
  cardTitle.style.backgroundSize = "cover";
  cardTitle.style.backgroundRepeat = "no-repeat";
  cardTitle.style.backgroundColor = "black";
  cardTitle.style.backgroundPosition = "center";
  cardWrapper.appendChild(cardTitle);
  const cardTitleTextElement = document.createElement("h2");
  cardTitleTextElement.className = "mdl-card__title-text";
  cardTitleTextElement.textContent = card.title;
  cardTitle.appendChild(cardTitleTextElement);
  const cardSupportingText = document.createElement("div");
  cardSupportingText.className = "mdl-card__supporting-text";
  cardSupportingText.textContent = card.location;
  cardSupportingText.style.textAlign = "center";
  cardWrapper.appendChild(cardSupportingText);
  componentHandler.upgradeElement(cardWrapper);
  sharedMomentsArea.appendChild(cardWrapper);
}

function createCards(cards) {
  cards.forEach(card => createCard(card));
}

// Cache-then-network: start both fetches in parallel; IDB renders first if
// the network hasn't responded yet, then network overwrites with fresher data.
function loadDataAndUpdate() {
  const url = "https://pwagram-439bb.firebaseio.com/posts.json";
  let networkDataReceived = false;

  fetch(url)
    .then(res => (res.ok ? res.json() : null))
    .then(data => {
      if (!data) return;
      networkDataReceived = true;
      clearCards();
      createCards(Object.values(data));
    })
    .catch(() => {});

  if ("indexedDB" in window) {
    getItems("posts").then(posts => {
      if (!networkDataReceived) {
        clearCards();
        createCards(posts);
      }
    });
  }
}

loadDataAndUpdate();

async function submitPost() {
  const id = new Date().toISOString();
  const postData = new FormData();
  postData.append("id", id);
  postData.append("title", titleInput.value);
  postData.append("location", locationInput.value);
  postData.append("file", picture, id + ".png");
  postData.append("rawLocationLat", fetchedLocation.lat);
  postData.append("rawLocationLng", fetchedLocation.lng);

  try {
    await fetch(
      "https://us-central1-pwagram-439bb.cloudfunctions.net/storePostData",
      { method: "POST", body: postData }
    );
    clearPostForm();
    setTimeout(() => loadDataAndUpdate(), 1000);
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
    await writeItem("sync-posts", post);
    await sw.sync.register("sync-new-posts");
    const snackbarContainer = document.querySelector("#confirmation-toast");
    snackbarContainer.MaterialSnackbar.showSnackbar({
      message: "Your Post was saved for syncing!"
    });
  } catch {
    // sync registration failed — post remains in IDB and will retry
  }
}

function clearPostForm() {
  titleInput.value = "";
  locationInput.value = "";
}

form.addEventListener("submit", async evt => {
  evt.preventDefault();
  if (titleInput.value.trim() === "" || locationInput.value.trim() === "") {
    alert("Please enter valid data!");
    return;
  }
  closeCreatePostModal();

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    await submitPostViaSyncManager();
    clearPostForm();
  } else {
    submitPost();
  }
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("message", event => {
    event.ports[0].postMessage("ACK");
    if (event.data === "refresh") {
      loadDataAndUpdate();
    }
  });
}
