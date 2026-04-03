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

module.exports = { number, string, bool }