import { decodeComposition, encodeComposition } from "./composition.js";

const SCORE_ID_PATTERN = /^[A-Za-z0-9_-]{16}$/u;

function pageUrl(location) {
  if (!location?.href) throw new Error("Sharing requires a page location");
  return new URL(location.href);
}

function assertScoreId(id) {
  if (!SCORE_ID_PATTERN.test(id)) throw new Error("Invalid score id");
  return id;
}

function apiUrl(path, location) {
  const url = pageUrl(location);
  return new URL(path, url.origin).toString();
}

async function responseJson(response) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error("The sharing service returned invalid JSON", { cause: error });
  }
}

export function readStoredScoreId(location = globalThis.location) {
  const id = pageUrl(location).searchParams.get("s");
  if (id === null) return null;
  if (!SCORE_ID_PATTERN.test(id)) throw new Error("Invalid shared universe id");
  return id;
}

export function createShortScoreUrl(id, location = globalThis.location) {
  const url = pageUrl(location);
  url.search = "";
  url.searchParams.set("s", assertScoreId(id));
  url.hash = "";
  return url.toString();
}

export async function persistComposition(composition, {
  fetchImpl = globalThis.fetch,
  location = globalThis.location,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Sharing requires Fetch API");
  const response = await fetchImpl(apiUrl("/api/gramophone/scores", location), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ score: encodeComposition(composition) }),
  });
  const body = await responseJson(response);
  if (!response.ok) {
    throw new Error(`Could not save the universe (${response.status})`);
  }
  return createShortScoreUrl(assertScoreId(body?.id), location);
}

export async function fetchStoredComposition(id, {
  fetchImpl = globalThis.fetch,
  location = globalThis.location,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("Sharing requires Fetch API");
  const scoreId = assertScoreId(id);
  const response = await fetchImpl(
    apiUrl(`/api/gramophone/scores/${scoreId}`, location),
    {
      method: "GET",
      headers: { Accept: "application/json" },
    },
  );
  const body = await responseJson(response);
  if (!response.ok) {
    if (response.status === 404) throw new Error("The shared universe was not found");
    throw new Error(`Could not open the shared universe (${response.status})`);
  }
  if (typeof body?.score !== "string") {
    throw new Error("The sharing service returned an invalid score");
  }
  return decodeComposition(body.score);
}
