/**
 * storage.js — project persistence on IndexedDB.
 *
 * Why not localStorage: it caps at ~5MB per site, is synchronous (blocks typing
 * on big files), and cannot hold a video file or file handle. IndexedDB has no
 * practical size cap for subtitle data and can store Blobs and
 * FileSystemFileHandles directly.
 *
 * If IndexedDB is unavailable (some private-browsing modes), everything falls
 * back to localStorage, minus video persistence.
 *
 * Keys in the "kv" store:
 *   projects                → [{ name, created, modified }]  (ISO date strings)
 *   cues:<project>          → [{ id, startMs, endMs, text }]
 *   video:<project>         → { kind: 'handle', handle, name, size }
 *                           | { kind: 'blob', file, name, size }
 *                           | { kind: 'meta', name, size }
 */
import { fromLegacyEntries, normalizeCues } from './cues';

const DB_NAME = 'srtcreator';
const DB_VERSION = 1;
const STORE = 'kv';
const LS_PREFIX = 'srtc:';

/** Videos up to this size are copied into the browser when file handles aren't supported. */
export const MAX_STORED_VIDEO_BYTES = 300 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Low-level key/value
// ---------------------------------------------------------------------------

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idbRequest(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function kvGet(key) {
  const db = await openDb();
  if (db) return idbRequest(db, 'readonly', s => s.get(key));
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw == null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

export async function kvSet(key, value) {
  const db = await openDb();
  if (db) return idbRequest(db, 'readwrite', s => s.put(value, key));
  localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
}

export async function kvDel(key) {
  const db = await openDb();
  if (db) return idbRequest(db, 'readwrite', s => s.delete(key));
  localStorage.removeItem(LS_PREFIX + key);
}

export async function isIndexedDbAvailable() {
  return Boolean(await openDb());
}

// ---------------------------------------------------------------------------
// One-time migration from the old localStorage layout
// ---------------------------------------------------------------------------

let migrationPromise = null;

/**
 * Old layout: "Projects" → [{name, created, modified}],
 * "<name>Entries" → [{startTime, endTime, Text}], "<name>Divs", "<name>video", "<name>videofile".
 * Old keys are removed only after the new data is written.
 */
export function ensureMigrated() {
  if (migrationPromise) return migrationPromise;
  migrationPromise = (async () => {
    try {
      // The old "Projects" key is removed after a successful migration,
      // so its presence alone means there is old data to bring over.
      const rawProjects = localStorage.getItem('Projects');
      if (!rawProjects) return;

      const oldProjects = JSON.parse(rawProjects) || [];
      const existing = (await kvGet('projects')) || [];
      const names = new Set(existing.map(p => p.name));
      const merged = [...existing];

      for (const p of oldProjects) {
        if (!p?.name || names.has(p.name)) continue;
        let cues = [];
        try { cues = fromLegacyEntries(JSON.parse(localStorage.getItem(`${p.name}Entries`) || '[]')); } catch { /* corrupt entry list — start empty */ }
        await kvSet(`cues:${p.name}`, cues);
        merged.push({
          name: p.name,
          created: toIso(p.created),
          modified: toIso(p.modified),
        });
        names.add(p.name);
      }
      await kvSet('projects', merged);

      // New data is safely written — clean up the old keys.
      for (const p of oldProjects) {
        if (!p?.name) continue;
        ['Entries', 'Divs', 'video', 'videofile'].forEach(suffix => localStorage.removeItem(`${p.name}${suffix}`));
      }
      localStorage.removeItem('Projects');
    } catch (err) {
      // Leave the old data untouched so nothing is lost; try again next load.
      console.error('[SRT Creator] Migration from localStorage failed', err);
      migrationPromise = null;
    }
  })();
  return migrationPromise;
}

function toIso(d) {
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export async function listProjects() {
  await ensureMigrated();
  const list = (await kvGet('projects')) || [];
  return list.map(p => ({ ...p, created: new Date(p.created), modified: new Date(p.modified) }));
}

async function writeProjects(list) {
  await kvSet('projects', list.map(p => ({ name: p.name, created: toIso(p.created), modified: toIso(p.modified) })));
}

export async function createProject(name) {
  const list = await listProjects();
  if (list.some(p => p.name === name)) throw new Error('A project with this name already exists.');
  const now = new Date();
  const next = [...list, { name, created: now, modified: now }];
  await writeProjects(next);
  await kvSet(`cues:${name}`, []);
  return next;
}

export async function deleteProject(name) {
  const list = await listProjects();
  const next = list.filter(p => p.name !== name);
  await writeProjects(next);
  await kvDel(`cues:${name}`);
  await kvDel(`video:${name}`);
  return next;
}

export async function touchProject(name) {
  const list = await listProjects();
  const next = list.map(p => (p.name === name ? { ...p, modified: new Date() } : p));
  await writeProjects(next);
}

export async function projectExists(name) {
  const list = await listProjects();
  return list.some(p => p.name === name);
}

// ---------------------------------------------------------------------------
// Cues
// ---------------------------------------------------------------------------

export async function loadCues(name) {
  await ensureMigrated();
  return normalizeCues(await kvGet(`cues:${name}`));
}

export async function saveCues(name, cues) {
  await kvSet(`cues:${name}`, cues);
  await touchProject(name);
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

export const supportsFileHandles = () =>
  typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';

/**
 * Remember the video for a project so it comes back after a reload.
 * Prefers a file handle (no copy, Chromium only), then a stored copy for
 * small files, then just the name/size so the user can be asked to reopen it.
 * Returns the kind that was stored.
 */
export async function saveVideo(project, { file, handle }) {
  const meta = { name: file?.name || handle?.name || 'video', size: file?.size ?? 0 };
  const db = await openDb();
  if (!db) return 'none';

  if (handle) {
    try {
      await kvSet(`video:${project}`, { kind: 'handle', handle, ...meta });
      return 'handle';
    } catch { /* handle not cloneable in this browser — fall through */ }
  }
  if (file && file.size <= MAX_STORED_VIDEO_BYTES) {
    try {
      await kvSet(`video:${project}`, { kind: 'blob', file, ...meta });
      return 'blob';
    } catch { /* quota exceeded — fall through */ }
  }
  await kvSet(`video:${project}`, { kind: 'meta', ...meta });
  return 'meta';
}

export async function loadVideoRecord(project) {
  const db = await openDb();
  if (!db) return null;
  return (await kvGet(`video:${project}`)) || null;
}

/**
 * Try to get a File back from a stored record without user interaction.
 * Returns { file } on success, or { needsPermission: true } when a handle
 * exists but the browser wants a click first, or null.
 */
export async function restoreVideoFile(record) {
  if (!record) return null;
  if (record.kind === 'blob' && record.file) return { file: record.file };
  if (record.kind === 'handle' && record.handle) {
    try {
      const perm = await record.handle.queryPermission?.({ mode: 'read' });
      if (perm === 'granted') return { file: await record.handle.getFile() };
      return { needsPermission: true };
    } catch {
      return null;
    }
  }
  return null;
}

/** Must be called from a click handler. */
export async function requestHandleFile(record) {
  const perm = await record.handle.requestPermission?.({ mode: 'read' });
  if (perm !== 'granted') return null;
  return record.handle.getFile();
}

/** Ask the browser not to evict our data under storage pressure. */
export function requestPersistentStorage() {
  try { navigator.storage?.persist?.(); } catch { /* optional */ }
}
