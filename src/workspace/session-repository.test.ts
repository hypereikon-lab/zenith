import { describe, expect, it } from "vitest";
import { WORKSPACE_AUTOSAVE_ID, createWorkspaceSessionRepository } from "./session-repository.js";

describe("createWorkspaceSessionRepository", () => {
  it("persists the active session id through localStorage", () => {
    const storage = new Map<string, string>();
    const windowRef = {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
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
});
