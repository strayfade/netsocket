const CITIES = {
  tokyo: "Asia/Tokyo",
  osaka: "Asia/Tokyo",
  seoul: "Asia/Seoul",
  beijing: "Asia/Shanghai",
  shanghai: "Asia/Shanghai",
  hongkong: "Asia/Hong_Kong",
  "hong kong": "Asia/Hong_Kong",
  singapore: "Asia/Singapore",
  bangkok: "Asia/Bangkok",
  dubai: "Asia/Dubai",
  mumbai: "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  kolkata: "Asia/Kolkata",
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  auckland: "Pacific/Auckland",
  london: "Europe/London",
  paris: "Europe/Paris",
  berlin: "Europe/Berlin",
  rome: "Europe/Rome",
  madrid: "Europe/Madrid",
  amsterdam: "Europe/Amsterdam",
  moscow: "Europe/Moscow",
  utc: "UTC",
  gmt: "UTC",
  "new york": "America/New_York",
  nyc: "America/New_York",
  boston: "America/New_York",
  toronto: "America/Toronto",
  chicago: "America/Chicago",
  denver: "America/Denver",
  phoenix: "America/Phoenix",
  "los angeles": "America/Los_Angeles",
  la: "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  vancouver: "America/Vancouver",
  "mexico city": "America/Mexico_City",
  "sao paulo": "America/Sao_Paulo",
  honolulu: "Pacific/Honolulu",
};

const ADD_PATTERN =
  /^now\s*([+-])\s*(\d+)\s*(minutes?|hours?|days?|weeks?|months?|years?)$/i;

function formatWhen(date, timeZone) {
  const options = {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (timeZone) options.timeZone = timeZone;
  options.timeZoneName = "short";
  try {
    return new Intl.DateTimeFormat("en-US", options).format(date);
  } catch {
    return null;
  }
}

function resolveZone(name) {
  const key = String(name || "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!key) return null;
  if (CITIES[key]) return CITIES[key];
  if (key.includes("/")) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: key }).format(new Date());
      return key;
    } catch {
      return null;
    }
  }
  return null;
}

function addToNow(sign, amount, unit, now) {
  const date = new Date(now);
  const delta = sign === "-" ? -amount : amount;
  const name = unit.toLowerCase();
  if (name.startsWith("minute")) date.setMinutes(date.getMinutes() + delta);
  else if (name.startsWith("hour")) date.setHours(date.getHours() + delta);
  else if (name.startsWith("day")) date.setDate(date.getDate() + delta);
  else if (name.startsWith("week")) date.setDate(date.getDate() + delta * 7);
  else if (name.startsWith("month")) date.setMonth(date.getMonth() + delta);
  else date.setFullYear(date.getFullYear() + delta);
  return date;
}

export function timeResult(query, now = new Date()) {
  const text = String(query || "").trim();
  const lower = text.toLowerCase();

  if (/^(time|date|now)$/i.test(text)) {
    const title = formatWhen(now);
    if (!title) return null;
    return copyTime(title, lower === "date" ? "Local date" : "Local time");
  }

  if (/^(unix|unix time|timestamp|epoch)$/i.test(text)) {
    const title = String(Math.floor(now.getTime() / 1000));
    return copyTime(title, "Unix time");
  }

  const city = text.match(/^time\s+in\s+(.+)$/i);
  if (city) {
    const zone = resolveZone(city[1]);
    if (!zone) return null;
    const title = formatWhen(now, zone);
    if (!title) return null;
    return copyTime(title, zone);
  }

  const shift = text.match(ADD_PATTERN);
  if (shift) {
    const date = addToNow(shift[1], Number(shift[2]), shift[3], now);
    const title = formatWhen(date);
    if (!title) return null;
    return copyTime(title, "Adjusted time");
  }

  if (/^\d{10}$/.test(text) || /^\d{13}$/.test(text)) {
    const ms = text.length === 13 ? Number(text) : Number(text) * 1000;
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getUTCFullYear();
    if (year < 2000 || year > 2100) return null;
    const title = formatWhen(date);
    if (!title) return null;
    return copyTime(title, "From unix time");
  }

  return null;
}

function copyTime(title, subtitle) {
  return {
    id: "time",
    title,
    subtitle,
    category: "Time",
    score: 2000,
    direct: true,
    action: { type: "copy", text: title },
  };
}
