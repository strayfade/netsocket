const path = require('path')
const { log, logColors } = require('../log')

const fs = require('fs').promises

const availableNodes = {}
const nodeMetadata = {}

let nodeData = ""

const parseCallArguments = (str) => {
    const match = str.match(/\(([\s\S]*)\)/)
    if (!match) {
        return null
    }

    const args = []
    let index = 0
    const argsStr = match[1]

    while (index < argsStr.length) {
        while (index < argsStr.length && /[\s,]/.test(argsStr[index])) {
            index++
        }
        if (index >= argsStr.length) {
            break
        }

        const quote = argsStr[index]
        if (quote === '"' || quote === "'") {
            index++
            let value = ''
            while (index < argsStr.length) {
                if (argsStr[index] === '\\') {
                    index++
                    if (index >= argsStr.length) {
                        break
                    }
                    const escaped = argsStr[index]
                    switch (escaped) {
                        case 'n': value += '\n'; break
                        case 'r': value += '\r'; break
                        case 't': value += '\t'; break
                        case '"': value += '"'; break
                        case "'": value += "'"; break
                        case '\\': value += '\\'; break
                        default: value += escaped; break
                    }
                    index++
                } else if (argsStr[index] === quote) {
                    index++
                    break
                } else {
                    value += argsStr[index]
                    index++
                }
            }
            args.push(value)
            continue
        }

        const start = index
        while (index < argsStr.length && argsStr[index] !== ',') {
            index++
        }
        args.push(argsStr.slice(start, index).trim())
    }

    return args
}

const getInputPropertyParams = (str) => {
    const params = parseCallArguments(str)
    if (!params || params.length < 2) {
        return null
    }

    return {
        first: params[0],
        last: params[1],
    }
}

