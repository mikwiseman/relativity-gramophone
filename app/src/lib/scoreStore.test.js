import test from "node:test";
import assert from "node:assert/strict";

import { createBlankComposition, encodeComposition } from "./composition.js";
import {
  createShortScoreUrl,
  fetchStoredComposition,
  persistComposition,
  readStoredScoreId,
} from "./scoreStore.js";

const location = {
  href: "https://waiwai.is/relativity?utm_source=test#score=legacy",
  origin: "https://waiwai.is",
};

test("a stored score URL is short, stable, and contains no composition hash", () => {
  assert.equal(
    createShortScoreUrl("abcdefghijklmnop", location),
    "https://waiwai.is/relativity?s=abcdefghijklmnop",
  );
  assert.equal(
    readStoredScoreId({ ...location, href: "https://waiwai.is/relativity?s=abcdefghijklmnop" }),
    "abcdefghijklmnop",
  );
  assert.equal(
    readStoredScoreId({ ...location, href: "https://waiwai.is/relativity" }),
    null,
  );
  assert.throws(
    () => readStoredScoreId({ ...location, href: "https://waiwai.is/relativity?s=bad" }),
    /invalid shared universe id/i,
  );
});

test("persisting a composition stores the exact encoded score and returns its short URL", async () => {
  const composition = createBlankComposition();
  const calls = [];
  const link = await persistComposition(composition, {
    location,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 201,
        json: async () => ({ id: "abcdefghijklmnop" }),
      };
    },
  });

  assert.equal(link, "https://waiwai.is/relativity?s=abcdefghijklmnop");
  assert.equal(calls[0].url, "https://waiwai.is/api/gramophone/scores");
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    score: encodeComposition(composition),
  });
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers["Content-Type"], "application/json");
});

test("a stored score is decoded and fully validated before it reaches the instrument", async () => {
  const composition = createBlankComposition();
  const restored = await fetchStoredComposition("abcdefghijklmnop", {
    location,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://waiwai.is/api/gramophone/scores/abcdefghijklmnop");
      assert.equal(init.method, "GET");
      return {
        ok: true,
        status: 200,
        json: async () => ({ score: encodeComposition(composition) }),
      };
    },
  });
  assert.deepEqual(restored, composition);
});

test("storage failures are explicit and never fall back to a huge hash URL", async () => {
  await assert.rejects(
    persistComposition(createBlankComposition(), {
      location,
      fetchImpl: async () => ({
        ok: false,
        status: 503,
        json: async () => ({ error: "failed_to_create_score" }),
      }),
    }),
    /could not save.*503/i,
  );
  await assert.rejects(
    fetchStoredComposition("abcdefghijklmnop", {
      location,
      fetchImpl: async () => ({
        ok: false,
        status: 404,
        json: async () => ({ error: "score_not_found" }),
      }),
    }),
    /shared universe was not found/i,
  );
});

test("malformed server responses are rejected instead of opening a blank score", async () => {
  await assert.rejects(
    persistComposition(createBlankComposition(), {
      location,
      fetchImpl: async () => ({
        ok: true,
        status: 201,
        json: async () => ({ id: "bad" }),
      }),
    }),
    /invalid score id/i,
  );
  await assert.rejects(
    fetchStoredComposition("abcdefghijklmnop", {
      location,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ score: "not-a-score" }),
      }),
    }),
    /invalid score payload/i,
  );
});
