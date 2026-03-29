const path = require('path')
const { log, logColors } = require('../log')

const fs = require('fs').promises

const availableNodes = {}

let nodeData = ""
const getInputPropertyParams = (str) => {
    const match = str.match(/\((.*)\)/);
    if (!match) return null;

    const params = match[1]
        .split(',')
        .map(p => p.trim().replace(/^["']|["']$/g, ''));

    return {
        first: params[0],
        last: params[params.length - 1]
    };
}
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
            for (line of oNodeDefinition.prototype.constructor.toString().split("\n")) {
                hasCompletedLines++;
                if (hasSkippedLines < 2) {
                    hasSkippedLines++;
                    continue;
                }
                if (hasCompletedLines >= oNodeDefinition.prototype.constructor.toString().split("\n").length - 1) continue;
                line = line.trim()
                if (line.includes("addInput")) {
                    let params = getInputPropertyParams(line)
                    expectedInputs.push({
                        name: params.first,
                        type: params.last
                    })
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
                    outConstructor += `\t\tthis.addInput("${input.name}", "${input.type}")\n`
                    
                    if (property && input.type != "LiteGraph.EVENT") {
                        outConstructor += `\t\tthis.addProperty("${input.name}", "${property.defaultValue}")\n`
                    }
                    else if (input.type != "LiteGraph.EVENT") {
                        outConstructor += `\t\tthis.addProperty("${input.name}", "${(() => {
                            switch (input.type) {
                                case "string":
                                    return ""
                                case "number":
                                    return "0.0"
                                case "boolean":
                                    return "false"
                                case "array":
                                    return "[]"
                            }
                        })()}")\n`
                    }
                }
                if (property)
                    foundProperties.splice(foundProperties.indexOf(property), 1)
            }
            for (property of foundProperties) {
                outConstructor += `\t\tthis.addProperty("${property.name}", "${property.defaultValue}")\n`
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
                nodeData += `\nNodeDefinition.prototype.${elem.toString()} = "${currentPrototypeVal}"`
                break;
            default:
                nodeData += `\nNodeDefinition.prototype.${elem.toString()} = ${currentPrototypeVal}`
        }
    }
    nodeData += `\n\treturn NodeDefinition\n})())\n\n`
    availableNodes[title] = NodeFunction
    //log(`Imported node ${title}`)
}

var UglifyJS = require("uglify-js");
const { on } = require('events')
const setupNodes = async () => {
    const nodes = await fs.readdir(path.join(__dirname, "../nodes"))
    for (nodeEntry of nodes) {
        if (nodeEntry.endsWith(".js")) {
            await importNode(path.join(__dirname, "../nodes", nodeEntry))
        }
    }
    //return UglifyJS.minify(nodeData).code;
    return nodeData
}

const getAvailableNodes = () => {
    return availableNodes
}

module.exports = { getAvailableNodes, setupNodes }