const parseEnumPropertyCall = (line) => {
    const match = line.match(/addEnumProperty\s*\(\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*,\s*\[([\s\S]*?)\]\s*\)/)
    if (!match) return null

    const values = []
    const valueRegex = /(['"])(.*?)\1/g
    let valueMatch
    while ((valueMatch = valueRegex.exec(match[5])) !== null) {
        values.push(valueMatch[2])
    }

    if (!values.length) return null

    return {
        name: match[2],
        defaultValue: match[4],
        enumValues: values,
    }
}

const BOOLEAN_ENUM_VALUES = ["True", "False"]

const normalizeBooleanDefault = (value) => {
    if (value == null || value === "") {
        return "False"
    }
    const normalized = String(value).trim().toLowerCase()
    return normalized === "true" || normalized === "1" || normalized === "yes" ? "True" : "False"
}

const formatBooleanPropertyLine = (name, defaultValue = "False") => {
    return formatPropertyLine({
        name,
        defaultValue: normalizeBooleanDefault(defaultValue),
        enumValues: BOOLEAN_ENUM_VALUES,
    })
}

const formatPropertyLine = (property) => {
    const escapedDefault = String(property.defaultValue)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t')

    if (property.enumValues && property.enumValues.length) {
        return `\t\tthis.addProperty("${property.name}", "${escapedDefault}", "enum", { values: ${JSON.stringify(property.enumValues)} })\n`
    }

    if (property.type === "number") {
        return `\t\tthis.addProperty("${property.name}", "${escapedDefault}", "number")\n`
    }

    return `\t\tthis.addProperty("${property.name}", "${escapedDefault}")\n`
}
let numNodesImported = 0;
const importNode = async (node) => {
    let { NodeDefinition, NodeFunction } = require(node)
    const oNodeDefinition = NodeDefinition;
    let newNodeDefinition = `
    class NodeDefinition {
        constructor() {
${(() => {
            let outConstructor = ``
            let expectedInputs = []
            let foundProperties = []
            let hasSkippedLines = 0;
            let hasCompletedLines = 0;
            let pendingEnumProperty = ""
            const constructorLines = oNodeDefinition.prototype.constructor.toString().split("\n")
            for (line of constructorLines) {
                hasCompletedLines++;
                if (hasSkippedLines < 2) {
                    hasSkippedLines++;
                    continue;
                }
                if (hasCompletedLines >= constructorLines.length - 1) continue;
                line = line.trim()

                if (pendingEnumProperty) {
                    pendingEnumProperty += ` ${line}`
                    if (!line.includes("]);")) {
                        continue
                    }
                    const enumProperty = parseEnumPropertyCall(pendingEnumProperty)
                    pendingEnumProperty = ""
                    if (enumProperty) {
                        foundProperties.push(enumProperty)
                    }
                    continue
                }

                if (line.includes("addInput")) {
                    let params = getInputPropertyParams(line)
                    expectedInputs.push({
                        name: params.first,
                        type: params.last
                    })
                }
                else if (line.includes("addEnumProperty")) {
                    if (line.includes("]);")) {
                        const enumProperty = parseEnumPropertyCall(line)
                        if (enumProperty) {
                            foundProperties.push(enumProperty)
                        }
                    } else {
                        pendingEnumProperty = line
                    }
                }
                else if (line.includes("addProperty")) {
                    let params = getInputPropertyParams(line)
                    foundProperties.push({
                        name: params.first,
                        defaultValue: params.last
                    })
                }
                else {
                    expectedInputs.push({
                        type: "line",
                        value: line,
                        name: line
                    })
                }
            }
            for (input of expectedInputs) {
                let property = foundProperties.find((property) => property.name == input.name)
                if (input.type == "line") {
                    outConstructor += `\t\t${input.value}\n`
                }
                else {
                    outConstructor += `\t\tthis.addInput("${input.name}", ${input.type != "LiteGraph.EVENT" ? `"${input.type}"` : input.type})\n`

                    if (property && input.type != "LiteGraph.EVENT") {
                        if (input.type === "boolean") {
                            outConstructor += formatBooleanPropertyLine(input.name, property.defaultValue)
                        } else if (input.type === "number") {
                            outConstructor += formatPropertyLine({ ...property, name: input.name, type: "number" })
                        } else {
                            outConstructor += formatPropertyLine({ ...property, name: input.name })
                        }
                    }
                    else if (input.type != "LiteGraph.EVENT") {
                        if (input.type === "boolean") {
                            outConstructor += formatBooleanPropertyLine(input.name, "False")
                        } else if (input.type === "number") {
                            outConstructor += formatPropertyLine({ name: input.name, defaultValue: "0", type: "number" })
                        } else {
                            outConstructor += `\t\tthis.addProperty("${input.name}", "${(() => {
                                switch (input.type) {
                                    case "string":
                                        return ""
                                    case "number":
                                        return "0.0"
                                    case "array":
                                        return "[]"
                                    case "object":
                                        return "{}"
                                }
                            })()}")\n`
                        }
                    }
                }
                if (property)
                    foundProperties.splice(foundProperties.indexOf(property), 1)
            }
            for (property of foundProperties) {
                outConstructor += formatPropertyLine(property)
            }
            outConstructor = outConstructor.substring(0, outConstructor.lastIndexOf("\n"))
            return outConstructor
        })()}
        }
    }
    `
    NodeDefinition = eval(`${newNodeDefinition}; NodeDefinition`);

    let title = `null`
    for (elem in oNodeDefinition.prototype) {
        NodeDefinition.prototype[elem] = oNodeDefinition.prototype[elem]
        switch (elem.toString()) {
            case "title":
                title = oNodeDefinition.prototype[elem].toString();
        }
    }
    nodeData += `createNode("${title}", (() => { ${NodeDefinition.toString()}`
    for (elem in NodeDefinition.prototype) {
        currentPrototypeVal = NodeDefinition.prototype[elem].toString();
        switch (elem.toString()) {
            case "title":
                break;
            case "color":
            case "bigText":
            case "collapsible":
            case "icon":
            case "title_mode":
            case "description":
                nodeData += `\nNodeDefinition.prototype.${elem.toString()} = "${currentPrototypeVal.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`
                break;
            default:
                nodeData += `\nNodeDefinition.prototype.${elem.toString()} = ${currentPrototypeVal}`
        }
    }
    nodeData += `\n\treturn NodeDefinition\n})())\n\n`
    availableNodes[title] = NodeFunction
    const { extractNodeSchemaFromDefinition } = require('./nodeSchema')
    nodeMetadata[title] = extractNodeSchemaFromDefinition(oNodeDefinition)
    numNodesImported++;
    //log(`Imported node ${title}`)
}

var UglifyJS = require("uglify-js");
const setupNodes = async (dir) => {
    if (!dir)
        dir = path.join(__dirname, "../nodes")
    const nodes = await fs.readdir(dir)
    for (nodeEntry of nodes) {
        if (nodeEntry.endsWith(".js")) {
            await importNode(path.join(dir, nodeEntry))
        }
        else {
            await setupNodes(path.join(dir, nodeEntry))
        }
    }
    //return UglifyJS.minify(nodeData).code;
    return nodeData
}

const getAvailableNodes = () => {
    return availableNodes
}

const getNumNodesImported = () => {
    return numNodesImported;
}

const getNodeMetadata = (title) => nodeMetadata[title] || null

const getNodeMetadataList = () =>
    Object.values(nodeMetadata).sort((a, b) => a.title.localeCompare(b.title))

module.exports = {
    getAvailableNodes,
    setupNodes,
    getNumNodesImported,
    getNodeMetadata,
    getNodeMetadataList,
    parseCallArguments,
    parseEnumPropertyCall,
    formatPropertyLine,
    formatBooleanPropertyLine,
    normalizeBooleanDefault,
}