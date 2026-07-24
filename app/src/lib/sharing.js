function clipboardWriter(navigatorRef) {
  const writeText = navigatorRef?.clipboard?.writeText;
  return typeof writeText === "function" ? writeText.bind(navigatorRef.clipboard) : null;
}

function copyFromTemporaryField(link, documentRef) {
  if (!documentRef?.body
    || typeof documentRef.createElement !== "function"
    || typeof documentRef.execCommand !== "function") {
    return false;
  }

  const field = documentRef.createElement("textarea");
  field.value = link;
  field.setAttribute("readonly", "");
  Object.assign(field.style, {
    position: "fixed",
    inset: "0 auto auto -9999px",
    opacity: "0",
    pointerEvents: "none",
  });
  documentRef.body.append(field);
  try {
    field.select();
    field.setSelectionRange(0, link.length);
    return documentRef.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    field.remove();
  }
}

export async function copyOrbitLink(link, {
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
} = {}) {
  const writeText = clipboardWriter(navigatorRef);
  if (writeText) {
    try {
      await writeText(link);
      return { kind: "copied" };
    } catch {
      // Some browsers deny the async Clipboard API despite a direct user gesture.
    }
  }

  return copyFromTemporaryField(link, documentRef)
    ? { kind: "copied" }
    : { kind: "manual" };
}

export async function shareOrbit(data, {
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
} = {}) {
  const systemShare = navigatorRef?.share;
  let canUseSystemShare = typeof systemShare === "function";

  if (canUseSystemShare && typeof navigatorRef.canShare === "function") {
    try {
      canUseSystemShare = navigatorRef.canShare(data);
    } catch {
      canUseSystemShare = false;
    }
  }

  if (canUseSystemShare) {
    try {
      await systemShare.call(navigatorRef, data);
      return { kind: "shared" };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return { kind: "cancelled" };
    }
  }

  return copyOrbitLink(data.url, { navigatorRef, documentRef });
}
