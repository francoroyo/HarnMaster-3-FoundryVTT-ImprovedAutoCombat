import {
  HM3_COMBAT_HOOKS,
  MINIMUM_HM3_VERSION,
  MODULE_ID,
  SETTINGS,
  SYSTEM_ID
} from "../constants.js";

const REQUIRED_MACROS = Object.freeze(["weaponAttack", "missileAttack"]);

function documentId(document) {
  return document?.uuid ?? document?.id ?? null;
}

function tokenId(tokenLike) {
  return tokenLike?.token?.id ?? tokenLike?.id ?? null;
}

function attackDetail(kind, result, combatant, targetToken, weapon) {
  return {
    kind,
    result,
    attackerTokenId: tokenId(combatant),
    defenderTokenId: tokenId(targetToken),
    weaponId: documentId(weapon)
  };
}

function resolutionDetail(defense, result, attackerToken, defenderToken, weaponName) {
  return {
    defense,
    result,
    attackerTokenId: tokenId(attackerToken),
    defenderTokenId: tokenId(defenderToken),
    weaponName: weaponName ?? null
  };
}

export class Hm3Adapter {
  #registrations = [];

  constructor({ game, hooks, tracker, logger }) {
    this.game = game;
    this.hooks = hooks;
    this.tracker = tracker;
    this.logger = logger;
  }

  diagnostics() {
    const issues = [];
    const currentSystemId = this.game?.system?.id ?? null;
    const currentSystemVersion = this.game?.system?.version ?? null;
    const macros = this.game?.hm3?.macros;

    if (currentSystemId !== SYSTEM_ID) {
      issues.push(`Expected system '${SYSTEM_ID}', found '${currentSystemId ?? "none"}'.`);
    }

    const isNewerVersion = globalThis.foundry?.utils?.isNewerVersion;
    if (currentSystemVersion && typeof isNewerVersion === "function"
      && isNewerVersion(MINIMUM_HM3_VERSION, currentSystemVersion)) {
      issues.push(`HarnMaster 3 ${currentSystemVersion} is older than ${MINIMUM_HM3_VERSION}.`);
    }

    if (!macros) {
      issues.push("game.hm3.macros is unavailable.");
    } else {
      for (const macro of REQUIRED_MACROS) {
        if (typeof macros[macro] !== "function") issues.push(`game.hm3.macros.${macro} is unavailable.`);
      }
    }

    return Object.freeze({
      ok: issues.length === 0,
      enabled: Boolean(this.game?.settings?.get(MODULE_ID, SETTINGS.ENABLED)),
      installed: this.#registrations.length > 0,
      systemId: currentSystemId,
      systemVersion: currentSystemVersion,
      issues: Object.freeze(issues)
    });
  }

  install() {
    if (this.#registrations.length) return;

    const registrations = [
      [HM3_COMBAT_HOOKS.MELEE_ATTACK, (result, combatant, target, weapon) =>
        this.tracker.record("attack.declared", attackDetail("melee", result, combatant, target, weapon))],
      [HM3_COMBAT_HOOKS.MISSILE_ATTACK, (result, combatant, target, weapon) =>
        this.tracker.record("attack.declared", attackDetail("missile", result, combatant, target, weapon))],
      [HM3_COMBAT_HOOKS.COUNTERSTRIKE_RESOLVED, (result, attacker, defender, weaponName) =>
        this.tracker.record("attack.resolved", resolutionDetail("counterstrike", result, attacker, defender, weaponName))],
      [HM3_COMBAT_HOOKS.DODGE_RESOLVED, (result, attacker, defender, _kind, weaponName) =>
        this.tracker.record("attack.resolved", resolutionDetail("dodge", result, attacker, defender, weaponName))],
      [HM3_COMBAT_HOOKS.BLOCK_RESOLVED, (result, attacker, defender, _kind, weaponName) =>
        this.tracker.record("attack.resolved", resolutionDetail("block", result, attacker, defender, weaponName))],
      [HM3_COMBAT_HOOKS.IGNORE_RESOLVED, (result, attacker, defender, _kind, weaponName) =>
        this.tracker.record("attack.resolved", resolutionDetail("ignore", result, attacker, defender, weaponName))],
      [HM3_COMBAT_HOOKS.INJURY_ROLL, (actor, result, rollData) =>
        this.tracker.record("injury.rolled", { actorId: documentId(actor), result, rollData })],
      [HM3_COMBAT_HOOKS.SHOCK_ROLL, (actor, result, rollData) =>
        this.tracker.record("shock.rolled", { actorId: documentId(actor), result, rollData })],
      [HM3_COMBAT_HOOKS.STUMBLE_ROLL, (actor, result, rollData) =>
        this.tracker.record("stumble.rolled", { actorId: documentId(actor), result, rollData })],
      [HM3_COMBAT_HOOKS.FUMBLE_ROLL, (actor, result, rollData) =>
        this.tracker.record("fumble.rolled", { actorId: documentId(actor), result, rollData })]
    ];

    for (const [hookName, callback] of registrations) {
      this.#registrations.push([hookName, this.hooks.on(hookName, callback)]);
    }
    this.logger.debug("Installed HM3 combat hook bridge.");
  }

  uninstall() {
    for (const [hookName, hookId] of this.#registrations) this.hooks.off(hookName, hookId);
    this.#registrations.length = 0;
  }

  startMeleeAttack({ item = null, skipDialog = false, token = null, forceAllow = false } = {}) {
    return this.game.hm3.macros.weaponAttack(item?.uuid ?? item, skipDialog, token, forceAllow);
  }

  startMissileAttack({ item = null, skipDialog = false, token = null, forceAllow = false } = {}) {
    return this.game.hm3.macros.missileAttack(item?.uuid ?? item, skipDialog, token, forceAllow);
  }
}

