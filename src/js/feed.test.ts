// fake-indexeddb/auto must be imported before feed.ts so IDB is patched at module load
import "fake-indexeddb/auto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteItems, getItems, writeItem } from "./utils.js";

const FEED_HTML = `
  <button id="share-image-button"></button>
  <div id="create-post">
    <video id="player"></video>
    <canvas id="canvas"></canvas>
    <button id="capture-btn" type="button"></button>
    <div id="pick-image">
      <input type="file" id="image-picker">
    </div>
    <form>
      <input id="title" type="text">
      <input id="location" type="text">
      <button id="location-btn" type="button">Get Location</button>
      <div id="location-loader"></div>
      <button id="post-btn" type="submit">Post!</button>
      <button id="close-create-post-modal-btn" type="button">Close</button>
    </form>
  </div>
  <p id="feed-status" hidden></p>
  <div id="shared-moments"></div>
  <div id="confirmation-toast"><span id="toast-message"></span></div>
`;

let clearPostForm: () => void;
let showToast: (message: string) => void;
let loadDataAndUpdate: () => Promise<void>;
let openCreatePostModal: () => void;
let closeCreatePostModal: () => void;
let FALLBACK_POSTS: Array<{ title: string; location: string; image: string }>;

beforeAll(async () => {
  document.body.innerHTML = FEED_HTML;
  // Stub fetch before module import — loadDataAndUpdate() fires at module level
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  const mod = await import("./feed.js");
  clearPostForm = (mod as any).clearPostForm;
  showToast = (mod as any).showToast;
  loadDataAndUpdate = (mod as any).loadDataAndUpdate;
  openCreatePostModal = (mod as any).openCreatePostModal;
  closeCreatePostModal = (mod as any).closeCreatePostModal;
  FALLBACK_POSTS = (mod as any).FALLBACK_POSTS;
  vi.unstubAllGlobals();
});

// Injects a File into the imagePicker and waits for the async change handler to set `picture`.
// Uses Object.defineProperty because jsdom does not expose DataTransfer as a global.
async function loadPicture(): Promise<void> {
  const picker = document.getElementById("image-picker") as HTMLInputElement;
  const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });
  const fileList = Object.assign([file], { item: (i: number) => fileList[i] ?? null });
  Object.defineProperty(picker, "files", { get: () => fileList, configurable: true });
  picker.dispatchEvent(new Event("change", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 300));
}

// ─── clearPostForm ────────────────────────────────────────────────────────────

describe("clearPostForm", () => {
  beforeEach(() => {
    (document.getElementById("title") as HTMLInputElement).value = "My Vacation";
    (document.getElementById("location") as HTMLInputElement).value = "Paris, FR";
  });

  it("clears titleInput", () => {
    clearPostForm();
    expect((document.getElementById("title") as HTMLInputElement).value).toBe("");
  });

  it("clears locationInput", () => {
    clearPostForm();
    expect((document.getElementById("location") as HTMLInputElement).value).toBe("");
  });

  it("clears imagePicker", () => {
    clearPostForm();
    expect((document.getElementById("image-picker") as HTMLInputElement).value).toBe("");
  });

  it("resets picture — subsequent submit without a new image is rejected", async () => {
    await loadPicture();
    clearPostForm();

    // Refill text fields but do NOT pick a new image
    (document.getElementById("title") as HTMLInputElement).value = "Second Post";
    (document.getElementById("location") as HTMLInputElement).value = "Berlin, DE";

    let alerted = "";
    vi.stubGlobal("alert", (msg: string) => {
      alerted = msg;
    });
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 100));

    expect(alerted).toBe("Please capture or pick an image!");
    vi.unstubAllGlobals();
  });
});

// ─── Form submit — SW routing ─────────────────────────────────────────────────

