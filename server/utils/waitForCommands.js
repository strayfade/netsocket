const { log, logColors } = require('../log')

const { getNodes, setNodes } = require('../manager/saveState')
const { executeGraph } = require('../manager/execute')

const onNewCommand = async (textContent) => {
    log(`Command received: ${textContent}`)

    // Trigger proper nodes in graph
    if (!getNodes().nodes) return;
    let nodes = getNodes().nodes.nodes
    for (i of nodes) {
        if (i.type == "Triggers/Command Palette") {
            await executeGraph(i, {
                "Content": textContent,
            })
        }
    }
}

module.exports = { onNewCommand }