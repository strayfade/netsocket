const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("ID", "string");
        this.addInput("Attributes (JSON)", "string");
        this.addProperty("Attributes (JSON)", "{\"name\":\"Living room\"}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Success", "boolean");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Groups/Update Group Attributes"
NodeDefinition.prototype.description = "Updates group attributes by ID using a JSON patch (name, lights, class)."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const group = await api.groups.getGroup(number(params.ID))
        const updated = mergeModelPayload(group, json(params["Attributes (JSON)"]))
        const success = await api.groups.updateGroupAttributes(updated)
        await behaviors.populateNextNodeLinks([!!success])
    })
}

module.exports = { NodeDefinition, NodeFunction }
