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

locationButton.addEventListener("click", event => {
  if (!("geolocation" in navigator)) return;

  locationButton.style.display = "none";
  locationLoader.style.display = "block";

  let sawAlert = false;

  navigator.geolocation.getCurrentPosition(
    pos => {
      locationButton.style.display = "inline";
      locationLoader.style.display = "none";
      fetchedLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      // TODO: Fetch location from a geocoding API and output location text
      // Just hardcode the value for now to fake it
      locationInput.value = "In Alexandria, VA";
      document.querySelector("#manual-location").classList.add("is-focused");
    },
    err => {
      // Error callback
      console.log(err);
      locationButton.style.display = "inline";
      locationLoader.style.display = "none";
      if (!sawAlert) {
        alert("Failed to fetch location. Please enter manually!");
        sawAlert = true;
      }
      fetchedLocation = { lat: 0, lng: 0 };
    },
    {
      timeout: 10000 // timeout getting location after 10 seconds
    }
  );
});

function initializeLocation() {
  // If the browser doesn't support the geolocation API, hide the button
  if (!("geolocation" in navigator)) {
    locationButton.style.display = "none";
  }
}

/**
 * polyfill for navigator.mediaDevices.getUserMedia
 */
function initializeMedia() {
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

  navigator.mediaDevices
    .getUserMedia({ video: true })
    .then(stream => {
      videoPlayer.srcObject = stream;
      videoPlayer.style.display = "block";
    })
    .catch(err => {
      imagePickerArea.style.display = "block";
    });
}

captureButton.addEventListener("click", evt => {
  canvasElement.style.display = "block";
  videoPlayer.style.display = "none";
  captureButton.style.display = "none";
  const context = canvasElement.getContext("2d");
  context.drawImage(
    videoPlayer,
    0,
    0,
    canvasElement.width,
    videoPlayer.videoHeight / (videoPlayer.videoWidth / canvasElement.width) // maintain aspect ratio
  );
  videoPlayer.srcObject.getVideoTracks().forEach(track => track.stop());
  picture = dataURItoBlob(canvasElement.toDataURL());
});

imagePicker.addEventListener("change", event => {
  picture = event.target.files[0];
});

/**
 * Slides the Create Post form up from below the viewport
 * Triggers the PWA Installation prompt if cached because this shows user intent
 */
function openCreatePostModal() {
  setTimeout(() => {
    createPostArea.style.transform = "translateY(0)";
  }, 1);
  initializeMedia();
  initializeLocation();
  // We want to present the user the PWA installation prompt if they demonstrate intent to upload a picture.
  // This is only possible if we've captured and deferred the prompt.
  // We do this by listening to the beforeinstallprompt event in app.js
  if (window.deferredPrompt) {
    window.deferredPrompt.prompt();
    window.deferredPrompt.userChoice.then(choiceResult => {
      if (choiceResult.outcome === "dismissed") {
        console.log("[App] User cancelled PWA installation");
      } else {
        console.log("[App] User added PWA to Home Screen");
      }
      window.deferredPrompt = null;
    });
  }
}
shareImageButton.addEventListener("click", openCreatePostModal);

/**
 * Slides the Create Post form below the viewport
 */
function closeCreatePostModal() {
  // Hide the image picker
  imagePickerArea.style.display = "none";
  // Reset Selfie controls
  videoPlayer.style.display = "none";
  canvasElement.style.display = "none";
  captureButton.style.display = "inline";
  // Reset geolocation controls
  locationButton.style.display = "inline";
  locationLoader.style.display = "none";
  // Stop all open video tracks
  if (videoPlayer.srcObject) {
    videoPlayer.srcObject.getVideoTracks().forEach(track => track.stop());
  }
  // Slide the modal offscreen after a short timeout to give the video cleanup task time to complete
  setTimeout(() => {
    createPostArea.style.transform = "translateY(100vh)";
  }, 1);
}
closeCreatePostModalButton.addEventListener("click", closeCreatePostModal);

/**
 * Remove all of the cards from the shared moments area
 */
function clearCards() {
  while (sharedMomentsArea.hasChildNodes()) {
    sharedMomentsArea.removeChild(sharedMomentsArea.lastChild);
  }
}

/**
 * Given an object representing a post, assembles a card for that post and appends to the shared moments area
 *
 * @param {any} card
 */
function createCard(card) {
  var cardWrapper = document.createElement("div");
  cardWrapper.className = "shared-moment-card mdl-card mdl-shadow--2dp";
  var cardTitle = document.createElement("div");
  cardTitle.className = "mdl-card__title";
  cardTitle.style.backgroundImage = `url(${card.image})`;
  cardTitle.style.backgroundSize = "cover";
  cardTitle.style.backgroundRepeat = "no-repeat";
  cardTitle.style.backgroundColor = "black";
  cardTitle.style.backgroundPosition = "center";
  cardWrapper.appendChild(cardTitle);
  var cardTitleTextElement = document.createElement("h2");
  cardTitleTextElement.className = "mdl-card__title-text";
  cardTitleTextElement.textContent = card.title;
  cardTitle.appendChild(cardTitleTextElement);
  var cardSupportingText = document.createElement("div");
  cardSupportingText.className = "mdl-card__supporting-text";
  cardSupportingText.textContent = card.location;
  cardSupportingText.style.textAlign = "center";
  cardWrapper.appendChild(cardSupportingText);
  componentHandler.upgradeElement(cardWrapper);
  sharedMomentsArea.appendChild(cardWrapper);
}

