export const MODULE_ID = "hm3-improved-autocombat";
export const SYSTEM_ID = "hm3";
export const MINIMUM_HM3_VERSION = "1.6.13";
export const API_VERSION = 2;
export const IMPACT_SCHEMA_VERSION = 1;
export const IMPACT_FLAG = "impact";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const IMPACT_LEASE_MS = 30_000;
export const IMPACT_LIMITS = Object.freeze({
  MIN_DICE: 1,
  MAX_DICE: 20,
  MIN_BONUS: -100,
  MAX_BONUS: 100
});

export const SETTINGS = Object.freeze({
  ENABLED: "enabled",
  DEBUG_LOGGING: "debugLogging"
});

export const MODULE_HOOKS = Object.freeze({
  READY: `${MODULE_ID}.ready`,
  WORKFLOW_EVENT: `${MODULE_ID}.workflowEvent`,
  IMPACT_PENDING: `${MODULE_ID}.impactPending`,
  IMPACT_RESOLVED: `${MODULE_ID}.impactResolved`
});

export const HM3_COMBAT_HOOKS = Object.freeze({
  MELEE_ATTACK: "hm3.onMeleeAttack",
  MISSILE_ATTACK: "hm3.onMissileAttack",
  COUNTERSTRIKE_RESOLVED: "hm3.onMeleeCounterstrikeResume",
  DODGE_RESOLVED: "hm3.onDodgeResume",
  BLOCK_RESOLVED: "hm3.onBlockResume",
  IGNORE_RESOLVED: "hm3.onIgnoreResume",
  INJURY_ROLL: "hm3.onInjuryRoll",
  SHOCK_ROLL: "hm3.onShockRoll",
  STUMBLE_ROLL: "hm3.onStumbleRoll",
  FUMBLE_ROLL: "hm3.onFumbleRoll"
});
