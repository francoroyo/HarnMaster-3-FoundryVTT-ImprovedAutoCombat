import test from "node:test";
import assert from "node:assert/strict";

import { CombatWorkflowTracker } from "../scripts/combat/workflow-tracker.js";

test("records immutable events and notifies subscribers", () => {
  let nextId = 0;
  const tracker = new CombatWorkflowTracker({
    now: () => 1234,
    idFactory: () => `event-${++nextId}`
  });
  const received = [];
  const unsubscribe = tracker.subscribe((event) => received.push(event));

  const event = tracker.record("attack.declared", { kind: "melee" });
  unsubscribe();
  tracker.record("attack.resolved", { defense: "dodge" });

  assert.deepEqual(event, {
    id: "event-1",
    type: "attack.declared",
    timestamp: 1234,
    detail: { kind: "melee" }
  });
  assert.equal(received.length, 1);
  assert.ok(Object.isFrozen(event));
  assert.ok(Object.isFrozen(event.detail));
});

test("keeps only the configured number of recent events", () => {
  let nextId = 0;
  const tracker = new CombatWorkflowTracker({
    maxEntries: 2,
    idFactory: () => String(++nextId)
  });

  tracker.record("one");
  tracker.record("two");
  tracker.record("three");

  assert.deepEqual(tracker.snapshot().map((event) => event.type), ["two", "three"]);
  tracker.clear();
  assert.deepEqual(tracker.snapshot(), []);
});

