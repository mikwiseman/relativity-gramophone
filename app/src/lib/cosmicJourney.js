/**
 * The state of a journey between cosmic scales.
 *
 * One value drives three things at once: the headline the player reads, the
 * FLY button, and the HOME/STARS button. Both buttons are disabled while a
 * journey is in flight, which is right — you cannot leave while you are
 * leaving. It also means that a journey which is *abandoned* rather than
 * completed must still end, or the player is left holding two dead buttons and
 * a headline that says they are flying somewhere they already are.
 *
 * That is not hypothetical. Pressing FLY starts a camera flight lasting a few
 * seconds, and the stars it is flying towards are tappable the whole way. A
 * child who presses FLY and then immediately touches a star supersedes the
 * flight — and before this module existed, the pending arrival was discarded
 * without ever telling the interface, so FLY and STARS stayed disabled until
 * the page was reloaded.
 *
 * So every way a journey can end has a name here, and the reducer is pure and
 * tested rather than spread across a component.
 */

/** No journey, no arrival banner: the resting state. */
export const IDLE_JOURNEY = Object.freeze({ journeyTarget: null, arrivalTarget: null });

/**
 * How a journey can end:
 * - `travel`      a new journey begins, superseding anything already running
 * - `settled`     the camera arrived at the target it was sent to
 * - `superseded`  the camera was sent somewhere else instead (entering a system)
 * - `manual`      the player took the camera themselves
 * - `arrival-expired` the "YOU ARE IN ..." banner has had its time
 * - `reset`       a new composition; everything starts again
 */
export function nextJourneyState(state = IDLE_JOURNEY, event) {
  const current = {
    journeyTarget: state?.journeyTarget ?? null,
    arrivalTarget: state?.arrivalTarget ?? null,
  };
  if (!event || typeof event.type !== "string") {
    throw new Error("A journey transition needs an event with a type");
  }
  switch (event.type) {
    case "travel": {
      if (!event.targetId) throw new Error("A journey needs a destination");
      return { journeyTarget: event.targetId, arrivalTarget: null };
    }
    case "settled": {
      // An arrival that belongs to a journey we are no longer on is stale: the
      // camera reports where it stopped, not where the player meant to go.
      if (!current.journeyTarget || current.journeyTarget !== event.targetId) return current;
      return { journeyTarget: null, arrivalTarget: event.targetId };
    }
    case "superseded":
      return { journeyTarget: null, arrivalTarget: null };
    case "manual":
      return { journeyTarget: null, arrivalTarget: null };
    case "arrival-expired":
      return { journeyTarget: current.journeyTarget, arrivalTarget: null };
    case "reset":
      return { ...IDLE_JOURNEY };
    default:
      throw new Error(`Unknown journey event: ${event.type}`);
  }
}

/**
 * Whether the player may start a new journey. This is exactly the condition
 * that disables FLY and HOME/STARS, so it lives beside the transitions rather
 * than being re-derived at the button.
 */
export function canLeave(state = IDLE_JOURNEY) {
  return !(state?.journeyTarget);
}
