import test from "node:test";
import assert from "node:assert/strict";

import { copyOrbitLink, shareOrbit } from "./sharing.js";

const data = {
  title: "Relativity Gramophone",
  text: "A planetary composition.",
  url: "https://waiwai.is/relativity#score",
};

test("share uses the system sheet when it is available", async () => {
  const calls = [];
  const result = await shareOrbit(data, {
    navigatorRef: {
      canShare: () => true,
      share: async (payload) => calls.push(payload),
      clipboard: { writeText: async () => assert.fail("clipboard should not be used") },
    },
  });

  assert.equal(result.kind, "shared");
  assert.deepEqual(calls, [data]);
});

test("a denied system share quietly falls back to a copied orbit link", async () => {
  const copied = [];
  const denied = new Error("Permission denied");
  denied.name = "NotAllowedError";

  const result = await shareOrbit(data, {
    navigatorRef: {
      canShare: () => true,
      share: async () => { throw denied; },
      clipboard: { writeText: async (value) => copied.push(value) },
    },
  });

  assert.equal(result.kind, "copied");
  assert.deepEqual(copied, [data.url]);
});

test("an unavailable system sheet copies the orbit link instead", async () => {
  const copied = [];
  const result = await shareOrbit(data, {
    navigatorRef: {
      clipboard: { writeText: async (value) => copied.push(value) },
    },
  });

  assert.equal(result.kind, "copied");
  assert.deepEqual(copied, [data.url]);
});

test("closing the system sheet does not copy behind the user's back", async () => {
  const copied = [];
  const cancelled = new Error("Share cancelled");
  cancelled.name = "AbortError";

  const result = await shareOrbit(data, {
    navigatorRef: {
      share: async () => { throw cancelled; },
      clipboard: { writeText: async (value) => copied.push(value) },
    },
  });

  assert.equal(result.kind, "cancelled");
  assert.deepEqual(copied, []);
});

test("a denied async clipboard falls back to a user-activated document copy", async () => {
  const calls = [];
  const field = {
    style: {},
    setAttribute: (name, value) => calls.push(["attribute", name, value]),
    select: () => calls.push(["select"]),
    setSelectionRange: (start, end) => calls.push(["range", start, end]),
    remove: () => calls.push(["remove"]),
  };
  const result = await copyOrbitLink(data.url, {
    navigatorRef: {
      clipboard: { writeText: async () => { throw new Error("Secret browser detail"); } },
    },
    documentRef: {
      body: { append: (node) => calls.push(["append", node]) },
      createElement: () => field,
      execCommand: (command) => {
        calls.push(["command", command]);
        return true;
      },
    },
  });

  assert.deepEqual(result, { kind: "copied" });
  assert.ok(calls.some((call) => call[0] === "command" && call[1] === "copy"));
  assert.ok(calls.some((call) => call[0] === "remove"));
});

test("copy failure leaves a selectable manual link only when both browser copy paths are blocked", async () => {
  const result = await copyOrbitLink(data.url, {
    navigatorRef: {
      clipboard: { writeText: async () => { throw new Error("Secret browser detail"); } },
    },
    documentRef: {
      body: { append: () => {} },
      createElement: () => ({
        style: {},
        setAttribute: () => {},
        select: () => {},
        setSelectionRange: () => {},
        remove: () => {},
      }),
      execCommand: () => false,
    },
  });

  assert.deepEqual(result, { kind: "manual" });
});
