import test from "node:test";
import assert from "node:assert/strict";
import {
  makePendingCard,
  replaceImpactPanel
} from "../scripts/impact/impact-card.js";
import { makePendingState } from "../scripts/impact/impact-state.js";

const HM3_CARD = `<div class="hm3 chat-card item-card"><h3>Attack Result</h3>
<div class="card-content"><div class="flexcol flex-center"><span class="label">Attack Impact (Base + Roll):</span><span class="value">4 + (1 + 1) = <strong>6</strong></span></div></div>
<div class="card-buttons"><button data-action="injury" data-visible-actor-id="target-actor" data-token-id="target-token" data-atk-token-id="striker-token" data-attack-Weapon="Sword" data-aim="Mid" data-aspect="Edged" data-impact="6">Calculate Target Injury</button><button data-action="fumble">Fumble</button></div></div>`;

function descriptor() {
  return {
    placeholderTotal: 2,
    matrixDice: 2,
    matrixResult: "A*2",
    striker: { actorId: "striker-actor", tokenId: "striker-token" },
    target: { actorId: "target-actor", tokenId: "target-token" },
    weapon: "Sword",
    aim: "Mid",
    aspect: "Edged",
    attackType: "melee",
    defense: "dodge",
    stateFactory: ({ baseImpact, injury }) => makePendingState({
      striker: { actorId: "striker-actor", tokenId: "striker-token" },
      target: { actorId: "target-actor", tokenId: "target-token" },
      weapon: "Sword",
      aim: "Mid",
      aspect: "Edged",
      attackType: "melee",
      defense: "dodge",
      matrixDice: 2,
      matrixResult: "A*2",
      baseImpact,
      injury
    })
  };
}

test("turns HM3 impact and injury output into a pending roll card", () => {
  const result = makePendingCard(HM3_CARD, descriptor());
  assert.equal(result.state.baseImpact, 4);
  assert.match(result.content, /Roll Impact/);
  assert.match(result.content, /A\*2/);
  assert.doesNotMatch(result.content, /Attack Impact \(Base \+ Roll\)/);
  assert.doesNotMatch(result.content, /data-action="injury"/);
  assert.match(result.content, /data-action="fumble"/);
});

test("resolved panel restores an HM3-compatible injury action with exact total", () => {
  const pending = makePendingCard(HM3_CARD, descriptor());
  const resolved = {
    ...pending.state,
    status: "resolved",
    final: { dice: 3, additionalImpact: -2, formula: "3d6 - 2", values: [4, 5, 2], total: 13 }
  };
  const content = replaceImpactPanel(pending.content, resolved);
  assert.match(content, /4 \+ \(4 \+ 5 \+ 2 - 2\) = 13/);
  assert.match(content, /data-action="injury"/);
  assert.match(content, /data-impact="13"/);
  assert.doesNotMatch(content, /Roll Impact/);
});

