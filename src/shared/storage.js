// Private per-person storage.
//
// In Claude, data lives in the artifact's db under data/users/<id>/<app>/kv/<key>,
// which only that person can read (not even the artifact owner). Outside Claude
// (local preview, tests) it falls back to localStorage so the app still runs.
//
// API: get(key), set(key, value), remove(key), list(kind), watch(key, fn)
// Every stored value carries a `kind` field so list(kind) can query by type.

/** @typedef {{kind: string, [k: string]: unknown}} Record */

const WRITE_QUEUE = new Map();

/** Serialise writes per key: the db wants one write at a time per document. */
function queued(key, fn) {
  const prev = WRITE_QUEUE.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  WRITE_QUEUE.set(key, next);
  return next;
}

function localStore(app) {
  const prefix = `${app}:`;
  const read = (k) => {
    try {
      const raw = localStorage.getItem(prefix + k);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const listeners = new Map();
  return {
    kind: "local",
    async get(key) {
      return read(key);
    },
    async set(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
      } catch {
        /* storage full or blocked: data lives for this visit only */
      }
      (listeners.get(key) || []).forEach((fn) => fn(value));
    },
    async remove(key) {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        /* ignore */
      }
    },
    async list(kind) {
      const out = [];
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k?.startsWith(prefix)) continue;
          const v = read(k.slice(prefix.length));
          if (v?.kind === kind) out.push({ key: k.slice(prefix.length), ...v });
        }
      } catch {
        /* ignore */
      }
      return out;
    },
    watch(key, fn) {
      const arr = listeners.get(key) || [];
      arr.push(fn);
      listeners.set(key, arr);
      return () =>
        listeners.set(
          key,
          (listeners.get(key) || []).filter((f) => f !== fn),
        );
    },
  };
}

function dbStore(db, userId, app) {
  const root = db.doc(`data/users/${userId}/${app}`);
  const kv = root.collection("kv");
  return {
    kind: "db",
    async get(key) {
      const snap = await kv.doc(key).get();
      return snap.exists ? snap.data() : null;
    },
    async set(key, value) {
      // Values are plain JSON; clone so frozen snapshot data is never mutated.
      const body = JSON.parse(JSON.stringify(value));
      return queued(key, () => kv.doc(key).set(body));
    },
    async remove(key) {
      return queued(key, () => kv.doc(key).delete());
    },
    async list(kind) {
      const snap = await kv.where("kind", "==", kind).get();
      return snap.docs.map((d) => ({ key: d.id, ...d.data() }));
    },
    watch(key, fn) {
      return kv.doc(key).onSnapshot(
        (s) => fn(s.exists ? s.data() : null),
        () => {},
      );
    },
  };
}

/**
 * Open the best available store. Resolves within ~10 s even if Claude never answers.
 * @param {string} app short app id, used as the folder name
 */
export async function openStore(app) {
  const claudeApi = typeof window !== "undefined" ? window.claude : undefined;
  if (!claudeApi?.use) return localStore(app);
  try {
    const [db, user] = await Promise.all([claudeApi.use("db"), claudeApi.use("user")]);
    const id = db && user ? await user.id() : null;
    if (db && id) return dbStore(db, id, app);
  } catch {
    /* fall through */
  }
  return localStore(app);
}

export const _test = { localStore };
