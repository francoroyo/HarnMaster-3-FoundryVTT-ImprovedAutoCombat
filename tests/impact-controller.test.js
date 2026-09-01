import test from "node:test";
import assert from "node:assert/strict";
import { ImpactController } from "../scripts/impact/impact-controller.js";

const TEMPLATE = `<div>Attack Impact <button data-action="injury" data-impact="{{totalImpact}}">Injury</button></div>`;
const CARD = (impact) => `<div class="hm3 chat-card item-card"><h3>Attack Result</h3>
<div class="card-content"><div class="flexcol flex-center"><span>Attack Impact (Base + Roll):</span><span>4 + (${impact - 4}) = ${impact}</span></div></div>
<div class="card-buttons"><button data-action="injury" data-visible-actor-id="def-actor" data-token-id="def-token" data-atk-token-id="atk-token" data-attack-Weapon="Sword" data-aim="Mid" data-aspect="Edged" data-impact="${impact}">Calculate Defender Injury</button><button data-action="stumble">Stumble</button></div></div>`;

function counterstrikeCard({ side, dice, baseImpact }) {
  const counter = side === "counterstrike";
  const title = counter ? "Counterstrike Result" : "Attack Result";
  const strikerToken = counter ? "def-token" : "atk-token";
  const targetToken = counter ? "atk-token" : "def-token";
  const targetActor = counter ? "atk-actor" : "def-actor";
  const weapon = counter ? "Axe" : "Sword";
  const other = `<button data-action="fumble">Fumble</button>`;
  if (!dice) return `<div class="hm3 chat-card item-card"><h3>${title}</h3><p>Miss.</p><div class="card-buttons">${other}</div></div>`;
  const total = baseImpact + dice;
  return `<div class="hm3 chat-card item-card"><h3>${title}</h3>
  <div class="card-content"><div class="flexcol flex-center"><span>Attack Impact (Base + Roll):</span><span>${baseImpact} + (${dice}) = ${total}</span></div></div>
  <div class="card-buttons"><button data-action="injury" data-visible-actor-id="${targetActor}" data-token-id="${targetToken}" data-atk-token-id="${strikerToken}" data-attack-Weapon="${weapon}" data-aim="Mid" data-aspect="Edged" data-impact="${total}">Calculate Injury</button>${other}</div></div>`;
}

class TestCollection extends Array {
  get(id) { return this.find((entry) => entry.id === id) ?? null; }
}

function assignPath(target, path, value) {
  const parts = path.split(".");
  let current = target;
  for (const part of parts.slice(0, -1)) current = current[part] ??= {};
  current[parts.at(-1)] = value;
}

class TestMessage {
  constructor(data = {}) {
    Object.assign(this, data);
    this.flags ??= {};
    this.rolls ??= [];
  }
  updateSource(changes) {
    for (const [key, value] of Object.entries(changes)) key.includes(".") ? assignPath(this, key, value) : this[key] = value;
  }
  async update(changes) {
    this.updateSource(changes);
    return this;
  }
  getFlag(namespace, key) { return this.flags?.[namespace]?.[key] ?? null; }
  canUserModify(user) { return this.modifiableBy?.includes(user.id) ?? false; }
}

function makeHooks() {
  const callbacks = new Map();
  const calls = [];
  return {
    callbacks,
    calls,
    on(name, callback) {
      const list = callbacks.get(name) ?? [];
      list.push(callback);
      callbacks.set(name, list);
      return callback;
    },
    off(name, callback) {
      callbacks.set(name, (callbacks.get(name) ?? []).filter((entry) => entry !== callback));
    },
    callAll(name, ...args) { calls.push([name, ...args]); },
    async invoke(name, ...args) {
      for (const callback of callbacks.get(name) ?? []) await callback(...args);
    }
  };
}

