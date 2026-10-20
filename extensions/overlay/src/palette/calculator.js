const FUNCS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  ln: Math.log,
  log: Math.log10,
};

function preprocess(input) {
  return String(input || "")
    .trim()
    .replace(/π/g, "pi")
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/(\d+(?:\.\d+)?)\s*%\s*of\s+/gi, "($1/100)*");
}

function looksLikeMath(expression) {
  return (
    /[+\-*/%^&|~!<>]|\(|\)|0x|0b|\b(?:sqrt|abs|sin|cos|tan|ln|log|pi|xor)\b|\d(?:\.\d+)?e[+-]?\d/i.test(
      expression
    ) || /^(?:pi|e)$/i.test(expression)
  );
}

function tokenize(expression) {
  const pattern =
    /0x[0-9a-f]+|0b[01]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?|[a-z]+|<<|>>|\*\*|\(|\)|[+\-*/%^&|~!]/gi;
  const tokens = [];
  let cursor = 0;
  let match;
  while ((match = pattern.exec(expression))) {
    const gap = expression.slice(cursor, match.index);
    if (gap.trim() !== "") return null;
    tokens.push(match[0].toLowerCase());
    cursor = match.index + match[0].length;
  }
  if (expression.slice(cursor).trim() !== "") return null;
  if (!tokens.length) return null;
  return tokens;
}

function formatResult(value) {
  if (!Number.isFinite(value)) return null;
  if (Object.is(value, -0)) value = 0;
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
    return value.toExponential(6).replace(/\.?0+e/, "e");
  }
  const text = String(Number(value.toPrecision(12)));
  return text === "-0" ? "0" : text;
}

function asInt(value) {
  if (!Number.isFinite(value)) throw new Error("bad");
  const truncated = Math.trunc(value);
  if (!Number.isSafeInteger(truncated)) throw new Error("bad");
  return truncated;
}