/**
 * Given an array of posts, create cards for each post and append all cards to the shared moments area
 *
 * @param {any} cards
 */
function createCards(cards) {
  cards.forEach(card => createCard(card));
}

/**
 * Fetches posts from the network or IDB depending on network conditions and refreshes the sharedMoments area
 */
function loadDataAndUpdate() {
  const url = "https://pwagram-439bb.firebaseio.com/posts.json";
  console.log(
    `[App]: Updating Posts using Network with Cache Fallback Strategy`
  );
  let networkDataReceived = false;
  // Fetch from Web
  fetch(url)
    .then(res => {
      if (res.ok) {
        return res.json();
      }
    })
    .then(data => {
      networkDataReceived = true;
      console.log("[App] Successfully fetched posts from network ", data);
      // When we get this data, always blow away the data rendered from the cache, as this is more fresh
      clearCards();
      createCards(Object.values(data));
    })
    .catch(err => {
      console.log(`[App] Failed to fetch posts from network`);
    });

  // Fetch from IndexedDB
  if ("indexedDB" in window) {
    getItems("posts").then(posts => {
      if (!networkDataReceived) {
        console.log("[App] Successfully fetched posts from IDB");
        clearCards();
        createCards(posts);
      }
    });
  }
}

loadDataAndUpdate();

/**
 * Builds a post from the create post form and submits to the server.
 * This is used as a fallback in browsers that don't support service worker and Sync Manager
 * @returns
 */
function submitPost() {
  var id = new Date().toISOString();
  var postData = new FormData();
  postData.append("id", id);
  postData.append("title", titleInput.value);
  postData.append("location", locationInput.value);
  postData.append("file", picture, id + ".png");
  postData.append("rawLocationLat", fetchedLocation.lat);
  postData.append("rawLocationLng", fetchedLocation.lng);
  console.log(`[App] Submitting post data`, postData);

  return fetch(
    "https://us-central1-pwagram-439bb.cloudfunctions.net/storePostData",
    {
      method: "POST",
      body: postData
    }
  )
    .then(res => {
      console.log(`[App] Successfully submitted post data`, res);
      clearPostForm();
      // After a second refresh the shared moments area
      setTimeout(() => loadDataAndUpdate(), 1000);
    })
    .catch(err => {
      console.log(`[App] Failed to submit post data`, err);
    });
}

/**
 * Submit post via Sync Manager if supported to enable offline caching
 */
function submitPostViaSyncManager() {
  return navigator.serviceWorker.ready.then(sw => {
    var post = {
      id: new Date().toISOString(),
      title: titleInput.value,
      location: locationInput.value,
      picture: picture,
      rawLocation: fetchedLocation
    };
    writeItem("sync-posts", post)
      .then(() => {
        console.log(`[App] Persisted Post to IDB`);
        return sw.sync.register("sync-new-posts");
      })
      .then(() => {
        console.log(
          `[App] Registered sync-new-posts event with Service Worker`
        );
        const snackbarContainer = document.querySelector("#confirmation-toast");
        const data = { message: "Your Post was saved for syncing!" };
        snackbarContainer.MaterialSnackbar.showSnackbar(data);
      })
      .catch(err =>
        console.log(
          `[App] Failed to register a sync-new-posts event with the service worker`,
          err
        )
      );
  });
}

function clearPostForm() {
  titleInput.value = "";
  locationInput.value = "";
}

form.addEventListener("submit", evt => {
  evt.preventDefault();
  // Validate Post Form
  if (titleInput.value.trim() === "" || locationInput.value.trim() === "") {
    alert("Please enter valid data!");
    return;
  }
  closeCreatePostModal();

  if ("serviceWorker" in navigator && "SyncManager" in window) {
    console.log(`[App] Support for Background Sync Detected`);
    submitPostViaSyncManager().then(() => clearPostForm());
  } else {
    console.log(
      `[App] Browser does not support Background Sync. Executing fallback`
    );
    submitPost();
  }
});

if ("serviceWorker" in navigator) {
  // Handler for messages coming from the service worker
  navigator.serviceWorker.addEventListener("message", event => {
    console.log("[App] Received Message from SW: " + event.data);
    // This is not really used, but this shows how to send an immediate response using the second channel
    event.ports[0].postMessage("ACK");
    switch (event.data) {
      // Allows the service worker to tell the client to refresh the shared moments area if new posts are available
      case "refresh":
        console.log("[App] Instructed to Refresh Cards: " + event.data);
        loadDataAndUpdate();
        break;
    }
  });
}
