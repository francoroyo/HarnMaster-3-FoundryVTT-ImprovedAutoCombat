import test from "node:test";
import assert from "node:assert/strict";

test("initializes and becomes ready in a compatible Foundry/HM3 environment", async () => {
  const onceCallbacks = new Map();
  const regularCallbacks = new Map();
  const calledHooks = [];
  const registeredSettings = [];
  const moduleRecord = {};

  globalThis.Hooks = {
    once(name, callback) {
      onceCallbacks.set(name, callback);
    },
    on(name, callback) {
      regularCallbacks.set(name, callback);
      return regularCallbacks.size;
    },
    off(name) {
      regularCallbacks.delete(name);
    },
    callAll(name, ...args) {
      calledHooks.push([name, ...args]);
    }
  };
  globalThis.game = {
    system: { id: "hm3", version: "1.6.13" },
    user: { isGM: true },
    modules: new Map([["hm3-improved-autocombat", moduleRecord]]),
    settings: {
      register(namespace, key) {
        registeredSettings.push([namespace, key]);
      },
      get(_namespace, key) {
        return key === "enabled";
      }
    },
    hm3: {
      macros: {
        weaponAttack() {},
        missileAttack() {}
      }
    }
  };
  globalThis.ui = { notifications: { error() {} } };
  globalThis.foundry = { utils: { isNewerVersion: () => false } };

  await import(`../scripts/main.js?smoke=${Date.now()}`);
  onceCallbacks.get("init")();
  await onceCallbacks.get("ready")();

  assert.deepEqual(registeredSettings, [
    ["hm3-improved-autocombat", "enabled"],
    ["hm3-improved-autocombat", "debugLogging"]
  ]);
  assert.equal(moduleRecord.api.version, 2);
  assert.equal(moduleRecord.api.diagnostics.ok, true);
  assert.equal(regularCallbacks.size, 10);
  assert.ok(calledHooks.some(([name]) => name === "hm3-improved-autocombat.ready"));
});
