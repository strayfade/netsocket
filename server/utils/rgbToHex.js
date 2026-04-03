const rgbToHex = ([r, g, b]) => {
    return (
        "#" +
        [r, g, b]
            .map(v => v.toString(16).padStart(2, "0"))
            .join("")
    );
}

module.exports = { rgbToHex }