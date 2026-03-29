const { log, logColors } = require('../log')
const NodeRegistry = require('../manager/nodeImporter').getAvailableNodes()

const { getNodes, setNodes } = require('./saveState')

const padValues = (graphJSON, toIdx) => {
  if (!graphJSON.currentValues) {
    graphJSON.currentValues = []
  }
  while (graphJSON.currentValues.length <= toIdx)
    graphJSON.currentValues.push(null)
  return graphJSON
}

async function executeGraph(nodeToTrigger, customInputs) {
  if (!nodeToTrigger) return;
  const impl = NodeRegistry[nodeToTrigger.type]
  if (impl) {
    try {
      const getInputs = async () => {
        let inputs = {}
        if (customInputs)
          return customInputs
        let allNodes = getNodes();
        if (nodeToTrigger.inputs) {
          for (const i of nodeToTrigger.inputs) {
            if (i.link) {
              let link = allNodes.nodes.links.find((link) => link[0] == i.link)
              if (link[5] == -1) continue;
              let connectedNode = allNodes.nodes.nodes.find((node) => node.id == link[1])
              let isPureNode = true;
              if (connectedNode.inputs) {
                for (linkType of connectedNode.inputs) {
                  if (linkType.type == -1)
                    isPureNode = false;
                }
              }
              if (connectedNode.outputs) {
                for (linkType of connectedNode.outputs) {
                  if (linkType.type == -1)
                    isPureNode = false;
                }
              }
              if (isPureNode) {
                await executeGraph(connectedNode)
                allNodes = getNodes()
              }
              inputs[i.name] = allNodes.currentValues[link[0]]
            }
            else {
              inputs[i.name] = null
              if (nodeToTrigger.properties[i.name]) {
                inputs[i.name] = nodeToTrigger.properties[i.name]
              }
            }
          }
        }
        else {
          if (nodeToTrigger.properties) {
            for (property in nodeToTrigger.properties) {
              inputs[property] = nodeToTrigger.properties[property]
            }
          }
        }
        return inputs
      }
      const populateNextNodeLinks = async (nodeOutputValues = []) => {
        let graphJSON = getNodes()
        let currentNodeConnectedOutputLinks = nodeToTrigger.outputs
        for (output of currentNodeConnectedOutputLinks) {
          if (output.links) {
            for (linkId of output.links) {
              graphJSON = padValues(graphJSON, linkId)
              let outValIdx = currentNodeConnectedOutputLinks.indexOf(output);
              if (outValIdx <= nodeOutputValues.length - 1) {
                graphJSON.currentValues[linkId] = nodeOutputValues[outValIdx]
              }
            }
          }
        }
        setNodes(graphJSON)
      }
      const getOutputNodeGroups = () => {
        let outputNodeGroups = []
        let currentNodeConnectedOutputLinks = nodeToTrigger.outputs
        let currIdx = 0
        for (output of currentNodeConnectedOutputLinks) {
          if (output.links) {
            for (linkId of output.links) {
              let graphJSON = getNodes()
              if (graphJSON.nodes.links.find((link) => link[0] == linkId)[5] == -1) {
                while (outputNodeGroups.length <= currIdx)
                  outputNodeGroups.push([])
                outputNodeGroups[currIdx].push(graphJSON.nodes.nodes.find((node) => node.id == graphJSON.nodes.links.find((link) => link[0] == linkId)[3]))
              }
            }
          }
          currIdx++
        }
        return outputNodeGroups
      }
      const triggerNodeGroup = async (nodes = []) => {
        for (currNode of nodes) {
          await executeGraph(currNode)
        }
      }
      let inputs = await getInputs(nodeToTrigger)
      await impl(
        nodeToTrigger.properties,
        inputs,
        {
          populateNextNodeLinks,
          getOutputNodeGroups,
          triggerNodeGroup
        }
      );
    }
    catch (exception) {
      log(exception, logColors.Error)
    }
  }
  else {
    log(`No implementation found for ${nodeToTrigger.type}`, logColors.Error)
  }
}

module.exports = { executeGraph }