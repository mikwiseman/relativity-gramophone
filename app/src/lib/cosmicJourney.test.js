import test from "node:test";
import assert from "node:assert/strict";

import { IDLE_JOURNEY, canLeave, nextJourneyState } from "./cosmicJourney.js";

test("a journey begins and closes the way out while it is in flight", () => {
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "neighborhood" });
  assert.equal(flying.journeyTarget, "neighborhood");
  assert.equal(canLeave(flying), false, "you cannot leave while you are leaving");
});

test("arriving where you were sent opens the way out and names the place", () => {
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "galaxy" });
  const arrived = nextJourneyState(flying, { type: "settled", targetId: "galaxy" });
  assert.equal(arrived.journeyTarget, null);
  assert.equal(arrived.arrivalTarget, "galaxy");
  assert.equal(canLeave(arrived), true);
});

test("touching a star mid-flight ends the journey instead of stranding the player", () => {
  // The failure this test exists for: FLY starts a camera flight of a few
  // seconds, the stars it flies towards are tappable the whole way, and
  // touching one sends the camera to that system instead. The original journey
  // can then never report that it settled — so before this, FLY and STARS
  // stayed disabled and the headline read "FLYING TO NEARBY STARS" while the
  // player stood inside a system. The only escape was reloading the page.
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "neighborhood" });
  const visiting = nextJourneyState(flying, { type: "superseded" });
  assert.equal(visiting.journeyTarget, null);
  assert.equal(canLeave(visiting), true, "the player must always be able to leave a system");
});

test("an arrival for a journey the player has abandoned is ignored", () => {
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "neighborhood" });
  const visiting = nextJourneyState(flying, { type: "superseded" });
  const stale = nextJourneyState(visiting, { type: "settled", targetId: "neighborhood" });
  assert.deepEqual(stale, IDLE_JOURNEY, "a late arrival must not re-open a banner");
});

test("an arrival for a different destination than the one in flight is ignored", () => {
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "galaxy" });
  const other = nextJourneyState(flying, { type: "settled", targetId: "neighborhood" });
  assert.equal(other.journeyTarget, "galaxy", "the journey the player asked for still stands");
  assert.equal(other.arrivalTarget, null);
});

test("taking the camera by hand ends both the flight and the arrival banner", () => {
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "galaxy" });
  const arrived = nextJourneyState(flying, { type: "settled", targetId: "galaxy" });
  assert.deepEqual(nextJourneyState(arrived, { type: "manual" }), IDLE_JOURNEY);
  assert.deepEqual(nextJourneyState(flying, { type: "manual" }), IDLE_JOURNEY);
});

test("the arrival banner expires without re-opening a journey", () => {
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "galaxy" });
  const arrived = nextJourneyState(flying, { type: "settled", targetId: "galaxy" });
  const quiet = nextJourneyState(arrived, { type: "arrival-expired" });
  assert.deepEqual(quiet, IDLE_JOURNEY);
});

test("a new journey supersedes one already in flight", () => {
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "neighborhood" });
  const again = nextJourneyState(flying, { type: "travel", targetId: "galaxy" });
  assert.equal(again.journeyTarget, "galaxy");
  assert.equal(again.arrivalTarget, null);
});

test("a reset returns to rest from any state", () => {
  const flying = nextJourneyState(IDLE_JOURNEY, { type: "travel", targetId: "galaxy" });
  assert.deepEqual(nextJourneyState(flying, { type: "reset" }), IDLE_JOURNEY);
});

test("an unnamed transition is an error, never a silent no-op", () => {
  assert.throws(() => nextJourneyState(IDLE_JOURNEY, { type: "wandered" }), /Unknown journey event/);
  assert.throws(() => nextJourneyState(IDLE_JOURNEY, null), /needs an event with a type/);
  assert.throws(() => nextJourneyState(IDLE_JOURNEY, { type: "travel" }), /needs a destination/);
});
