const path = require('path')
const fs = require('fs').promises
const { config } = require('../config')

let graphNodes = [];
const populateNodes = async () => {
    try {
        graphNodes = JSON.parse(await fs.readFile(config.storage.nodes, { encoding: "utf-8" }))
    }
    catch {
        graphNodes = [];
        await fs.writeFile(config.storage.nodes, `[]`, { encoding: "utf-8" })
    }
}
const saveNodes = async () => {
    let nodesStr = JSON.stringify(graphNodes)
    await fs.writeFile(config.storage.nodes, nodesStr, { encoding: "utf-8" })
}
setInterval(saveNodes, 1000)

const getNodes = () => {
    return graphNodes
}
const setNodes = (newNodes) => {
    graphNodes = newNodes
}

module.exports = { getNodes, setNodes, populateNodes }