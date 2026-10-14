import { matchSlashCommand, suggestSlashCommands, unknownSlashHelp } from "../slashCommands.js";
import { calculatorResult } from "./calculator.js";
import { currencyPlaceholder } from "./currency.js";
import { dictionaryPlaceholder } from "./dictionary.js";
import { historyResults } from "./history.js";
import { scoreText } from "./score.js";
import { settingsResults } from "./settingsCatalog.js";
import { systemResults } from "./system.js";
import { timeResult } from "./timeDate.js";
import { unitResult } from "./units.js";
import { hashPlaceholder, valueResult } from "./values.js";
import { pathResult, urlResult, webSearchResult } from "./web.js";

const RESULT_LIMIT = 8;

function askResult(query) {
  const text = String(query || "").trim();
  return {
    id: "ask",
    title: "Ask netsocket",
    subtitle: text,
    category: "Ask",
    score: 160,
    direct: false,
    action: { type: "ask", text },
  };
}

function slashResults(query, commands) {
  const text = String(query || "");
  if (!text.trim().startsWith("/")) return null;
  const suggestions = suggestSlashCommands(text, commands);
  if (suggestions.length) {
    return suggestions.map((command, index) => ({
      id: `slash:${command.name}`,
      title: command.name,
      subtitle: command.description,
      category: "Command",
      score: 2000 - index,
      direct: index === 0,
      action: { type: "slash", name: command.name },
    }));
  }
  const matched = matchSlashCommand(text, commands);
  if (matched) {
    return [
      {
        id: `slash:${matched.name}`,
        title: matched.name,
        subtitle: matched.description,
        category: "Command",
        score: 2000,
        direct: true,
        action: { type: "slash", name: matched.name },
      },
    ];
  }
  const help = unknownSlashHelp(commands);
  return [
    {
      id: "slash:unknown",
      title: "Unknown command",
      subtitle: help,
      category: "Command",
      score: 2000,
      direct: true,
      action: { type: "notice", text: help },
    },
  ];
}

function shellResults(query) {
  if (!String(query || "").trim().startsWith(">")) return null;
  const command = String(query).trim().slice(1).trim();
  if (!command) {
    return [
      {
        id: "shell:hint",
        title: "Run a command",
        subtitle: "Type a command after >",
        category: "Shell",
        score: 2000,
        direct: false,
        action: { type: "notice", text: "Type a command after >" },
      },
    ];
  }
  return [
    {
      id: "shell:run",
      title: command,
      subtitle: "Run command",
      category: "Shell",
      score: 2000,
      direct: true,
      action: { type: "invoke", invoke: "shell", target: command, elevated: false },
    },
    {
      id: "shell:admin",
      title: command,
      subtitle: "Run as administrator",
      category: "Shell",
      score: 1900,
      direct: false,
      action: { type: "invoke", invoke: "shell", target: command, elevated: true },
    },
  ];
}

