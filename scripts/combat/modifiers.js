const AIM_MODIFIERS = Object.freeze({
  high: -10,
  mid: 0,
  low: -10
});

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new TypeError(`${label} must be a finite number.`);
  }
  return number;
}

export function normalizeAimZone(aimZone = "mid") {
  const normalized = String(aimZone).trim().toLowerCase();
  if (!Object.hasOwn(AIM_MODIFIERS, normalized)) {
    throw new RangeError(`Unknown aim zone: ${aimZone}`);
  }
  return normalized;
}

export function aimModifier(aimZone = "mid") {
  return AIM_MODIFIERS[normalizeAimZone(aimZone)];
}

export function physicalPenaltyModifier(physicalPenalty = 0) {
  const penalty = finiteNumber(physicalPenalty, "physicalPenalty");
  if (penalty < 0) throw new RangeError("physicalPenalty cannot be negative.");
  return -5 * penalty;
}

export function outnumberingModifier(opponentCount = 1, { isDefense = false } = {}) {
  const opponents = finiteNumber(opponentCount, "opponentCount");
  if (!Number.isInteger(opponents) || opponents < 0) {
    throw new RangeError("opponentCount must be a non-negative integer.");
  }
  return isDefense ? -10 * Math.max(0, opponents - 1) : 0;
}

export function proneOpponentModifier(isProneOpponent = false) {
  return isProneOpponent ? 20 : 0;
}

/**
 * Calculate an unbounded EML candidate from explicit rule inputs.
 *
 * The HM3 system already derives many item EML values. Consumers must pass a
 * basic mastery value here and must not apply these modifiers twice.
 */
export function calculateEffectiveMasteryLevel({
  baseMastery,
  physicalPenalty = 0,
  specialModifier = 0,
  aimZone = "mid",
  opponentCount = 1,
  isDefense = false,
  isProneOpponent = false
}) {
  return finiteNumber(baseMastery, "baseMastery")
    + physicalPenaltyModifier(physicalPenalty)
    + finiteNumber(specialModifier, "specialModifier")
    + aimModifier(aimZone)
    + outnumberingModifier(opponentCount, { isDefense })
    + proneOpponentModifier(isProneOpponent);
}

