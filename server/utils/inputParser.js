const number = (num) => {
    if (!num)
        return 0
    return parseFloat(num)
}
const string = (str) => {
    if (!str)
        return ""
    return str.toString()
}
const bool = (b) => {
    if (!b)
        return false
    if (b.toString() == "true")
        return true
    return false
}
const json = (str) => {
    if (!str)
        return "{}"
    if (typeof str === "object")
        return str
    let tStr = ""
    for (line of str.split("\n")) {
        tStr += line.trim() + "\n"
    }
    str = tStr;
    for (i of str) {
        str = str.replace("\n", "")
        str = str.replace("\r", "")
    }
    try {
        return JSON.parse(str)
    }
    catch (e) {
        log(`Error parsing JSON: ${e}`)
        return {}
    }
}

module.exports = { number, string, bool, json }