function factorial(value) {
  const n = asInt(value);
  if (n < 0 || Math.abs(value - n) > 1e-9 || n > 170) throw new Error("bad");
  let acc = 1;
  for (let i = 2; i <= n; i += 1) acc *= i;
  return acc;
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek() {
    return this.tokens[this.index] ?? null;
  }

  eat(expected) {
    if (this.peek() !== expected) throw new Error("bad");
    this.index += 1;
  }

  parse() {
    const value = this.parseOr();
    if (this.peek() !== null) throw new Error("bad");
    return value;
  }

  parseOr() {
    let value = this.parseXor();
    while (this.peek() === "|") {
      this.index += 1;
      value = Number(BigInt(asInt(value)) | BigInt(asInt(this.parseXor())));
    }
    return value;
  }

  parseXor() {
    let value = this.parseAnd();
    while (this.peek() === "xor") {
      this.index += 1;
      value = Number(BigInt(asInt(value)) ^ BigInt(asInt(this.parseAnd())));
    }
    return value;
  }

  parseAnd() {
    let value = this.parseShift();
    while (this.peek() === "&") {
      this.index += 1;
      value = Number(BigInt(asInt(value)) & BigInt(asInt(this.parseShift())));
    }
    return value;
  }

  parseShift() {
    let value = this.parseAdd();
    while (this.peek() === "<<" || this.peek() === ">>") {
      const op = this.peek();
      this.index += 1;
      const shift = asInt(this.parseAdd());
      if (shift < 0 || shift > 63) throw new Error("bad");
      const bits = BigInt(asInt(value));
      value = Number(op === "<<" ? bits << BigInt(shift) : bits >> BigInt(shift));
    }
    return value;
  }

  parseAdd() {
    let value = this.parseMul();
    while (this.peek() === "+" || this.peek() === "-") {
      const op = this.peek();
      this.index += 1;
      const right = this.parseMul();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }

  parseMul() {
    let value = this.parsePow();
    while (this.peek() === "*" || this.peek() === "/" || this.peek() === "%") {
      const op = this.peek();
      const next = this.tokens[this.index + 1];
      if (op === "%" && (next == null || next === ")" || "+-*/%^&|".includes(next) || next === "xor")) {
        break;
      }
      this.index += 1;
      const right = this.parsePow();
      if (op === "*") value *= right;
      else if (op === "/") {
        if (right === 0) throw new Error("bad");
        value /= right;
      } else {
        if (right === 0) throw new Error("bad");
        value %= right;
      }
    }
    return value;
  }

  parsePow() {
    const value = this.parseUnary();
    if (this.peek() === "^" || this.peek() === "**") {
      this.index += 1;
      return value ** this.parsePow();
    }
    return value;
  }

  parseUnary() {
    if (this.peek() === "+" || this.peek() === "-" || this.peek() === "~") {
      const op = this.peek();
      this.index += 1;
      const value = this.parseUnary();
      if (op === "+") return value;
      if (op === "-") return -value;
      return Number(~BigInt(asInt(value)));
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let value = this.parsePrimary();
    while (this.peek() === "!" || this.peek() === "%") {
      if (this.peek() === "!") {
        this.index += 1;
        value = factorial(value);
        continue;
      }
      const next = this.tokens[this.index + 1];
      const startsValue =
        next != null &&
        next !== ")" &&
        next !== "!" &&
        !"+-*/%^&|".includes(next) &&
        next !== "<<" &&
        next !== ">>" &&
        next !== "**" &&
        next !== "xor";
      if (startsValue) break;
      this.index += 1;
      value /= 100;
    }
    return value;
  }

  parsePrimary() {
    const token = this.peek();
    if (token == null) throw new Error("bad");
    if (token === "(") {
      this.index += 1;
      const value = this.parseOr();
      this.eat(")");
      return value;
    }
    if (/^0x[0-9a-f]+$/.test(token)) {
      this.index += 1;
      return parseInt(token.slice(2), 16);
    }
    if (/^0b[01]+$/.test(token)) {
      this.index += 1;
      return parseInt(token.slice(2), 2);
    }
    if (/^\d/.test(token)) {
      this.index += 1;
      return Number(token);
    }
    if (/^[a-z]+$/.test(token)) {
      this.index += 1;
      if (token === "pi") return Math.PI;
      if (token === "e") return Math.E;
      const fn = FUNCS[token];
      if (!fn) throw new Error("bad");
      this.eat("(");
      const arg = this.parseOr();
      this.eat(")");
      const value = fn(arg);
      if (!Number.isFinite(value)) throw new Error("bad");
      return value;
    }
    throw new Error("bad");
  }
}

export function evaluateExpression(input) {
  const expression = preprocess(input);
  if (!expression || !looksLikeMath(expression)) return null;
  const tokens = tokenize(expression);
  if (!tokens) return null;
  try {
    const value = new Parser(tokens).parse();
    return formatResult(value);
  } catch {
    return null;
  }
}

function formatPercent(value) {
  const percent = value * 100;
  if (!Number.isFinite(percent)) return null;
  if (Object.is(percent, -0)) return "0";
  // Keep tiny percentages visible instead of rounding them down to 0%.
  if (percent !== 0 && Math.abs(percent) < 0.01) return formatResult(percent);
  return String(Number(percent.toFixed(2)));
}

function basicDivisionPercent(expression) {
  // Only a lone "<number> / <number>" — not compound expressions
  // like "1/2/3", "1/2+1", or "(1/2)".
  const match =
    /^([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/i.exec(
      expression
    );
  if (!match) return null;
  const denominator = Number(match[2]);
  if (denominator === 0) return null;
  return formatPercent(Number(match[1]) / denominator);
}

export function calculatorResult(query) {
  const text = String(query || "").trim();
  if (!text || text.includes("\n")) return null;
  const value = evaluateExpression(text);
  if (value == null) return null;
  const percent = basicDivisionPercent(preprocess(text));
  return {
    id: "calculator",
    // Preview-only: the percentage is shown in the title, while the
    // copy action below still copies just the plain result.
    title: percent == null ? value : `${value} (${percent}%)`,
    subtitle: "Copy result",
    category: "Calculator",
    score: 2000,
    direct: true,
    action: { type: "copy", text: value },
  };
}
