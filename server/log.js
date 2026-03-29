let currentLog = ""
const ColorsForeground = Object.freeze({
    Black: 30,
    Red: 31,
    Green: 32,
    Yellow: 33,
    Blue: 34,
    Magenta: 35,
    Cyan: 36,
    White: 37,
    Gray: 90
});
const ColorsBackground = Object.freeze({
    Black: 40,
    Red: 41,
    Green: 42,
    Yellow: 43,
    Blue: 44,
    Magenta: 45,
    Cyan: 46,
    White: 47,
    Gray: 100
});

const logColors = Object.freeze({
    Default: {
        fg: null,
        bg: null
    },
    Warning: {
        fg: ColorsForeground.Yellow,
        bg: null
    },
    WarningVisible: {
        fg: ColorsForeground.Black,
        bg: ColorsBackground.Yellow
    },
    Error: {
        fg: ColorsForeground.Red,
        bg: null
    },
    ErrorVisible: {
        fg: ColorsForeground.White,
        bg: ColorsBackground.Red
    },
    Success: {
        fg: ColorsForeground.Green,
        bg: null
    },
    SuccessVisible: {
        fg: ColorsForeground.Black,
        bg: ColorsBackground.Green
    }
});

let onPushLog = null

const logPriv = (string, colors = logColors.Default) => {
    const cC = (Code) => {
        return `\x1b[${Code}m`
    }
    const shouldBold = colors == logColors.successVisible || colors == logColors.warningVisible || colors == logColors.errorVisible
    currentLog += `${string}\n`
    if (onPushLog)
        onPushLog(string)
    process.stdout.write(`\n${colors.fg ? cC(colors.fg) : ""}${colors.bg ? cC(colors.bg) : ""}${shouldBold ? cC(1) : ""}${string.toString()}${cC(0)}`)
}

const log = (string, colors = logColors.Default) => {
    const getTime = () => {
        const P = (Input, Length = 2) => {
            let Output = Input.toString();
            while (Output.length < Length) 
                Output = "0" + Output
            return Output;
        }
        let N = new Date(Date.now());
        return `${P(N.getMonth() + 1)}/${P(N.getDate())}/${P(N.getFullYear(), 4)} ${P(N.getHours() > 12 ? N.getHours() - 12 : N.getHours())}:${P(N.getMinutes())}:${P(N.getSeconds())}.${P(N.getMilliseconds(), 4)} ${N.getHours() >= 12 ? "PM" : "AM"}`
    }
    let type = "..."
    switch(colors) {
        case logColors.Default:
        case logColors.Success:
        case logColors.SuccessVisible:
            type = "Info"
            break;
        case logColors.Warning:
        case logColors.WarningVisible:
            type = "Warn"
            break;
        case logColors.Error:
        case logColors.ErrorVisible:
            type = "Error"
            break;
    }
    logPriv(`[${getTime()}] [${type.toUpperCase()}] ${string}`, colors)
}

const setOnPushLog = (func) => {
    onPushLog = func
}

const getLines = (lineCount = 1) => {
    // Return the last `lineCount` lines from `currentLog` as an array of strings.
    if (!Number.isFinite(lineCount) || lineCount <= 0) return [];
    const lines = currentLog.split('\n');
    // Remove trailing empty line caused by final newline
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    if (lineCount >= lines.length) return lines.slice();
    return lines.slice(-lineCount);
}

module.exports = { ColorsForeground, ColorsBackground, logColors, log, getLines, setOnPushLog };