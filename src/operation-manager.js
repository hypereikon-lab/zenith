// @ts-check

export class StaleOperationError extends Error {
  constructor(message = "Operation result is no longer current.") {
    super(message);
    this.name = "StaleOperationError";
  }
}

export function isStaleOperationError(error) {
  return error instanceof StaleOperationError || error?.name === "AbortError";
}

export class OperationManager {
  constructor() {
    this.sequence = 0;
    this.active = new Map();
  }

  start(scope, fingerprint) {
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

  abort(scope, reason = "Operation aborted.") {
    const entry = this.active.get(scope);
    if (!entry) return;
    entry.controller.abort(new StaleOperationError(reason));
    this.active.delete(scope);
  }

  abortAll(reason = "Operations invalidated.") {
    for (const scope of Array.from(this.active.keys())) {
      this.abort(scope, reason);
    }
  }

  isCurrent(token, fingerprint = token.fingerprint) {
    const entry = this.active.get(token.scope);
    return Boolean(
      entry && entry.token.id === token.id && entry.token.fingerprint === fingerprint && !token.signal.aborted,
    );
  }

  assertCurrent(token, fingerprint = token.fingerprint) {
    if (!this.isCurrent(token, fingerprint)) {
      throw new StaleOperationError();
    }
  }

  finish(token) {
    const entry = this.active.get(token.scope);
    if (entry?.token.id === token.id) {
      this.active.delete(token.scope);
    }
  }
}
