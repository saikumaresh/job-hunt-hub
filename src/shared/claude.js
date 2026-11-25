// Thin wrappers over Claude's artifact capabilities: desktop, mcp (connectors),
// sample (ask Claude) and downloads. Each resolves null when the view cannot run it,
// so every feature degrades instead of breaking the page.

const use = (name) => {
  const api = typeof window !== "undefined" ? window.claude : undefined;
  return api?.use ? api.use(name).catch(() => null) : Promise.resolve(null);
};

export const getDesktop = () => use("desktop");
export const getMcp = () => use("mcp");
export const getSample = () => use("sample");
export const getDownloads = () => use("downloads");

/** Human copy for each connector error code. Distinct fixes, never one generic banner. */
export function connectorMessage(err, server) {
  const code = err?.code;
  switch (code) {
    case "needs_reauth":
      return `Reconnect ${server} in claude.ai Settings, Connectors.`;
    case "server_not_connected":
    case "server_not_found":
      return `Add the ${server} connector in claude.ai Settings, Connectors, then reload.`;
    case "selection_required":
      return `You have more than one ${server} connector. Pick one when Claude asks.`;
    case "not_in_manifest":
    case "approval_required":
      return `${server} is not allowed for this app yet. Use the button to allow it.`;
    case "blocked_by_policy":
      return `Your organisation blocks ${server} for this app.`;
    case "server_unavailable":
    case "rate_limited":
      return `${server} is not answering right now. Try again in a minute.`;
    case "not_granted":
    case "capability_disabled":
    case "capability_removed":
      return `Connectors are not available in this view. Open the app in Claude.`;
    case "tool_error":
      return `${server} reported a problem: ${String(err.message || "").slice(0, 160)}`;
    default:
      return `${server} could not be reached (${code || "unknown error"}).`;
  }
}

/** Call a connector tool once and return its payload. Throws {code, message}. */
export async function callConnector(server, tool, input) {
  const mcp = await getMcp();
  if (!mcp) throw { code: "not_granted", message: "Connectors unavailable" };
  const res = await mcp.callTool(server, tool, input);
  return res.payload ?? res;
}

/** Ask Claude for JSON. Returns null when sample is unavailable. */
export async function askJson(prompt, { tier = "default" } = {}) {
  const sample = await getSample();
  if (!sample) return null;
  return sample.json(prompt, { modelTier: tier });
}

/** Ask Claude for text, streaming into onText. Returns null when unavailable. */
export async function askText(prompt, { onText, tier = "default" } = {}) {
  const sample = await getSample();
  if (!sample) return null;
  const res = await sample(prompt, {
    modelTier: tier,
    onText: onText ? (e) => onText(e.text) : undefined,
  });
  return res.text;
}

/** Offer a generated file. Returns true when the viewer saved it. */
export async function saveFile(filename, data) {
  const downloads = await getDownloads();
  if (!downloads) return false;
  try {
    await downloads.save({ filename, data });
    return true;
  } catch {
    return false;
  }
}

/** Draw a square PNG icon: the app's initials on Swiss Grid colours. */
export function drawIcon(letters, { bg = "#1235F2", fg = "#F7F6F2", size = 256 } = {}) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  g.fillStyle = fg;
  g.fillRect(size * 0.12, size * 0.12, size * 0.06, size * 0.76);
  g.font = `900 ${size * 0.42}px Archivo, "Helvetica Neue", Arial, sans-serif`;
  g.textBaseline = "alphabetic";
  g.fillText(letters, size * 0.26, size * 0.8);
  return c.toDataURL("image/png");
}

/**
 * Wire the shared desktop basics: icon, window options, and an install button
 * when the page runs outside its desktop app. Returns the desktop API (or null).
 */
export async function setupDesktop({ letters, installSlot, windowSize = [1100, 760] }) {
  const desktop = await getDesktop();
  if (!desktop) return null;
  if (!desktop.notification && !desktop.tray && !desktop.fs) {
    // Outside the installed app: offer installation when Claude can do it.
    const state = await desktop.install?.state().catch(() => "unavailable");
    if (state === "available" && installSlot) {
      installSlot.hidden = false;
      installSlot.onclick = () => desktop.install.request().catch(() => {});
    }
    return null;
  }
  desktop.app?.dock?.setIcon(drawIcon(letters)).catch(() => {});
  desktop.window
    ?.setOptions({ width: windowSize[0], height: windowSize[1], minWidth: 380, minHeight: 560 })
    .catch(() => {});
  return desktop;
}
