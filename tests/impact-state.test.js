import test from "node:test";
import assert from "node:assert/strict";
import {
  claimState,
  combatOutcome,
  expectedCards,
  impactFormula,
  isLeaseExpired,
  pendingState,
  validateImpactInput,
  validateRoll
} from "../scripts/impact/impact-state.js";

test("validates editable impact bounds and canonical formulas", () => {
  assert.equal(validateImpactInput({ dice: 1, additionalImpact: -100 }).ok, true);
  assert.equal(validateImpactInput({ dice: 20, additionalImpact: 100 }).ok, true);
  assert.equal(validateImpactInput({ dice: 0, additionalImpact: 0 }).ok, false);
  assert.equal(validateImpactInput({ dice: 21, additionalImpact: 0 }).ok, false);
  assert.equal(validateImpactInput({ dice: 2, additionalImpact: 101 }).ok, false);
  assert.equal(validateImpactInput({ dice: 2.5, additionalImpact: 0 }).ok, false);
  assert.equal(impactFormula(3, 0), "3d6");
  assert.equal(impactFormula(3, 7), "3d6 + 7");
  assert.equal(impactFormula(3, -7), "3d6 - 7");
});

test("derives only the selected HM3 matrix outcome", () => {
  const outcome = { atkDice: 2, defDice: 1 };
  const config = {
    meleeCombatTable: { counterstrike: { "ms:cs": outcome } },
    missileCombatTable: { ignore: { ms: { atkDice: 3 } } }
  };
  assert.equal(combatOutcome(config, {
    attackType: "melee",
    defense: "counterstrike",
    tests: [
      { isCritical: false, isSuccess: true },
      { isCritical: true, isSuccess: true }
    ]
  }), outcome);
  assert.equal(combatOutcome(config, {
    attackType: "missile",
    defense: "ignore",
    tests: [{ isCritical: false, isSuccess: true }]
  }).atkDice, 3);
});

test("creates independent counterstrike card slots", () => {
  const cards = expectedCards({ defense: "counterstrike" }, { atkDice: 2, defDice: 3 });
  assert.deepEqual(cards, [
    { side: "attack", matrixDice: 2, matrixResult: "A*2" },
    { side: "counterstrike", matrixDice: 3, matrixResult: "D*3" }
  ]);
  assert.deepEqual(expectedCards({ defense: "counterstrike" }, { atkDice: 0, defDice: 1 }).map((c) => c.matrixDice), [0, 1]);
  assert.deepEqual(expectedCards({ defense: "counterstrike" }, { atkDice: 0, defDice: 0 }).map((c) => c.matrixDice), [0, 0]);
});

test("validates serialized d6 results and rejects tampering", () => {
  const roll = {
    formula: "3d6 - 2",
    total: 10,
    dice: [{ faces: 6, results: [{ result: 3 }, { result: 4 }, { result: 5 }] }]
  };
  assert.deepEqual(validateRoll(roll, { dice: 3, additionalImpact: -2 }), {
    ok: true,
    errors: [],
    values: [3, 4, 5],
    dice: 3,
    additionalImpact: -2
  });
  assert.equal(validateRoll({ ...roll, total: 11 }, { dice: 3, additionalImpact: -2 }).ok, false);
  assert.equal(validateRoll({ ...roll, formula: "4d6 - 2" }, { dice: 3, additionalImpact: -2 }).ok, false);
});

test("expires a rolling lease back to pending without changing the nonce", () => {
  const original = { schema: 1, status: "pending", nonce: "nonce-1", striker: {}, target: {} };
  const claimed = claimState(original, { claimId: "claim-1", userId: "user-1", now: 1_000 });
  assert.equal(isLeaseExpired(claimed, claimed.claim.expiresAt - 1), false);
  assert.equal(isLeaseExpired(claimed, claimed.claim.expiresAt), true);
  const restored = pendingState(claimed);
  assert.equal(restored.status, "pending");
  assert.equal(restored.nonce, "nonce-1");
  assert.equal(restored.claim, null);
});