function setupEnvironment() {
  const saved = Object.fromEntries(["game", "Hooks", "CONFIG", "CONST", "Roll", "libWrapper", "document", "canvas", "foundry", "ui"]
    .map((key) => [key, globalThis[key]]));
  const hooks = makeHooks();
  const listeners = new Map();
  const rolls = [];

  class TestRoll {
    constructor(formula) {
      this.formula = formula;
      this._formula = formula;
      this.dice = [];
      this.total = null;
    }
    async evaluate(options = {}) {
      const match = /^(\d+)d6(?:\s*([+-])\s*(\d+))?$/.exec(this.formula);
      if (!match) throw new Error(`Unexpected formula ${this.formula}`);
      const count = Number(match[1]);
      const modifier = match[2] ? Number(`${match[2]}${match[3]}`) : 0;
      const value = options.minimize ? 1 : 4;
      const values = Array.from({ length: count }, () => value);
      this.dice = [{ faces: 6, results: values.map((result) => ({ result })), values }];
      this.total = values.reduce((sum, result) => sum + result, 0) + modifier;
      rolls.push({ formula: this.formula, minimize: Boolean(options.minimize), total: this.total });
      return this;
    }
    toJSON() {
      return { formula: this.formula, total: this.total, dice: this.dice };
    }
    static fromData(data) { return data; }
  }

  const user = { id: "player", active: true, isGM: false };
  const actor = {
    id: "atk-actor",
    uuid: "Actor.atk-actor",
    isOwner: true,
    testUserPermission(checkUser) { return checkUser.id === user.id; }
  };
  const defender = { id: "def-actor", uuid: "Actor.def-actor", isOwner: false };
  const tokens = new TestCollection(
    { id: "atk-token", actor, document: { uuid: "Scene.scene.Token.atk-token" } },
    { id: "def-token", actor: defender, document: { uuid: "Scene.scene.Token.def-token" } }
  );
  const users = new TestCollection(user);
  const messages = new TestCollection();
  const actors = new TestCollection(actor, defender);
  const testResults = [
    { isCritical: false, isSuccess: true },
    { isCritical: false, isSuccess: false }
  ];
  class DiceHM3 {
    static async rollTest() { return testResults.shift(); }
  }
  const game = {
    user,
    users,
    actors,
    messages,
    socket: { on() {}, emit() {} },
    hm3: { DiceHM3, macros: {} }
  };

  const originals = new Map();
  const libWrapper = {
    register(_module, target, wrapper) {
      if (target === "game.hm3.DiceHM3.rollTest") {
        const original = DiceHM3.rollTest;
        originals.set(target, original);
        DiceHM3.rollTest = function (...args) { return wrapper.call(this, original.bind(this), ...args); };
      } else {
        const original = TestRoll.prototype.evaluate;
        originals.set(target, original);
        TestRoll.prototype.evaluate = function (...args) { return wrapper.call(this, original.bind(this), ...args); };
      }
    },
    unregister(_module, target) {
      if (target === "game.hm3.DiceHM3.rollTest" && originals.has(target)) DiceHM3.rollTest = originals.get(target);
      if (target === "Roll.prototype.evaluate" && originals.has(target)) TestRoll.prototype.evaluate = originals.get(target);
    }
  };
  const config = {
    sounds: { dice: "dice.wav" },
    HM3: {
      meleeCombatTable: {
        dodge: { "ms:mf": { atkDice: 1 } },
        block: {},
        ignore: {},
        counterstrike: {}
      },
      missileCombatTable: { dodge: {}, block: {}, ignore: {} }
    }
  };

  globalThis.game = game;
  globalThis.Hooks = hooks;
  globalThis.CONFIG = config;
  globalThis.CONST = { CHAT_MESSAGE_STYLES: { OTHER: 0, ROLL: 5 }, DOCUMENT_OWNERSHIP_LEVELS: { OWNER: 3 } };
  globalThis.Roll = TestRoll;
  globalThis.libWrapper = libWrapper;
  globalThis.canvas = { scene: { tokens: { get: (id) => ({ object: tokens.get(id) }) } }, tokens: { get: (id) => tokens.get(id) } };
  globalThis.document = {
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name) { listeners.delete(name); },
    createElement() { return { className: "", innerHTML: "" }; }
  };
  globalThis.foundry = {
    utils: { randomID: (() => { let id = 0; return () => `id-${++id}`; })() },
    applications: { api: { DialogV2: { input: async () => ({ dice: 2, additionalImpact: -1 }) } } },
    audio: { AudioHelper: { play: async () => {} } }
  };
  globalThis.ui = { notifications: { warn() {}, error() {} } };

  game.hm3.macros.dodgeResume = async () => {
    await DiceHM3.rollTest({ diceSides: 100, diceNum: 1 });
    await DiceHM3.rollTest({ diceSides: 100, diceNum: 1 });
    const impact = await new TestRoll("1d6").evaluate();
    const message = new TestMessage({
      id: "message-1",
      content: CARD(4 + impact.total),
      rolls: [impact],
      sound: "dice.wav",
      style: 5,
      modifiableBy: [user.id]
    });
    await hooks.invoke("preCreateChatMessage", message, {
      content: message.content,
      rolls: message.rolls
    });
    messages.push(message);
    await hooks.invoke("createChatMessage", message);
    await new TestRoll("3d6").evaluate();
  };
  game.hm3.macros.blockResume = async () => {};
  game.hm3.macros.ignoreResume = async () => {};
  game.hm3.macros.meleeCounterstrikeResume = async () => {};

  return {
    game,
    hooks,
    listeners,
    rolls,
    DiceHM3,
    TestRoll,
    TestMessage,
    restore() {
      for (const [key, value] of Object.entries(saved)) {
        if (typeof value === "undefined") delete globalThis[key];
        else globalThis[key] = value;
      }
    }
  };
}

