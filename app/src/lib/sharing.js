function clipboardWriter(navigatorRef) {
  const writeText = navigatorRef?.clipboard?.writeText;
  return typeof writeText === "function" ? writeText.bind(navigatorRef.clipboard) : null;
}

export async function copyOrbitLink(link, { navigatorRef = globalThis.navigator } = {}) {
  const writeText = clipboardWriter(navigatorRef);
  if (!writeText) return { kind: "manual" };

  try {
    await writeText(link);
    return { kind: "copied" };
  } catch {
    return { kind: "manual" };
  }
}

export async function shareOrbit(data, { navigatorRef = globalThis.navigator } = {}) {
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

  return copyOrbitLink(data.url, { navigatorRef });
}
