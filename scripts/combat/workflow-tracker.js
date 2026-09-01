import { MODULE_HOOKS } from "../constants.js";

function defaultIdFactory() {
  return globalThis.crypto?.randomUUID?.()
    ?? `hm3iac-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A bounded, non-persistent event stream for one client session.
 * It records references supplied by Foundry/HM3 and never mutates them.
 */
export class CombatWorkflowTracker {
  #events = [];
  #listeners = new Set();

  constructor({ maxEntries = 100, now = () => Date.now(), idFactory = defaultIdFactory } = {}) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError("maxEntries must be a positive integer.");
    }
    this.maxEntries = maxEntries;
    this.now = now;
    this.idFactory = idFactory;
  }

  record(type, detail = {}) {
    if (!type) throw new TypeError("A workflow event type is required.");

    const event = Object.freeze({
      id: this.idFactory(),
      type: String(type),
      timestamp: this.now(),
      detail: Object.freeze({ ...detail })
    });

    this.#events.push(event);
    if (this.#events.length > this.maxEntries) this.#events.shift();

    for (const listener of this.#listeners) listener(event);
    globalThis.Hooks?.callAll?.(MODULE_HOOKS.WORKFLOW_EVENT, event);
    return event;
  }

  snapshot() {
    return Object.freeze([...this.#events]);
  }

  clear() {
    this.#events.length = 0;
  }

  subscribe(listener) {
    if (typeof listener !== "function") throw new TypeError("listener must be a function.");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}

