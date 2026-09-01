import test from "node:test";
import assert from "node:assert/strict";

import {
  aimModifier,
  calculateEffectiveMasteryLevel,
  normalizeAimZone,
  outnumberingModifier,
  physicalPenaltyModifier,
  proneOpponentModifier
} from "../scripts/combat/modifiers.js";

test("normalizes valid aim zones and applies their modifiers", () => {
  assert.equal(normalizeAimZone(" HIGH "), "high");
  assert.equal(aimModifier("high"), -10);
  assert.equal(aimModifier("mid"), 0);
  assert.equal(aimModifier("low"), -10);
  assert.throws(() => aimModifier("head"), RangeError);
});

test("calculates physical and outnumbering penalties", () => {
  assert.equal(physicalPenaltyModifier(3), -15);
  assert.equal(outnumberingModifier(3, { isDefense: true }), -20);
  assert.equal(outnumberingModifier(3, { isDefense: false }), 0);
  assert.throws(() => outnumberingModifier(1.5, { isDefense: true }), RangeError);
});

test("applies the prone opponent bonus", () => {
  assert.equal(proneOpponentModifier(true), 20);
  assert.equal(proneOpponentModifier(false), 0);
});

test("combines explicit modifier inputs without clamping", () => {
  assert.equal(calculateEffectiveMasteryLevel({
    baseMastery: 80,
    physicalPenalty: 2,
    specialModifier: -5,
    aimZone: "high",
    opponentCount: 3,
    isDefense: true,
    isProneOpponent: true
  }), 55);
});

