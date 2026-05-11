export const WORKSPACE_AUTOSAVE_DELAY_MS = 900;
export const WORKSPACE_AUTOSAVE_ID = "current";

const WORKSPACE_DB_NAME = "fulldome-workspace-state";
const WORKSPACE_DB_STORE = "snapshots";

export function createWorkspaceSessionRepository({
  dbName = WORKSPACE_DB_NAME,
  storeName = WORKSPACE_DB_STORE,
  autosaveId = WORKSPACE_AUTOSAVE_ID,
  windowRef = window,
} = {}) {
  let dbPromise = null;
  let autosaveTimer = null;
  let saveInFlight = false;
  let queuedReason = null;
  let hydrating = false;

  function isHydrating() {
    return hydrating;
  }

  function isSaveInFlight() {
    return saveInFlight;
  }

  function cancelScheduledAutosave() {
    if (!autosaveTimer) return;
    windowRef.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    queuedReason = null;
  }

  function scheduleAutosave(reason = "auto", delay = WORKSPACE_AUTOSAVE_DELAY_MS, saveNow) {
    if (hydrating) return;
    if (typeof saveNow !== "function") {
      throw new TypeError("Workspace autosave requires a save callback.");
    }
    cancelScheduledAutosave();
    queuedReason = reason;
    autosaveTimer = windowRef.setTimeout(() => {
      const queued = queuedReason || reason;
      autosaveTimer = null;
      queuedReason = null;
      saveNow(queued);
    }, delay);
  }

  async function saveSnapshot(reason, createSnapshot, options = {}) {
    const { onStateChange, scheduleQueuedSave } = options;
    if (hydrating) return null;
    cancelScheduledAutosave();
    if (saveInFlight) {
      queuedReason = reason;
      onStateChange?.();
      return null;
    }

    saveInFlight = true;
    onStateChange?.();
    try {
      const snapshot = await createSnapshot(reason);
      const db = await openDb();
      await idbPut(db, storeName, snapshot);
      return snapshot;
    } finally {
      saveInFlight = false;
      const queued = queuedReason;
      queuedReason = null;
      if (queued && !hydrating && typeof scheduleQueuedSave === "function") {
        scheduleAutosave(queued, 300, scheduleQueuedSave);
      }
      onStateChange?.();
    }
  }

  async function loadSnapshot() {
    const db = await openDb();
    return idbGet(db, storeName, autosaveId);
  }

  async function deleteSnapshot() {
    const db = await openDb();
    await idbDelete(db, storeName, autosaveId);
  }

  async function withHydration(task) {
    hydrating = true;
    try {
      return await task();
    } finally {
      hydrating = false;
    }
  }

  function openDb() {
    if (!("indexedDB" in windowRef)) {
      return Promise.reject(new Error("IndexedDB is not available in this browser."));
    }
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = windowRef.indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Could not open workspace database."));
    });
    return dbPromise;
  }

  return {
    isHydrating,
    isSaveInFlight,
    scheduleAutosave,
    saveSnapshot,
    loadSnapshot,
    deleteSnapshot,
    withHydration,
  };
}

function idbPut(db, storeName, value) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db, storeName, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}