describe("form submit — SW routing", () => {
  beforeEach(async () => {
    await loadPicture();
    (document.getElementById("title") as HTMLInputElement).value = "Test Post";
    (document.getElementById("location") as HTMLInputElement).value = "Tokyo, JP";
    vi.stubGlobal("alert", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Undo any navigator.serviceWorker injection
    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it("calls fetch (submitPost path) when no active SW registration", async () => {
    // jsdom has no serviceWorker by default → swReg is undefined → submitPost path
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);

    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));

    const postCall = fetchSpy.mock.calls.find((c) => {
      try {
        const { hostname } = new URL(String(c[0]));
        return hostname === "cloudfunctions.net" || hostname.endsWith(".cloudfunctions.net");
      } catch {
        return false;
      }
    });
    expect(postCall).toBeDefined();
  });

  it("calls sync.register (SyncManager path) when SW is active", async () => {
    const registerSpy = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue({ active: { state: "activated" } }),
        ready: Promise.resolve({ sync: { register: registerSpy } }),
        addEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
    vi.stubGlobal("SyncManager", class {});

    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));

    expect(registerSpy).toHaveBeenCalledWith("sync-new-posts");
  });

  it("writes post record to sync-posts IDB store with correct title, location, and picture", async () => {
    await deleteItems("sync-posts");
    const registerSpy = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(globalThis.navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue({ active: { state: "activated" } }),
        ready: Promise.resolve({ sync: { register: registerSpy } }),
        addEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
    vi.stubGlobal("SyncManager", class {});

    (document.getElementById("title") as HTMLInputElement).value = "IDB Test Post";
    (document.getElementById("location") as HTMLInputElement).value = "Oslo, NO";

    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 500));

    const records = (await getItems("sync-posts")) as Array<{
      title: string;
      location: string;
      picture: unknown;
    }>;
    expect(records).toHaveLength(1);
    expect(records[0].title).toBe("IDB Test Post");
    expect(records[0].location).toBe("Oslo, NO");
    expect(records[0].picture).toBeDefined();
  });
});

// ─── showToast ────────────────────────────────────────────────────────────────

describe("showToast", () => {
  it("sets #toast-message text content", () => {
    showToast("Hello from test");
    expect(document.getElementById("toast-message")!.textContent).toBe("Hello from test");
  });

  it('adds the "visible" class to #confirmation-toast', () => {
    showToast("Visible now");
    expect(document.getElementById("confirmation-toast")!.classList.contains("visible")).toBe(true);
  });
});

// ─── loadDataAndUpdate ────────────────────────────────────────────────────────

describe("loadDataAndUpdate", () => {
  beforeEach(async () => {
    document.getElementById("shared-moments")!.innerHTML = "";
    await deleteItems("posts");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders cards from a successful network response", async () => {
    const data = {
      p1: { image: "http://example.com/img.jpg", title: "Network Post", location: "London, UK" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status: 200 })),
    );

    await loadDataAndUpdate();

    const cards = document.querySelectorAll("#shared-moments .shared-moment-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("Network Post");
    expect(cards[0].textContent).toContain("London, UK");
    expect(document.getElementById("feed-status")!.hidden).toBe(true);
  });

  it("falls back to IDB cache when the network request fails", async () => {
    await writeItem("posts", {
      id: "c1",
      image: "http://example.com/cached.jpg",
      title: "Cached Post",
      location: "Berlin, DE",
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await loadDataAndUpdate();

    const cards = document.querySelectorAll("#shared-moments .shared-moment-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain("Cached Post");
    expect(document.getElementById("feed-status")!.hidden).toBe(true);
  });

  it("shows a friendly empty state when the live feed has no posts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 })),
    );

    await loadDataAndUpdate();

    expect(document.querySelectorAll("#shared-moments .shared-moment-card")).toHaveLength(0);
    const status = document.getElementById("feed-status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toMatch(/no moments yet/i);
    expect(status.dataset.kind).toBe("empty");
  });

  it("shows sample moments and an error status when the live feed 404s and IDB is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));

    await loadDataAndUpdate();

    const cards = document.querySelectorAll("#shared-moments .shared-moment-card");
    expect(cards).toHaveLength(FALLBACK_POSTS.length);
    expect(cards[0].textContent).toContain(FALLBACK_POSTS[0].title);
    const status = document.getElementById("feed-status")!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toMatch(/live feed is unavailable/i);
    expect(status.dataset.kind).toBe("error");
  });
});

describe("create-post modal", () => {
  it("shows #create-post on open and sets display:none after close", async () => {
    const modal = document.getElementById("create-post") as HTMLDivElement;
    modal.style.display = "none";
    modal.style.transition = "none";

    openCreatePostModal();
    expect(modal.style.display).toBe("block");
    await new Promise((r) => setTimeout(r, 5));
    expect(modal.style.transform).toMatch(/translateY\(0(px)?\)/);

    closeCreatePostModal();
    expect(modal.style.transform).toMatch(/translateY\(100vh\)/);
    await new Promise((r) => setTimeout(r, 400));
    expect(modal.style.display).toBe("none");
  });
});
