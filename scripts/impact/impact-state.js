import {
  IMPACT_FLAG,
  IMPACT_LEASE_MS,
  IMPACT_LIMITS,
  IMPACT_SCHEMA_VERSION,
  MODULE_ID
} from "../constants.js";

export const IMPACT_STATUSES = Object.freeze({
  PENDING: "pending",
  ROLLING: "rolling",
  RESOLVED: "resolved"
});

export function randomId() {
  return globalThis.foundry?.utils?.randomID?.() ?? globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function impactFlagPath() {
  return `flags.${MODULE_ID}.${IMPACT_FLAG}`;
}

export function getImpactState(message) {
  return message?.getFlag?.(MODULE_ID, IMPACT_FLAG)
    ?? message?.flags?.[MODULE_ID]?.[IMPACT_FLAG]
    ?? null;
}

export function cloneState(state) {
  if (!state) return null;
  if (globalThis.foundry?.utils?.deepClone) return foundry.utils.deepClone(state);
  return structuredClone(state);
}

export function makePendingState(data) {
  return {
    schema: IMPACT_SCHEMA_VERSION,
    status: IMPACT_STATUSES.PENDING,
    nonce: randomId(),
    striker: data.striker,
    target: data.target,
    weapon: data.weapon ?? "",
    aspect: data.aspect ?? "",
    aim: data.aim ?? "",
    attackType: data.attackType,
    defense: data.defense,
    matrixResult: data.matrixResult,
    matrixDice: Number(data.matrixDice),
    baseImpact: Number(data.baseImpact),
    injury: data.injury,
    final: null,
    claim: null,
    error: data.error ?? null
  };
}

export function validateImpactInput(input) {
  const dice = Number(input?.dice);
  const additionalImpact = Number(input?.additionalImpact);
  const errors = [];

  if (!Number.isInteger(dice) || dice < IMPACT_LIMITS.MIN_DICE || dice > IMPACT_LIMITS.MAX_DICE) {
    errors.push(`Dice must be an integer from ${IMPACT_LIMITS.MIN_DICE} to ${IMPACT_LIMITS.MAX_DICE}.`);
  }
  if (!Number.isInteger(additionalImpact)
    || additionalImpact < IMPACT_LIMITS.MIN_BONUS
    || additionalImpact > IMPACT_LIMITS.MAX_BONUS) {
    errors.push(`Additional impact must be an integer from ${IMPACT_LIMITS.MIN_BONUS} to ${IMPACT_LIMITS.MAX_BONUS}.`);
  }

  return Object.freeze({
    ok: errors.length === 0,
    dice,
    additionalImpact,
    errors: Object.freeze(errors)
  });
}

export function impactFormula(dice, additionalImpact) {
  const bonus = Number(additionalImpact);
  if (bonus > 0) return `${dice}d6 + ${bonus}`;
  if (bonus < 0) return `${dice}d6 - ${Math.abs(bonus)}`;
  return `${dice}d6`;
}

export function claimState(state, { claimId, userId, now = Date.now() }) {
  return {
    ...cloneState(state),
    status: IMPACT_STATUSES.ROLLING,
    claim: {
      id: claimId,
      userId,
      expiresAt: now + IMPACT_LEASE_MS
    }
  };
}

export function pendingState(state) {
  return {
    ...cloneState(state),
    status: IMPACT_STATUSES.PENDING,
    claim: null
  };
}

export function isLeaseExpired(state, now = Date.now()) {
  return state?.status === IMPACT_STATUSES.ROLLING
    && Number(state?.claim?.expiresAt) <= now;
}

export function resultCode(testResult) {
  if (!testResult || typeof testResult.isCritical !== "boolean" || typeof testResult.isSuccess !== "boolean") {
    return null;
  }
  return `${testResult.isCritical ? "c" : "m"}${testResult.isSuccess ? "s" : "f"}`;
}

export function combatOutcome(config, { attackType, defense, tests }) {
  const tableName = attackType === "missile" ? "missileCombatTable" : "meleeCombatTable";
  const table = config?.[tableName]?.[defense];
  if (!table) return null;
  const attack = resultCode(tests?.[0]);
  const defend = resultCode(tests?.[1]);
  if (!attack) return null;
  const key = defense === "ignore" ? attack : `${attack}:${defend}`;
  return table[key] ?? null;
}

export function expectedCards(context, outcome) {
  if (context.defense === "counterstrike") {
    return [
      { side: "attack", matrixDice: Number(outcome.atkDice ?? 0), matrixResult: `A*${Number(outcome.atkDice ?? 0)}` },
      { side: "counterstrike", matrixDice: Number(outcome.defDice ?? 0), matrixResult: `D*${Number(outcome.defDice ?? 0)}` }
    ];
  }
  return [{ side: "attack", matrixDice: Number(outcome.atkDice ?? 0), matrixResult: `A*${Number(outcome.atkDice ?? 0)}` }];
}

function normalizedFormula(formula) {
  return String(formula ?? "").replace(/\s+/g, "").toLowerCase();
}

export function validateRoll(roll, input) {
  const validated = validateImpactInput(input);
  if (!validated.ok) return { ok: false, errors: validated.errors, values: [] };

  const expected = normalizedFormula(impactFormula(validated.dice, validated.additionalImpact));
  const actual = normalizedFormula(roll?.formula ?? roll?._formula);
  const diceTerms = Array.from(roll?.dice ?? []);
  const values = diceTerms.flatMap((die) => Array.from(die?.results ?? []))
    .filter((result) => result?.active !== false)
    .map((result) => Number(result?.result));
  const validDice = diceTerms.length === 1
    && Number(diceTerms[0]?.faces) === 6
    && values.length === validated.dice
    && values.every((value) => Number.isInteger(value) && value >= 1 && value <= 6);
  const expectedTotal = values.reduce((sum, value) => sum + value, 0) + validated.additionalImpact;
  const errors = [];
  if (actual !== expected) errors.push("The returned roll formula does not match the granted formula.");
  if (!validDice) errors.push("The returned roll is not the granted number of d6 dice.");
  if (Number(roll?.total) !== expectedTotal) errors.push("The returned roll total does not match its die results.");
  return {
    ok: errors.length === 0,
    errors,
    values,
    dice: validated.dice,
    additionalImpact: validated.additionalImpact
  };
}
