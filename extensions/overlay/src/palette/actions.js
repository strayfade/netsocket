import { toHistoryEntry } from "./history.js";

export async function runPaletteAction(result, deps) {
  const action = result?.action || {};
  const record = () => {
    const entry = toHistoryEntry(result, deps.query);
    if (entry) deps.record?.(entry);
  };

  if (action.type === "slash") {
    deps.runSlash?.(action.name);
    record();
    return;
  }

  if (action.type === "ask") {
    await deps.ask?.(action.text);
    return;
  }

  if (action.type === "notice") {
    deps.notice?.(action.text || result.subtitle || "");
    return;
  }

  if (action.type === "copy") {
    await deps.writeClipboard?.(action.text ?? result.title);
    deps.notice?.("Copied");
    record();
    await deps.hide?.();
    return;
  }

  if (action.type === "open") {
    await deps.hide?.();
    await deps.openExternal?.(action.url);
    record();
    return;
  }

  if (action.type === "invoke") {
    await deps.hide?.();
    try {
      const response = await deps.execute?.({
        invoke: action.invoke,
        target: action.target || "",
        elevated: Boolean(action.elevated),
        confirmed: Boolean(deps.confirmed),
      });
      if (response && response.ok === false) {
        deps.notice?.(response.error || "Action failed");
        return;
      }
      record();
    } catch (error) {
      deps.notice?.(error?.message || String(error));
    }
  }
}