test("runs the deferred impact flow without consuming unrelated d6 rolls", async () => {
  const env = setupEnvironment();
  try {
    const controller = new ImpactController({
      game: env.game,
      hooks: env.hooks,
      logger: { error() {} },
      fetchTemplate: async () => ({ text: async () => TEMPLATE })
    });
    assert.equal(await controller.install(), true);

    const button = {
      dataset: {
        action: "dodge",
        atkTokenId: "atk-token",
        defTokenId: "def-token",
        weaponType: "melee",
        weapon: "Sword",
        effAml: "70",
        aim: "Mid",
        aspect: "Edged",
        impactMod: "4",
        currUser: "player"
      },
      disabled: false,
      isConnected: true,
      closest(selector) { return selector === ".hm3.chat-card" ? {} : null; }
    };
    await env.listeners.get("click")({
      target: { closest: () => button },
      preventDefault() {},
      stopImmediatePropagation() {}
    });

    const message = env.game.messages.get("message-1");
    const pending = controller.getState(message.id);
    assert.equal(pending.status, "pending");
    assert.equal(pending.matrixDice, 1);
    assert.equal(pending.baseImpact, 4);
    assert.deepEqual(message.rolls, []);
    assert.equal(message.sound, null);
    assert.match(message.content, /Roll Impact/);
    assert.match(message.content, /data-action="stumble"/);
    assert.deepEqual(env.rolls.slice(0, 2), [
      { formula: "1d6", minimize: true, total: 1 },
      { formula: "3d6", minimize: false, total: 12 }
    ]);

    const unauthorized = { id: "other-player", active: true, isGM: false };
    assert.equal(controller.canRoll(message.id, unauthorized), false);
    message.modifiableBy = [];
    assert.equal(controller.canRoll(message.id), false, "no message authority and no active GM must fail closed");
    message.modifiableBy = [env.game.user.id];

    const concurrent = await Promise.all([controller.openDialog(message.id), controller.openDialog(message.id)]);
    const resolved = concurrent.find(Boolean);
    assert.equal(concurrent.filter(Boolean).length, 1, "the first local claim must win");
    assert.equal(resolved.status, "resolved");
    assert.deepEqual(resolved.final.values, [4, 4]);
    assert.equal(resolved.final.additionalImpact, -1);
    assert.equal(resolved.final.total, 11);
    assert.equal(message.rolls[0].formula, "2d6 - 1");
    assert.equal(env.rolls.filter((entry) => entry.formula === "2d6 - 1").length, 1);
    assert.match(message.content, /data-action="injury"/);
    assert.match(message.content, /data-impact="11"/);
    assert.equal(controller.canRoll(message.id), false);
    assert.ok(env.hooks.calls.some(([name]) => name === "hm3-improved-autocombat.impactPending"));
    assert.ok(env.hooks.calls.some(([name]) => name === "hm3-improved-autocombat.impactResolved"));
  } finally {
    env.restore();
  }
});

