export class StaleOperationError extends Error {
  constructor(message = "Operation result is no longer current.") {
    super(message);
    this.name = "StaleOperationError";
  }
}

export type OperationToken = Readonly<{
  id: string;
  scope: string;
  fingerprint: unknown;
  signal: AbortSignal;
}>;

type OperationEntry = {
  token: OperationToken;
  controller: AbortController;
};

export function isStaleOperationError(error: unknown): boolean {
  return error instanceof StaleOperationError || (error instanceof Error && error.name === "AbortError");
}

export class OperationManager {
  private sequence = 0;
  private active = new Map<string, OperationEntry>();

  start(scope: string, fingerprint: unknown): OperationToken {
    this.abort(scope, "Superseded by a newer operation.");
    const controller = new AbortController();
    const token = Object.freeze({
      id: `${scope}:${++this.sequence}`,
      scope,
      fingerprint,
      signal: controller.signal,
    });
    this.active.set(scope, { token, controller });
    return token;
  }

  abort(scope: string, reason = "Operation aborted."): void {
    const entry = this.active.get(scope);
    if (!entry) return;
    entry.controller.abort(new StaleOperationError(reason));
    this.active.delete(scope);
  }

  abortAll(reason = "Operations invalidated."): void {
    for (const scope of Array.from(this.active.keys())) {
      this.abort(scope, reason);
    }
  }

  isCurrent(token: OperationToken, fingerprint: unknown = token.fingerprint): boolean {
    const entry = this.active.get(token.scope);
    return Boolean(
      entry && entry.token.id === token.id && entry.token.fingerprint === fingerprint && !token.signal.aborted,
    );
  }

  assertCurrent(token: OperationToken, fingerprint: unknown = token.fingerprint): void {
    if (!this.isCurrent(token, fingerprint)) {
      throw new StaleOperationError();
    }
  }

  finish(token: OperationToken): void {
    const entry = this.active.get(token.scope);
    if (entry?.token.id === token.id) {
      this.active.delete(token.scope);
    }
  }
}
