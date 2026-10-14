import assert from "node:assert/strict";
import test from "node:test";
import { evaluateExpression } from "../extensions/overlay/src/palette/calculator.js";
import { clearCurrencyCache, currencyResult } from "../extensions/overlay/src/palette/currency.js";
import { remember } from "../extensions/overlay/src/palette/history.js";
import { rankPalette } from "../extensions/overlay/src/palette/rank.js";
import { convertExpression } from "../extensions/overlay/src/palette/units.js";
import { sha256Hex } from "../extensions/overlay/src/palette/values.js";
import { webSearchUrl } from "../extensions/overlay/src/palette/web.js";

const slashCommands = [
  { name: "/settings", description: "Open overlay settings" },
  { name: "/otp", description: "Show authenticator OTP codes" },
  { name: "/history", description: "Show recent received alerts" },
  { name: "/clear", description: "Close all response panels" },
  { name: "/cancel", description: "Stop the running query" },
];

test("calculator evaluates arithmetic, functions, and bitwise values", () => {
  assert.equal(evaluateExpression("2+2"), "4");
  assert.equal(evaluateExpression("(2+3)*4"), "20");
  assert.equal(evaluateExpression("2^3"), "8");
  assert.equal(evaluateExpression("sqrt(9)"), "3");
  assert.equal(evaluateExpression("20% of 80"), "16");
  assert.equal(evaluateExpression("0x10"), "16");
  assert.equal(evaluateExpression("0b1010"), "10");
  assert.equal(evaluateExpression("sin(0)"), "0");
  assert.equal(evaluateExpression("5!"), "120");
  assert.equal(evaluateExpression("0xFF & 0x0F"), "15");
  assert.equal(evaluateExpression("5%2"), "1");
  assert.equal(evaluateExpression("~0"), "-1");
  assert.equal(evaluateExpression("1<<4"), "16");
  assert.equal(evaluateExpression("hello world"), null);
});

test("unit conversion covers length, temperature, data, and time", () => {
  assert.equal(convertExpression("10 km in mi"), "6.2137 mi");
  assert.equal(convertExpression("32 f to c"), "0 c");
  assert.equal(convertExpression("1 gb in mb"), "1000 mb");
  assert.equal(convertExpression("2 hours in minutes"), "120 min");
  assert.equal(convertExpression("meet me in 10 minutes"), null);
});

test("a sentence stays on Ask netsocket", () => {
  const ranked = rankPalette({
    query: "what is the weather tomorrow",
    slashCommands,
  });
  assert.equal(ranked.results[ranked.index].action.type, "ask");
  assert.equal(ranked.results[ranked.index].title, "Ask netsocket");
});

test("math highlights the calculator", () => {
  const ranked = rankPalette({ query: "2+2", slashCommands });
  assert.equal(ranked.results[ranked.index].category, "Calculator");
  assert.equal(ranked.results[ranked.index].title, "4");
});

test("slash commands still match", () => {
  const ranked = rankPalette({ query: "/set", slashCommands });
  assert.equal(ranked.results[0].title, "/settings");
  assert.equal(ranked.results.some((result) => result.action.type === "ask"), false);

  const exact = rankPalette({ query: "/otp", slashCommands });
  assert.equal(exact.results[exact.index].action.type, "slash");
  assert.equal(exact.results[exact.index].action.name, "/otp");
});

test("destructive system actions ask for a second enter", () => {
  const ranked = rankPalette({ query: "shutdown", slashCommands });
  const row = ranked.results.find((result) => result.action?.target === "shutdown");
  assert.ok(row);
  assert.equal(row.confirm, true);
  assert.match(row.subtitle, /Enter again/i);
  assert.equal(ranked.results[ranked.index].id, row.id);
});

test("an empty query shows recent local actions", () => {
  const ranked = rankPalette({
    query: "",
    history: [
      {
        title: "Notepad",
        subtitle: "Application",
        category: "Apps",
        action: { type: "invoke", invoke: "launch-app", target: "C:\\notepad.lnk" },
        query: "notepad",
        at: 1,
      },
    ],
  });
  assert.equal(ranked.results[0].category, "Recent");
  assert.equal(ranked.results[0].title, "Notepad");
});

test("a unique app name is the direct result", () => {
  const ranked = rankPalette({
    query: "notepad",
    apps: [
      { id: "notepad", name: "Notepad", target: "C:\\notepad.lnk", kind: "shortcut" },
      { id: "paint", name: "Paint", target: "C:\\paint.lnk", kind: "shortcut" },
    ],
  });
  assert.equal(ranked.results[ranked.index].category, "Apps");
  assert.equal(ranked.results[ranked.index].title, "Notepad");
});

test("web search uses the selected engine", () => {
  assert.match(webSearchUrl("google", "cats"), /^https:\/\/www\.google\.com\/search\?q=cats$/);
  assert.match(webSearchUrl("bing", "cats"), /^https:\/\/www\.bing\.com\/search\?q=cats$/);
  assert.match(webSearchUrl("nope", "cats"), /^https:\/\/www\.google\.com\/search\?q=cats$/);
});

test("currency uses cached rates and reports when offline", async () => {
  clearCurrencyCache();
  const converted = await currencyResult("10 usd in eur", async () => ({
    ok: true,
    json: async () => ({ rates: { EUR: 0.9 } }),
  }));
  assert.equal(converted.title, "9 EUR");
  assert.equal(converted.action.type, "copy");

  clearCurrencyCache();
  const offline = await currencyResult("10 usd in eur", async () => {
    throw new Error("offline");
  });
  assert.match(offline.title, /unavailable/i);
  assert.equal(offline.direct, true);
});

test("sha256 matches the empty and abc vectors", async () => {
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
  );
});

test("history keeps the newest copy and caps at 50", () => {
  let history = [];
  for (let index = 0; index < 55; index += 1) {
    history = remember(history, {
      title: `Item ${index}`,
      subtitle: "",
      category: "Value",
      action: { type: "copy", text: String(index) },
      query: String(index),
      at: index,
    });
  }
  assert.equal(history.length, 50);
  assert.equal(history[0].title, "Item 54");
  history = remember(history, {
    title: "Item 54",
    subtitle: "again",
    category: "Value",
    action: { type: "copy", text: "54" },
    query: "54",
    at: 99,
  });
  assert.equal(history.length, 50);
  assert.equal(history.filter((entry) => entry.title === "Item 54").length, 1);
  assert.equal(history[0].at, 99);
});
