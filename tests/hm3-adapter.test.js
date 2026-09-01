import test from "node:test";
import assert from "node:assert/strict";

import { Hm3Adapter } from "../scripts/integration/hm3-adapter.js";

function fixture() {
  const callbacks = new Map();
  const hooks = {
    on(name, callback) {
      callbacks.set(name, callback);
      return callbacks.size;
    },
    off(name) {
      callbacks.delete(name);
    }
  };
  const calls = [];
  const game = {
    system: { id: "hm3", version: "1.6.13" },
    settings: { get: () => true },
    hm3: {
      macros: {
        weaponAttack: (...args) => calls.push(["melee", ...args]),
        missileAttack: (...args) => calls.push(["missile", ...args])
      }
    }
  };
  const tracker = { record: (...args) => calls.push(["event", ...args]) };
  const logger = { debug() {} };
  return { callbacks, calls, game, hooks, tracker, logger };
}

test("validates and delegates to the HM3 macro API", () => {
  const context = fixture();
  const adapter = new Hm3Adapter(context);

  assert.equal(adapter.diagnostics().ok, true);
  adapter.startMeleeAttack({ item: { uuid: "Actor.a.Item.w" }, skipDialog: true, token: "token" });
  adapter.startMissileAttack({ item: "Actor.a.Item.m" });

  assert.deepEqual(context.calls[0], ["melee", "Actor.a.Item.w", true, "token", false]);
  assert.deepEqual(context.calls[1], ["missile", "Actor.a.Item.m", false, null, false]);
});

test("bridges HM3 combat lifecycle hooks into workflow events", () => {
  const context = fixture();
  const adapter = new Hm3Adapter(context);
  adapter.install();

  context.callbacks.get("hm3.onMeleeAttack")(
    { aim: "Mid" },
    { token: { id: "attacker" } },
    { id: "defender" },
    { uuid: "Actor.a.Item.w" }
  );

  assert.equal(adapter.diagnostics().installed, true);
  assert.equal(context.calls[0][0], "event");
  assert.equal(context.calls[0][1], "attack.declared");
  assert.equal(context.calls[0][2].attackerTokenId, "attacker");
  assert.equal(context.calls[0][2].defenderTokenId, "defender");
  adapter.uninstall();
  assert.equal(adapter.diagnostics().installed, false);
});

