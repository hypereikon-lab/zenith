export const WORKSPACE_AUTOSAVE_DELAY_MS = 900;
export const WORKSPACE_AUTOSAVE_ID = "current";

const WORKSPACE_DB_NAME = "fulldome-workspace-state";
const WORKSPACE_DB_STORE = "snapshots";
const WORKSPACE_ACTIVE_SESSION_KEY = "fulldome-workspace-active-session";
type SessionRepositoryOptions = {
  dbName?: string;
  storeName?: string;
  autosaveId?: string;
  activeSessionKey?: string;
  windowRef?: Window;
};
export type WorkspaceSessionRecord = {
  id?: string;
  savedAt?: string;
  reason?: string;
  session?: {
    id?: string;
    name?: string;
  };
  media?: {
    name?: string;
  };
  seedance?: {
    outputs?: unknown[];
  };
};
export type WorkspaceSessionSummary = {
  id: string;
  name: string;
  savedAt: string;
  reason: string;
  sourceName: string;
  videoCount: number;
};
type SaveSnapshotOptions = {
  onStateChange?: () => void;
  scheduleQueuedSave?: (reason: string) => unknown | Promise<unknown>;
};
type SnapshotFactory = (reason: string) => unknown | Promise<unknown>;

export function createWorkspaceSessionRepository({
  dbName = WORKSPACE_DB_NAME,
  storeName = WORKSPACE_DB_STORE,
  autosaveId = WORKSPACE_AUTOSAVE_ID,
  activeSessionKey = WORKSPACE_ACTIVE_SESSION_KEY,
  windowRef = window,
}: SessionRepositoryOptions = {}) {
  let dbPromise: Promise<IDBDatabase> | null = null;
  let autosaveTimer: number | null = null;
  let saveInFlight = false;
  let queuedReason: string | null = null;
  let hydrating = false;
  let activeSessionId = autosaveId;

  function isHydrating() {
    return hydrating;
  }

  function isSaveInFlight() {
    return saveInFlight;
  }

  function currentSessionId(): string {
    try {
      const stored = windowRef.localStorage?.getItem(activeSessionKey);
      if (stored) {
        activeSessionId = stored;
        return stored;
      }
    } catch {
      // Fall through to the in-memory active session.
    }
    return activeSessionId || autosaveId;
  }

  function setCurrentSessionId(id: string): void {
    const safeId = String(id || "").trim() || autosaveId;
    activeSessionId = safeId;
    try {
      windowRef.localStorage?.setItem(activeSessionKey, safeId);
    } catch {
      // Ignore storage failures; the in-memory action can still continue for this run.
    }
  }

  function createSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function cancelScheduledAutosave() {
    if (!autosaveTimer) return;
    windowRef.clearTimeout(autosaveTimer);
    autosaveTimer = null;
    queuedReason = null;
  }

  function scheduleAutosave(
    reason = "auto",
    delay = WORKSPACE_AUTOSAVE_DELAY_MS,
    saveNow: (reason: string) => unknown | Promise<unknown>,
  ) {
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

  async function saveSnapshot(reason: string, createSnapshot: SnapshotFactory, options: SaveSnapshotOptions = {}) {
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

  async function loadSnapshot(id = currentSessionId()) {
    const db = await openDb();
    return idbGet(db, storeName, id || autosaveId);
  }

  async function deleteSnapshot(id = currentSessionId()) {
    const db = await openDb();
    await idbDelete(db, storeName, id || autosaveId);
  }

  async function listSnapshots(): Promise<WorkspaceSessionSummary[]> {
    const db = await openDb();
    const snapshots = (await idbGetAll(db, storeName)) as WorkspaceSessionRecord[];
    return snapshots
      .filter((snapshot) => snapshot?.id)
      .map(sessionSummaryFromSnapshot)
      .sort((a, b) => (b.savedAt || "").localeCompare(a.savedAt || ""));
  }

  async function withHydration<T>(task: () => T | Promise<T>): Promise<T> {
    hydrating = true;
    try {
      return await task();
    } finally {
      hydrating = false;
    }
  }

  function openDb(): Promise<IDBDatabase> {
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
    currentSessionId,
    setCurrentSessionId,
    createSessionId,
    scheduleAutosave,
    saveSnapshot,
    loadSnapshot,
    deleteSnapshot,
    listSnapshots,
    withHydration,
  };
}

function sessionSummaryFromSnapshot(snapshot: WorkspaceSessionRecord): WorkspaceSessionSummary {
  const id = String(snapshot.id || WORKSPACE_AUTOSAVE_ID);
  const sessionId = String(snapshot.session?.id || id);
  return {
    id,
    name: String(
      snapshot.session?.name || (sessionId === WORKSPACE_AUTOSAVE_ID ? "Current session" : "Untitled session"),
    ),
    savedAt: String(snapshot.savedAt || ""),
    reason: String(snapshot.reason || ""),
    sourceName: String(snapshot.media?.name || ""),
    videoCount: Array.isArray(snapshot.seedance?.outputs) ? snapshot.seedance.outputs.length : 0,
  };
}

function idbPut(db: IDBDatabase, storeName: string, value: unknown): Promise<IDBValidKey> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).put(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function idbDelete(db: IDBDatabase, storeName: string, id: IDBValidKey): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = db.transaction(storeName, "readwrite").objectStore(storeName).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function idbGet(db: IDBDatabase, storeName: string, id: IDBValidKey): Promise<unknown | null> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

function idbGetAll(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}
