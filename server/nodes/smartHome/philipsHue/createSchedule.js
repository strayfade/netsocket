const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')

class NodeDefinition {
    constructor() {
        this.addInput("", LiteGraph.EVENT);
        this.addInput("Payload (JSON)", "string");
        this.addProperty("Payload (JSON)", "{\"name\":\"Wake up\",\"command\":{\"address\":\"/api/<username>/groups/0/action\",\"method\":\"PUT\",\"body\":{\"on\":true}},\"localtime\":\"W0770450\"}");
        this.addOutput("", LiteGraph.EVENT);
        this.addOutput("Schedule", "object");
    }
}
NodeDefinition.prototype.title = "Smart Home/Philips Hue/Schedules/Create Schedule"
NodeDefinition.prototype.description = "Creates a schedule from a JSON payload."
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return runHueWrite(behaviors, async (api, behaviors) => {
        const payload = json(params["Payload (JSON)"])
        const schedule = hueModel.createFromBridge('schedule', 0, payload)
        const created = await api.schedules.createSchedule(schedule)
        await behaviors.populateNextNodeLinks([created])
    })
}

module.exports = { NodeDefinition, NodeFunction }
