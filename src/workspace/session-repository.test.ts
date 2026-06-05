import { describe, expect, it } from "vitest";
import {
  WORKSPACE_AUTOSAVE_ID,
  WORKSPACE_STARTUP_DEFAULT_ID,
  createWorkspaceSessionRepository,
} from "./session-repository.js";

describe("createWorkspaceSessionRepository", () => {
  it("persists the active session id through localStorage", () => {
    const storage = new Map<string, string>();
    const windowRef = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    } as unknown as Window;

    const repository = createWorkspaceSessionRepository({ windowRef });
    expect(repository.currentSessionId()).toBe(WORKSPACE_AUTOSAVE_ID);

    repository.setCurrentSessionId("session-a");
    expect(repository.currentSessionId()).toBe("session-a");

    const nextRepository = createWorkspaceSessionRepository({ windowRef });
    expect(nextRepository.currentSessionId()).toBe("session-a");
  });

  it("keeps the active session in memory when localStorage is unavailable", () => {
    const windowRef = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    } as unknown as Window;

    const repository = createWorkspaceSessionRepository({ windowRef });
    expect(repository.currentSessionId()).toBe(WORKSPACE_AUTOSAVE_ID);

    repository.setCurrentSessionId("session-b");
    expect(repository.currentSessionId()).toBe("session-b");
  });

  it("persists and clears the startup default session id", () => {
    const storage = new Map<string, string>();
    const windowRef = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    } as unknown as Window;

    const repository = createWorkspaceSessionRepository({ windowRef });
    expect(repository.defaultSessionId()).toBe("");

    repository.setDefaultSessionId("session-default");
    expect(repository.defaultSessionId()).toBe("session-default");

    const nextRepository = createWorkspaceSessionRepository({ windowRef });
    expect(nextRepository.defaultSessionId()).toBe("session-default");

    nextRepository.clearDefaultSessionId();
    expect(nextRepository.defaultSessionId()).toBe("");
  });

  it("keeps the startup default slot separate from the active autosave slot", () => {
    const storage = new Map<string, string>();
    const windowRef = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    } as unknown as Window;

    const repository = createWorkspaceSessionRepository({ windowRef });
    repository.setCurrentSessionId(WORKSPACE_AUTOSAVE_ID);
    repository.setDefaultSessionId(WORKSPACE_STARTUP_DEFAULT_ID);

    expect(repository.currentSessionId()).toBe(WORKSPACE_AUTOSAVE_ID);
    expect(repository.defaultSessionId()).toBe(WORKSPACE_STARTUP_DEFAULT_ID);
    expect(WORKSPACE_STARTUP_DEFAULT_ID).not.toBe(WORKSPACE_AUTOSAVE_ID);
  });
});
