// fake-indexeddb/auto must be imported before feed.ts so IDB is patched at module load
import 'fake-indexeddb/auto';
import { vi, describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

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
  <div id="shared-moments"></div>
  <div id="confirmation-toast"><span id="toast-message"></span></div>
`;

let clearPostForm: () => void;

beforeAll(async () => {
  document.body.innerHTML = FEED_HTML;
  // Stub fetch before module import — loadDataAndUpdate() fires at module level
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  const mod = await import('./feed.js');
  clearPostForm = (mod as any).clearPostForm;
  vi.unstubAllGlobals();
});

// Injects a File into the imagePicker and waits for the async change handler to set `picture`.
// Uses Object.defineProperty because jsdom does not expose DataTransfer as a global.
async function loadPicture(): Promise<void> {
  const picker = document.getElementById('image-picker') as HTMLInputElement;
  const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
  const fileList = Object.assign([file], { item: (i: number) => fileList[i] ?? null });
  Object.defineProperty(picker, 'files', { get: () => fileList, configurable: true });
  picker.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 300));
}

// ─── clearPostForm ────────────────────────────────────────────────────────────

describe('clearPostForm', () => {
  beforeEach(() => {
    (document.getElementById('title') as HTMLInputElement).value = 'My Vacation';
    (document.getElementById('location') as HTMLInputElement).value = 'Paris, FR';
  });

  it('clears titleInput', () => {
    clearPostForm();
    expect((document.getElementById('title') as HTMLInputElement).value).toBe('');
  });

  it('clears locationInput', () => {
    clearPostForm();
    expect((document.getElementById('location') as HTMLInputElement).value).toBe('');
  });

  it('clears imagePicker', () => {
    clearPostForm();
    expect((document.getElementById('image-picker') as HTMLInputElement).value).toBe('');
  });

  it('resets picture — subsequent submit without a new image is rejected', async () => {
    await loadPicture();
    clearPostForm();

    // Refill text fields but do NOT pick a new image
    (document.getElementById('title') as HTMLInputElement).value = 'Second Post';
    (document.getElementById('location') as HTMLInputElement).value = 'Berlin, DE';

    let alerted = '';
    vi.stubGlobal('alert', (msg: string) => { alerted = msg; });
    document.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await new Promise(r => setTimeout(r, 100));

    expect(alerted).toBe('Please capture or pick an image!');
    vi.unstubAllGlobals();
  });
});

// ─── Form submit — SW routing ─────────────────────────────────────────────────

describe('form submit — SW routing', () => {
  beforeEach(async () => {
    await loadPicture();
    (document.getElementById('title') as HTMLInputElement).value = 'Test Post';
    (document.getElementById('location') as HTMLInputElement).value = 'Tokyo, JP';
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    // Undo any navigator.serviceWorker injection
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('calls fetch (submitPost path) when no active SW registration', async () => {
    // jsdom has no serviceWorker by default → swReg is undefined → submitPost path
    const fetchSpy = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);

    document.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await new Promise(r => setTimeout(r, 500));

    const postCall = fetchSpy.mock.calls.find(c =>
      String(c[0]).includes('cloudfunctions.net')
    );
    expect(postCall).toBeDefined();
  });

  it('calls sync.register (SyncManager path) when SW is active', async () => {
    const registerSpy = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: {
        getRegistration: vi.fn().mockResolvedValue({ active: { state: 'activated' } }),
        ready: Promise.resolve({ sync: { register: registerSpy } }),
        addEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
    vi.stubGlobal('SyncManager', class {});

    document.querySelector('form')!.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true })
    );
    await new Promise(r => setTimeout(r, 500));

    expect(registerSpy).toHaveBeenCalledWith('sync-new-posts');
  });
});