test("associates all counterstrike outcomes with the correct striker", async () => {
  for (const outcome of [
    { atkDice: 0, defDice: 0 },
    { atkDice: 2, defDice: 0 },
    { atkDice: 0, defDice: 1 },
    { atkDice: 2, defDice: 1 }
  ]) {
    const env = setupEnvironment();
    try {
      globalThis.CONFIG.HM3.meleeCombatTable.counterstrike["ms:mf"] = outcome;
      env.game.hm3.macros.meleeCounterstrikeResume = async () => {
        await env.DiceHM3.rollTest({ diceSides: 100, diceNum: 1 });
        await env.DiceHM3.rollTest({ diceSides: 100, diceNum: 1 });
        const attackRoll = outcome.atkDice ? await new env.TestRoll(`${outcome.atkDice}d6`).evaluate() : null;
        const counterRoll = outcome.defDice ? await new env.TestRoll(`${outcome.defDice}d6`).evaluate() : null;
        for (const [index, entry] of [
          { side: "attack", dice: outcome.atkDice, baseImpact: 4, roll: attackRoll },
          { side: "counterstrike", dice: outcome.defDice, baseImpact: 6, roll: counterRoll }
        ].entries()) {
          const message = new env.TestMessage({
            id: `counter-${outcome.atkDice}-${outcome.defDice}-${index}`,
            content: counterstrikeCard(entry),
            rolls: entry.roll ? [entry.roll] : [],
            sound: entry.roll ? "dice.wav" : null,
            style: entry.roll ? 5 : 0,
            modifiableBy: [env.game.user.id]
          });
          await env.hooks.invoke("preCreateChatMessage", message, { content: message.content, rolls: message.rolls });
          env.game.messages.push(message);
          await env.hooks.invoke("createChatMessage", message);
        }
      };

      const controller = new ImpactController({
        game: env.game,
        hooks: env.hooks,
        logger: { error() {} },
        fetchTemplate: async () => ({ text: async () => TEMPLATE })
      });
      assert.equal(await controller.install(), true);
      const button = {
        dataset: {
          action: "counterstrike",
          atkTokenId: "atk-token",
          defTokenId: "def-token",
          weapon: "Sword",
          effAml: "70",
          aim: "Mid",
          aspect: "Edged",
          impactMod: "4",
          currUser: "player"
        },
        disabled: false,
        isConnected: true,
        closest(selector) { return selector === ".hm3.chat-card" ? {} : null; }
      };
      await env.listeners.get("click")({
        target: { closest: () => button },
        preventDefault() {},
        stopImmediatePropagation() {}
      });

      const states = env.game.messages.map((message) => controller.getState(message.id));
      assert.equal(Boolean(states[0]), outcome.atkDice > 0);
      assert.equal(Boolean(states[1]), outcome.defDice > 0);
      if (states[0]) {
        assert.equal(states[0].striker.actorId, "atk-actor");
        assert.equal(states[0].target.actorId, "def-actor");
        assert.equal(states[0].baseImpact, 4);
      }
      if (states[1]) {
        assert.equal(states[1].striker.actorId, "def-actor");
        assert.equal(states[1].target.actorId, "atk-actor");
        assert.equal(states[1].baseImpact, 6);
      }
    } finally {
      env.restore();
    }
  }
});

test("fails closed when the HM3 compatibility surface is unavailable", async () => {
  const env = setupEnvironment();
  try {
    delete env.game.hm3.macros.dodgeResume;
    const registeredBefore = env.listeners.size;
    const controller = new ImpactController({
      game: env.game,
      hooks: env.hooks,
      logger: { error() {} },
      fetchTemplate: async () => ({ text: async () => TEMPLATE })
    });
    assert.equal(await controller.install(), false);
    assert.equal(controller.diagnostics.installed, false);
    assert.match(controller.diagnostics.issues.join(" "), /dodgeResume/);
    assert.equal(env.listeners.size, registeredBefore);
  } finally {
    env.restore();
  }
});
