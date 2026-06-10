// fake-indexeddb/auto MUST be imported before utils.ts so it patches
// globalThis.indexedDB before the module-level dbPromise is created.
import 'fake-indexeddb/auto';

import {
  urlBase64ToUint8Array,
  dataURItoBlob,
  writeItem,
  getItems,
  getItem,
  deleteItems,
  deleteItem,
} from './utils.js';

// ─── urlBase64ToUint8Array ────────────────────────────────────────────────────

describe('urlBase64ToUint8Array', () => {
  it('returns a Uint8Array', () => {
    const result = urlBase64ToUint8Array('dGVzdA');
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('decodes "dGVzdA" to [116, 101, 115, 116] (the bytes for "test")', () => {
    const result = urlBase64ToUint8Array('dGVzdA');
    expect(Array.from(result)).toEqual([116, 101, 115, 116]);
  });

  it('handles strings that need padding (length % 4 !== 0)', () => {
    // "YQ==" in standard base64 → "a" (0x61)
    // As base64url without padding: "YQ"
    const result = urlBase64ToUint8Array('YQ');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0x61); // 'a'
  });

  it('handles URL-safe characters (- and _)', () => {
    // Standard base64 "+" and "/" become "-" and "_" in base64url
    // Encode [0xfb, 0xff] → base64 "+/8=" → base64url "-_8"
    const result = urlBase64ToUint8Array('-_8');
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result[0]).toBe(0xfb);
    expect(result[1]).toBe(0xff);
  });
});

// ─── dataURItoBlob ────────────────────────────────────────────────────────────

describe('dataURItoBlob', () => {
  const TEXT = 'hello world';
  // btoa('hello world') === 'aGVsbG8gd29ybGQ='
  const DATA_URI = `data:text/plain;base64,${btoa(TEXT)}`;

  it('returns a Blob', () => {
    const result = dataURItoBlob(DATA_URI);
    expect(result).toBeInstanceOf(Blob);
  });

  it('preserves the MIME type', () => {
    const result = dataURItoBlob(DATA_URI);
    expect(result.type).toBe('text/plain');
  });

  it('has correct byte content', async () => {
    const result = dataURItoBlob(DATA_URI);
    const text = await result.text();
    expect(text).toBe(TEXT);
  });

  it('preserves image MIME type', () => {
    // A 1×1 transparent PNG as a data URI
    const PNG_URI =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const result = dataURItoBlob(PNG_URI);
    expect(result.type).toBe('image/png');
  });
});

// ─── IDB CRUD round-trip ──────────────────────────────────────────────────────

describe('IDB CRUD (posts store)', () => {
  beforeEach(async () => {
    await deleteItems('posts');
  });

  it('writeItem stores a record retrievable by getItems', async () => {
    await writeItem('posts', { id: '1', title: 'Alpha', location: 'NYC' });
    const items = await getItems('posts');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: '1', title: 'Alpha' });
  });

  it('getItem retrieves a single record by id', async () => {
    await writeItem('posts', { id: '42', title: 'Beta', location: 'LA' });
    const item = await getItem('posts', '42') as { title: string } | undefined;
    expect(item).toBeDefined();
    expect(item!.title).toBe('Beta');
  });

  it('getItem returns undefined for a non-existent id', async () => {
    const item = await getItem('posts', 'does-not-exist');
    expect(item).toBeUndefined();
  });

  it('deleteItem removes only the targeted record', async () => {
    await writeItem('posts', { id: 'a', title: 'Keep' });
    await writeItem('posts', { id: 'b', title: 'Remove' });
    await deleteItem('posts', 'b');
    const items = await getItems('posts');
    expect(items).toHaveLength(1);
    expect((items[0] as { id: string }).id).toBe('a');
  });

  it('deleteItems clears all records', async () => {
    await writeItem('posts', { id: 'x', title: 'X' });
    await writeItem('posts', { id: 'y', title: 'Y' });
    await deleteItems('posts');
    const items = await getItems('posts');
    expect(items).toHaveLength(0);
  });

  it('write→getAll→getItem→delete full cycle', async () => {
    const post = { id: 'cycle-1', title: 'Cycle Test', location: 'Earth' };
    await writeItem('posts', post);

    const all = await getItems('posts');
    expect(all).toHaveLength(1);

    const single = await getItem('posts', 'cycle-1');
    expect(single).toMatchObject(post);

    await deleteItem('posts', 'cycle-1');
    const afterDelete = await getItems('posts');
    expect(afterDelete).toHaveLength(0);
  });
});

// ─── IDB CRUD (sync-posts store) ──────────────────────────────────────────────

describe('IDB CRUD (sync-posts store)', () => {
  beforeEach(async () => {
    await deleteItems('sync-posts');
  });

  it('writeItem stores a pending post retrievable by getItems', async () => {
    await writeItem('sync-posts', { id: 's1', title: 'Pending', location: 'NYC' });
    const items = await getItems('sync-posts');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 's1', title: 'Pending' });
  });

  it('getItem returns undefined for a non-existent sync-post id', async () => {
    expect(await getItem('sync-posts', 'no-such-id')).toBeUndefined();
  });

  it('deleteItem removes only the targeted sync-post', async () => {
    await writeItem('sync-posts', { id: 's1', title: 'Keep' });
    await writeItem('sync-posts', { id: 's2', title: 'Remove' });
    await deleteItem('sync-posts', 's2');
    const items = await getItems('sync-posts');
    expect(items).toHaveLength(1);
    expect((items[0] as { id: string }).id).toBe('s1');
  });

  it('deleteItems clears all pending sync-posts', async () => {
    await writeItem('sync-posts', { id: 's1', title: 'A' });
    await writeItem('sync-posts', { id: 's2', title: 'B' });
    await deleteItems('sync-posts');
    expect(await getItems('sync-posts')).toHaveLength(0);
  });
});