function windowResults(query, windows) {
  const raw = String(query || "").trim();
  const prefixed = raw.startsWith("<");
  if (!prefixed) return [];
  const text = raw.slice(1).trim();
  const items = Array.isArray(windows) ? windows : [];
  const ranked = items
    .map((item) => ({
      item,
      score: text ? scoreText(text, item.title) : 700,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  if (!ranked.length) {
    return [
      {
        id: "windows:empty",
        title: "No matching windows",
        subtitle: text || "Nothing is open",
        category: "Windows",
        score: 2000,
        direct: false,
        action: { type: "notice", text: "No matching windows" },
      },
    ];
  }
  return ranked.map((entry, index) => ({
    id: `window:${entry.item.hwnd}`,
    title: entry.item.title,
    subtitle: "Switch to window",
    category: "Windows",
    score: 1800 + entry.score,
    direct: index === 0,
    action: { type: "invoke", invoke: "focus-window", target: String(entry.item.hwnd) },
  }));
}

function appResults(query, apps) {
  const text = String(query || "").trim();
  if (text.length < 2) return [];
  const ranked = (Array.isArray(apps) ? apps : [])
    .map((app) => ({ app, score: scoreText(text, app.name) }))
    .filter((item) => item.score >= 400)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const top = ranked[0];
  const second = ranked[1];
  const unique =
    top &&
    top.score >= 800 &&
    (!second || second.score < 800 || top.score - second.score >= 50);
  return ranked.map((item, index) => ({
    id: `app:${item.app.id || item.app.target}`,
    title: item.app.name,
    subtitle: item.app.kind === "packaged" ? "Installed app" : "Application",
    category: "Apps",
    score: 1200 + item.score,
    direct: Boolean(unique && index === 0),
    action: { type: "invoke", invoke: "launch-app", target: item.app.target },
  }));
}

function fileResults(query, files) {
  const text = String(query || "").trim();
  if (text.length < 2) return [];
  const ranked = (Array.isArray(files) ? files : [])
    .map((file) => ({ file, score: scoreText(text, file.name) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const exact = ranked.filter((item) => item.score >= 1000);
  return ranked.map((item, index) => ({
    id: `file:${item.file.path}`,
    title: item.file.name,
    subtitle: item.file.path,
    category: "Files",
    score: 900 + item.score,
    direct: exact.length === 1 && index === 0 && item.score >= 1000,
    action: { type: "invoke", invoke: "open-file", target: item.file.path },
  }));
}

function preferExtras(results, extras) {
  const byId = new Map((Array.isArray(extras) ? extras : []).filter(Boolean).map((item) => [item.id, item]));
  if (!byId.size) return results;
  return results.map((result) => byId.get(result.id) || result);
}

export function defaultIndex(results) {
  const direct = results.findIndex((result) => result.direct);
  if (direct >= 0) return direct;
  const ask = results.findIndex((result) => result.action?.type === "ask");
  if (ask >= 0) return ask;
  return results.length ? 0 : -1;
}

function capResults(results) {
  const ask = results.find((result) => result.action?.type === "ask");
  const web = results.find((result) => result.id === "web");
  const reserved = [web, ask].filter(Boolean);
  const rest = results
    .filter((result) => result !== ask && result !== web)
    .sort((a, b) => b.score - a.score);
  const room = Math.max(0, RESULT_LIMIT - reserved.length);
  const ordered = [...rest.slice(0, room)];
  if (web) ordered.push(web);
  if (ask) ordered.push(ask);
  if (!ordered.some((result) => result.direct) && ask) {
    return [ask, ...ordered.filter((result) => result !== ask)];
  }
  return ordered;
}

export function rankPalette({
  query = "",
  searchEngine = "google",
  history = [],
  apps = [],
  windows = [],
  files = [],
  extras = [],
  slashCommands = [],
  now = new Date(),
} = {}) {
  const text = String(query || "");
  const trimmed = text.trim();

  if (!trimmed) {
    const results = historyResults(history, "", scoreText);
    return { results, index: defaultIndex(results) };
  }

  if (trimmed.includes("\n")) {
    const results = [askResult(trimmed)];
    return { results, index: 0 };
  }

  const slash = slashResults(trimmed, slashCommands);
  if (slash) return { results: slash.slice(0, RESULT_LIMIT), index: defaultIndex(slash) };

  const shell = shellResults(trimmed);
  if (shell) return { results: shell.slice(0, RESULT_LIMIT), index: defaultIndex(shell) };

  const windowsOnly = windowResults(trimmed, windows);
  if (trimmed.startsWith("<")) {
    return { results: windowsOnly.slice(0, RESULT_LIMIT), index: defaultIndex(windowsOnly) };
  }

  if (trimmed.startsWith("$")) {
    const pages = settingsResults(trimmed, scoreText);
    const results = pages.length
      ? pages.slice(0, RESULT_LIMIT)
      : [
          {
            id: "settings:empty",
            title: "No matching settings",
            subtitle: trimmed.slice(1).trim() || "Settings",
            category: "Settings",
            score: 2000,
            direct: false,
            action: { type: "notice", text: "No matching settings page" },
          },
        ];
    return { results, index: defaultIndex(results) };
  }

  const instant = [
    urlResult(trimmed),
    pathResult(trimmed),
    unitResult(trimmed),
    currencyPlaceholder(trimmed),
    dictionaryPlaceholder(trimmed),
    hashPlaceholder(trimmed),
    timeResult(trimmed, now),
    calculatorResult(trimmed),
    valueResult(trimmed),
  ].filter(Boolean);

  const collected = preferExtras(
    [
      ...instant,
      ...systemResults(trimmed, scoreText),
      ...settingsResults(trimmed, scoreText),
      ...appResults(trimmed, apps),
      ...fileResults(trimmed, files),
      ...historyResults(history, trimmed, scoreText),
      webSearchResult(trimmed, searchEngine),
      askResult(trimmed),
    ],
    extras
  );

  const results = capResults(collected);
  return { results, index: defaultIndex(results) };
}
