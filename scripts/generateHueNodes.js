'use strict'

const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '../server/nodes/smartHome/philipsHue')
const TITLE_PREFIX = 'Smart Home/Philips Hue'

const header = `const { string, number, json, hueModel, failObject, failArray, failString, failBool, failNumber, runHueRead, runHueWrite, runHueDiscovery, runHueRemoteRead, runHueRemoteWrite, mergeModelPayload } = require('../../../utils/hueNodeHelpers')
const { GroupState, SceneLightState } = require('../../../utils/hueApi')
const { hueDiscovery } = require('../../../utils/hueApi')
`

function emitReadNode({ file, folder, title, description, inputs, outputs, body, runner = 'runHueRead' }) {
    const inputLines = (inputs || []).map((input) => {
        let line = `        this.addInput("${input.name}", "${input.type}");`
        if (input.property != null)
            line += `\n        this.addProperty("${input.name}", ${JSON.stringify(input.property)});`
        return line
    }).join('\n')
    const outputLines = (outputs || []).map((o) => {
        const type = o.type || (o.fail === 'failArray' ? 'array' : 'object')
        return `        this.addOutput("${o.name}", "${type}");`
    }).join('\n')
    const failValues = (outputs || []).map((o) => {
        const type = o.type || (o.fail === 'failArray' ? 'array' : 'object')
        return o.fail ?? (type === 'array' ? 'failArray' : 'failObject')
    }).join(', ')

    const content = `${header}
class NodeDefinition {
    constructor() {
${inputLines}
${outputLines}
    }
}
NodeDefinition.prototype.title = "${TITLE_PREFIX}/${folder}/${title}"
NodeDefinition.prototype.description = ${JSON.stringify(description)}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    const fnParam = runner === 'runHueDiscovery' ? '' : runner === 'runHueRemoteRead' ? 'remote' : 'api'
    return ${runner}(behaviors, [${failValues}], async (${fnParam}) => {
${body}
    })
}

module.exports = { NodeDefinition, NodeFunction }
`
    fs.writeFileSync(path.join(OUT_DIR, file), content)
}

function emitWriteNode({ file, folder, title, description, inputs, outputs, body, runner = 'runHueWrite' }) {
    const inputLines = (inputs || []).map((input) => {
        let line = `        this.addInput("", LiteGraph.EVENT);\n`
        if (inputs[0]?.name !== '')
            line = ''
        return line
    })
    // rebuild properly
    const ctorInputs = ['        this.addInput("", LiteGraph.EVENT);']
    for (const input of (inputs || [])) {
        let line = `        this.addInput("${input.name}", "${input.type}");`
        if (input.property != null)
            line += `\n        this.addProperty("${input.name}", ${JSON.stringify(input.property)});`
        if (input.enum)
            line += `\n        this.addEnumProperty("${input.name}", ${JSON.stringify(input.enumDefault)}, ${JSON.stringify(input.enum)});`
        ctorInputs.push(line)
    }
    const outputLines = ['        this.addOutput("", LiteGraph.EVENT);']
    for (const o of (outputs || []))
        outputLines.push(`        this.addOutput("${o.name}", "${o.type}");`)

    const dataPopulate = (outputs || []).length
        ? `\n        await behaviors.populateNextNodeLinks([${(outputs || []).map((o) => o.expr || 'failBool').join(', ')}])`
        : ''

    const fnParams = runner.includes('Remote') ? 'remote, behaviors' : 'api, behaviors'

    const content = `${header}
class NodeDefinition {
    constructor() {
${ctorInputs.join('\n')}
${outputLines.join('\n')}
    }
}
NodeDefinition.prototype.title = "${TITLE_PREFIX}/${folder}/${title}"
NodeDefinition.prototype.description = ${JSON.stringify(description)}
NodeDefinition.prototype.color = "white"
NodeDefinition.prototype.icon = "light"

const NodeFunction = async (node, params, behaviors) => {
    return ${runner}(behaviors, async (${fnParams}) => {
${body}${dataPopulate}
    })
}

module.exports = { NodeDefinition, NodeFunction }
`
    fs.writeFileSync(path.join(OUT_DIR, file), content)
}

// --- Lights ---
emitReadNode({
    folder: 'Lights',
    file: 'getAllLights.js',
    title: 'Get All Lights',
    description: 'Returns all lights registered on the Hue bridge.',
    outputs: [{ name: 'Lights', type: 'array', fail: 'failArray' }],
    body: '        return [await api.lights.getAll()]',
})

emitReadNode({
    folder: 'Lights',
    file: 'getLightById.js',
    title: 'Get Light by ID',
    description: 'Returns a single Hue light by its bridge ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Light', type: 'object' }],
    body: '        return [await api.lights.getLight(string(params.ID))]',
})

emitReadNode({
    folder: 'Lights',
    file: 'getNewLights.js',
    title: 'Get New Lights',
    description: 'Returns lights discovered by the bridge that are not yet fully configured.',
    outputs: [{ name: 'Lights', type: 'array', fail: 'failArray' }],
    body: '        return [await api.lights.getNew()]',
})

emitWriteNode({
    folder: 'Lights',
    file: 'searchForNewLights.js',
    title: 'Search for New Lights',
    description: 'Starts a bridge search for new lights. This can take up to 30 seconds.',
    outputs: [{ name: 'Started', type: 'boolean', expr: 'started' }],
    body: '        const started = await api.lights.searchForNew()',
})

emitReadNode({
    folder: 'Lights',
    file: 'getLightAttributesAndState.js',
    title: 'Get Light Attributes and State',
    description: 'Returns full attributes and state for a light by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Light Data', type: 'object' }],
    body: '        return [await api.lights.getLightAttributesAndState(string(params.ID))]',
})

emitWriteNode({
    folder: 'Lights',
    file: 'renameLight.js',
    title: 'Rename Light',
    description: 'Renames a Hue light by ID.',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'Name', type: 'string' },
    ],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: `        const light = await api.lights.getLight(string(params.ID))
        light.name = string(params.Name)
        const success = await api.lights.renameLight(light)`,
})

emitWriteNode({
    folder: 'Lights',
    file: 'deleteLight.js',
    title: 'Delete Light',
    description: 'Removes a light from the Hue bridge by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.lights.deleteLight(string(params.ID))',
})

emitWriteNode({
    folder: 'Lights',
    file: 'setLightState.js',
    title: 'Set Light State',
    description: 'Sets a light state using a JSON object (on, bri, hue, sat, xy, ct, etc.).',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'State (JSON)', type: 'string', property: '{"on":true,"bri":254}' },
    ],
    outputs: [{ name: 'Result', type: 'object', expr: 'result' }],
    body: '        const result = await api.lights.setLightState(string(params.ID), json(params["State (JSON)"]))',
})

// --- Groups ---
emitReadNode({
    folder: 'Groups',
    file: 'getAllGroups.js',
    title: 'Get All Groups',
    description: 'Returns all groups on the Hue bridge.',
    outputs: [{ name: 'Groups', type: 'array', fail: 'failArray' }],
    body: '        return [await api.groups.getAll()]',
})

emitReadNode({
    folder: 'Groups',
    file: 'getGroupById.js',
    title: 'Get Group by ID',
    description: 'Returns a single Hue group by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Group', type: 'object' }],
    body: '        return [await api.groups.getGroup(number(params.ID))]',
})

emitReadNode({
    folder: 'Groups',
    file: 'getGroupByName.js',
    title: 'Get Group by Name',
    description: 'Returns Hue groups matching the given name.',
    inputs: [{ name: 'Name', type: 'string' }],
    outputs: [{ name: 'Groups', type: 'array', fail: 'failArray' }],
    body: '        return [await api.groups.getGroupByName(string(params.Name))]',
})

emitWriteNode({
    folder: 'Groups',
    file: 'createGroup.js',
    title: 'Create Group',
    description: 'Creates a group from a type and JSON payload (name, lights, class, etc.).',
    inputs: [
        {
            name: 'Type',
            type: 'string',
            enum: ['LightGroup', 'Room', 'Zone', 'Entertainment'],
            enumDefault: 'LightGroup',
        },
        { name: 'Payload (JSON)', type: 'string', property: '{"name":"My room","lights":[]}' },
    ],
    outputs: [{ name: 'Group', type: 'object', expr: 'created' }],
    body: `        const type = string(params.Type).toLowerCase()
        const payload = json(params["Payload (JSON)"])
        const group = hueModel.createFromBridge(type, 0, payload)
        const created = await api.groups.createGroup(group)`,
})

emitWriteNode({
    folder: 'Groups',
    file: 'updateGroupAttributes.js',
    title: 'Update Group Attributes',
    description: 'Updates group attributes by ID using a JSON patch (name, lights, class).',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'Attributes (JSON)', type: 'string', property: '{"name":"Living room"}' },
    ],
    outputs: [{ name: 'Success', type: 'boolean', expr: '!!success' }],
    body: `        const group = await api.groups.getGroup(number(params.ID))
        const updated = mergeModelPayload(group, json(params["Attributes (JSON)"]))
        const success = await api.groups.updateGroupAttributes(updated)`,
})

emitWriteNode({
    folder: 'Groups',
    file: 'deleteGroup.js',
    title: 'Delete Group',
    description: 'Deletes a Hue group by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.groups.deleteGroup(number(params.ID))',
})

emitReadNode({
    folder: 'Groups',
    file: 'getGroupState.js',
    title: 'Get Group State',
    description: 'Returns the current action state for a group.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'State', type: 'object' }],
    body: '        return [await api.groups.getGroupState(number(params.ID))]',
})

emitWriteNode({
    folder: 'Groups',
    file: 'setGroupState.js',
    title: 'Set Group State',
    description: 'Sets group action state using a JSON object (on, bri, hue, etc.).',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'State (JSON)', type: 'string', property: '{"on":true}' },
    ],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: `        const state = new GroupState().populate(json(params["State (JSON)"]))
        const success = await api.groups.setGroupState(string(params.ID), state)`,
})

const groupTypeReaders = [
    ['getLightGroups.js', 'Get Light Groups', 'lightgroups', 'getLightGroups'],
    ['getLuminaries.js', 'Get Luminaries', 'luminaries', 'getLuminaries'],
    ['getLightSources.js', 'Get Light Sources', 'lightsources', 'getLightSources'],
    ['getRooms.js', 'Get Rooms', 'rooms', 'getRooms'],
    ['getZones.js', 'Get Zones', 'zones', 'getZones'],
    ['getEntertainment.js', 'Get Entertainment Groups', 'entertainment', 'getEntertainment'],
]
for (const [file, title, , method] of groupTypeReaders) {
    emitReadNode({
    folder: 'Groups',
        file,
        title,
        description: `Returns ${title.replace('Get ', '').toLowerCase()} from the Hue bridge.`,
        outputs: [{ name: 'Groups', type: 'array', fail: 'failArray' }],
        body: `        return [await api.groups.${method}()]`,
    })
}

emitWriteNode({
    folder: 'Groups',
    file: 'enableStreaming.js',
    title: 'Enable Entertainment Streaming',
    description: 'Enables streaming on an entertainment group.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.groups.enableStreaming(string(params.ID))',
})

emitWriteNode({
    folder: 'Groups',
    file: 'disableStreaming.js',
    title: 'Disable Entertainment Streaming',
    description: 'Disables streaming on an entertainment group.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.groups.disableStreaming(string(params.ID))',
})

// --- Scenes ---
emitReadNode({
    folder: 'Scenes',
    file: 'getAllScenes.js',
    title: 'Get All Scenes',
    description: 'Returns all scenes stored on the Hue bridge.',
    outputs: [{ name: 'Scenes', type: 'array', fail: 'failArray' }],
    body: '        return [await api.scenes.getAll()]',
})

emitReadNode({
    folder: 'Scenes',
    file: 'getSceneById.js',
    title: 'Get Scene by ID',
    description: 'Returns a scene by its ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Scene', type: 'object' }],
    body: '        return [await api.scenes.getScene(string(params.ID))]',
})

emitReadNode({
    folder: 'Scenes',
    file: 'getSceneByName.js',
    title: 'Get Scene by Name',
    description: 'Returns scenes matching the given name.',
    inputs: [{ name: 'Name', type: 'string' }],
    outputs: [{ name: 'Scenes', type: 'array', fail: 'failArray' }],
    body: '        return [await api.scenes.getSceneByName(string(params.Name))]',
})

emitWriteNode({
    folder: 'Scenes',
    file: 'createScene.js',
    title: 'Create Scene',
    description: 'Creates a scene from type and JSON payload.',
    inputs: [
        {
            name: 'Type',
            type: 'string',
            enum: ['LightScene', 'GroupScene'],
            enumDefault: 'LightScene',
        },
        { name: 'Payload (JSON)', type: 'string', property: '{"name":"Relax","lights":[],"type":"LightScene"}' },
    ],
    outputs: [{ name: 'Scene', type: 'object', expr: 'created' }],
    body: `        const type = string(params.Type).toLowerCase()
        const payload = json(params["Payload (JSON)"])
        const scene = hueModel.createFromBridge(type, 0, payload)
        const created = await api.scenes.createScene(scene)`,
})

emitWriteNode({
    folder: 'Scenes',
    file: 'updateScene.js',
    title: 'Update Scene',
    description: 'Updates scene metadata by ID using a JSON patch.',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'Attributes (JSON)', type: 'string', property: '{"name":"Evening"}' },
    ],
    outputs: [{ name: 'Result', type: 'object', expr: 'result' }],
    body: `        const scene = await api.scenes.getScene(string(params.ID))
        const updated = mergeModelPayload(scene, json(params["Attributes (JSON)"]))
        const result = await api.scenes.updateScene(updated)`,
})

emitWriteNode({
    folder: 'Scenes',
    file: 'updateSceneLightState.js',
    title: 'Update Scene Light State',
    description: 'Updates one light state inside a scene.',
    inputs: [
        { name: 'Scene ID', type: 'string' },
        { name: 'Light ID', type: 'string' },
        { name: 'State (JSON)', type: 'string', property: '{"on":true,"bri":200}' },
    ],
    outputs: [{ name: 'Result', type: 'object', expr: 'result' }],
    body: `        const state = new SceneLightState().populate(json(params["State (JSON)"]))
        const result = await api.scenes.updateLightState(string(params["Scene ID"]), string(params["Light ID"]), state)`,
})

emitWriteNode({
    folder: 'Scenes',
    file: 'deleteScene.js',
    title: 'Delete Scene',
    description: 'Deletes a scene by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.scenes.deleteScene(string(params.ID))',
})

emitWriteNode({
    folder: 'Scenes',
    file: 'activateScene.js',
    title: 'Activate Scene',
    description: 'Recalls a scene on the Hue bridge.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.scenes.activateScene(string(params.ID))',
})

// --- Sensors ---
emitReadNode({
    folder: 'Sensors',
    file: 'getAllSensors.js',
    title: 'Get All Sensors',
    description: 'Returns all sensors on the Hue bridge.',
    outputs: [{ name: 'Sensors', type: 'array', fail: 'failArray' }],
    body: '        return [await api.sensors.getAll()]',
})

emitReadNode({
    folder: 'Sensors',
    file: 'getSensorById.js',
    title: 'Get Sensor by ID',
    description: 'Returns a sensor by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Sensor', type: 'object' }],
    body: '        return [await api.sensors.getSensor(string(params.ID))]',
})

emitWriteNode({
    folder: 'Sensors',
    file: 'searchForNewSensors.js',
    title: 'Search for New Sensors',
    description: 'Starts a bridge search for new sensors.',
    outputs: [{ name: 'Started', type: 'boolean', expr: 'started' }],
    body: '        const started = await api.sensors.searchForNew()',
})

emitReadNode({
    folder: 'Sensors',
    file: 'getNewSensors.js',
    title: 'Get New Sensors',
    description: 'Returns sensors discovered but not yet configured.',
    outputs: [{ name: 'Sensors', type: 'array', fail: 'failArray' }],
    body: '        return [await api.sensors.getNew()]',
})

emitWriteNode({
    folder: 'Sensors',
    file: 'renameSensor.js',
    title: 'Rename Sensor',
    description: 'Renames a sensor by ID.',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'Name', type: 'string' },
    ],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: `        const sensor = await api.sensors.getSensor(string(params.ID))
        sensor.name = string(params.Name)
        const success = await api.sensors.renameSensor(sensor)`,
})

emitWriteNode({
    folder: 'Sensors',
    file: 'createSensor.js',
    title: 'Create CLIP Sensor',
    description: 'Creates a CLIP virtual sensor from type and JSON payload.',
    inputs: [
        {
            name: 'Type',
            type: 'string',
            enum: ['CLIPGenericFlag', 'CLIPGenericStatus', 'CLIPHumidity', 'CLIPLightlevel', 'CLIPOpenClose', 'CLIPPresence', 'CLIPTemperature', 'CLIPSwitch'],
            enumDefault: 'CLIPGenericFlag',
        },
        { name: 'Payload (JSON)', type: 'string', property: '{"name":"My sensor","modelid":"PHCLIPSOM01"}' },
    ],
    outputs: [{ name: 'Sensor', type: 'object', expr: 'created' }],
    body: `        const type = string(params.Type).toLowerCase()
        const payload = json(params["Payload (JSON)"])
        const sensor = hueModel.createFromBridge(type, 0, payload)
        const created = await api.sensors.createSensor(sensor)`,
})

emitWriteNode({
    folder: 'Sensors',
    file: 'deleteSensor.js',
    title: 'Delete Sensor',
    description: 'Deletes a sensor by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.sensors.deleteSensor(string(params.ID))',
})

emitWriteNode({
    folder: 'Sensors',
    file: 'updateSensorConfig.js',
    title: 'Update Sensor Config',
    description: 'Updates sensor configuration attributes by ID.',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'Config (JSON)', type: 'string', property: '{}' },
    ],
    outputs: [{ name: 'Result', type: 'object', expr: 'result' }],
    body: `        const sensor = await api.sensors.getSensor(string(params.ID))
        if (sensor.config)
            Object.assign(sensor.config, json(params["Config (JSON)"]))
        const result = await api.sensors.updateSensorConfig(sensor)`,
})

emitWriteNode({
    folder: 'Sensors',
    file: 'updateSensorState.js',
    title: 'Update Sensor State',
    description: 'Updates sensor state attributes by ID.',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'State (JSON)', type: 'string', property: '{}' },
    ],
    outputs: [{ name: 'Result', type: 'object', expr: 'result' }],
    body: `        const sensor = await api.sensors.getSensor(string(params.ID))
        if (sensor.state)
            Object.assign(sensor.state, json(params["State (JSON)"]))
        const result = await api.sensors.updateSensorState(sensor)`,
})

// --- Schedules ---
emitReadNode({
    folder: 'Schedules',
    file: 'getAllSchedules.js',
    title: 'Get All Schedules',
    description: 'Returns all schedules on the Hue bridge.',
    outputs: [{ name: 'Schedules', type: 'array', fail: 'failArray' }],
    body: '        return [await api.schedules.getAll()]',
})

emitReadNode({
    folder: 'Schedules',
    file: 'getScheduleById.js',
    title: 'Get Schedule by ID',
    description: 'Returns a schedule by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Schedule', type: 'object' }],
    body: '        return [await api.schedules.getSchedule(string(params.ID))]',
})

emitReadNode({
    folder: 'Schedules',
    file: 'getScheduleByName.js',
    title: 'Get Schedule by Name',
    description: 'Returns schedules matching the given name.',
    inputs: [{ name: 'Name', type: 'string' }],
    outputs: [{ name: 'Schedules', type: 'array', fail: 'failArray' }],
    body: '        return [await api.schedules.getScheduleByName(string(params.Name))]',
})

emitWriteNode({
    folder: 'Schedules',
    file: 'createSchedule.js',
    title: 'Create Schedule',
    description: 'Creates a schedule from a JSON payload.',
    inputs: [{ name: 'Payload (JSON)', type: 'string', property: '{"name":"Wake up","command":{"address":"/api/<username>/groups/0/action","method":"PUT","body":{"on":true}},"localtime":"W0770450"}' }],
    outputs: [{ name: 'Schedule', type: 'object', expr: 'created' }],
    body: `        const payload = json(params["Payload (JSON)"])
        const schedule = hueModel.createFromBridge('schedule', 0, payload)
        const created = await api.schedules.createSchedule(schedule)`,
})

emitWriteNode({
    folder: 'Schedules',
    file: 'updateSchedule.js',
    title: 'Update Schedule',
    description: 'Updates a schedule by ID using a JSON patch.',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'Attributes (JSON)', type: 'string', property: '{"name":"Updated"}' },
    ],
    outputs: [{ name: 'Success', type: 'boolean', expr: '!!success' }],
    body: `        const schedule = await api.schedules.getSchedule(string(params.ID))
        const updated = mergeModelPayload(schedule, json(params["Attributes (JSON)"]))
        const success = await api.schedules.updateSchedule(updated)`,
})

emitWriteNode({
    folder: 'Schedules',
    file: 'deleteSchedule.js',
    title: 'Delete Schedule',
    description: 'Deletes a schedule by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.schedules.deleteSchedule(string(params.ID))',
})

// --- Rules ---
emitReadNode({
    folder: 'Rules',
    file: 'getAllRules.js',
    title: 'Get All Rules',
    description: 'Returns all rules on the Hue bridge.',
    outputs: [{ name: 'Rules', type: 'array', fail: 'failArray' }],
    body: '        return [await api.rules.getAll()]',
})

emitReadNode({
    folder: 'Rules',
    file: 'getRuleById.js',
    title: 'Get Rule by ID',
    description: 'Returns a rule by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Rule', type: 'object' }],
    body: '        return [await api.rules.getRule(number(params.ID))]',
})

emitReadNode({
    folder: 'Rules',
    file: 'getRuleByName.js',
    title: 'Get Rule by Name',
    description: 'Returns rules matching the given name.',
    inputs: [{ name: 'Name', type: 'string' }],
    outputs: [{ name: 'Rules', type: 'array', fail: 'failArray' }],
    body: '        return [await api.rules.getRuleByName(string(params.Name))]',
})

emitWriteNode({
    folder: 'Rules',
    file: 'createRule.js',
    title: 'Create Rule',
    description: 'Creates a rule from a JSON payload.',
    inputs: [{ name: 'Payload (JSON)', type: 'string', property: '{"name":"My rule","conditions":[],"actions":[]}' }],
    outputs: [{ name: 'Rule', type: 'object', expr: 'created' }],
    body: `        const payload = json(params["Payload (JSON)"])
        const rule = hueModel.createFromBridge('rule', 0, payload)
        const created = await api.rules.createRule(rule)`,
})

emitWriteNode({
    folder: 'Rules',
    file: 'updateRule.js',
    title: 'Update Rule',
    description: 'Updates a rule by ID using a JSON patch.',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'Attributes (JSON)', type: 'string', property: '{}' },
    ],
    outputs: [{ name: 'Result', type: 'object', expr: 'result' }],
    body: `        const rule = await api.rules.getRule(number(params.ID))
        const updated = mergeModelPayload(rule, json(params["Attributes (JSON)"]))
        const result = await api.rules.updateRule(updated)`,
})

emitWriteNode({
    folder: 'Rules',
    file: 'deleteRule.js',
    title: 'Delete Rule',
    description: 'Deletes a rule by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.rules.deleteRule(number(params.ID))',
})

// --- Resource links ---
emitReadNode({
    folder: 'Resource Links',
    file: 'getAllResourceLinks.js',
    title: 'Get All Resource Links',
    description: 'Returns all resource links on the Hue bridge.',
    outputs: [{ name: 'Resource Links', type: 'array', fail: 'failArray' }],
    body: '        return [await api.resourceLinks.getAll()]',
})

emitReadNode({
    folder: 'Resource Links',
    file: 'getResourceLinkById.js',
    title: 'Get Resource Link by ID',
    description: 'Returns a resource link by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Resource Link', type: 'object' }],
    body: '        return [await api.resourceLinks.getResourceLink(string(params.ID))]',
})

emitReadNode({
    folder: 'Resource Links',
    file: 'getResourceLinkByName.js',
    title: 'Get Resource Link by Name',
    description: 'Returns resource links matching the given name.',
    inputs: [{ name: 'Name', type: 'string' }],
    outputs: [{ name: 'Resource Links', type: 'array', fail: 'failArray' }],
    body: '        return [await api.resourceLinks.getResourceLinkByName(string(params.Name))]',
})

emitWriteNode({
    folder: 'Resource Links',
    file: 'createResourceLink.js',
    title: 'Create Resource Link',
    description: 'Creates a resource link from a JSON payload.',
    inputs: [{ name: 'Payload (JSON)', type: 'string', property: '{"name":"My link","links":[],"class":"device"}' }],
    outputs: [{ name: 'Resource Link', type: 'object', expr: 'created' }],
    body: `        const payload = json(params["Payload (JSON)"])
        const link = hueModel.createFromBridge('resourcelink', 0, payload)
        const created = await api.resourceLinks.createResourceLink(link)`,
})

emitWriteNode({
    folder: 'Resource Links',
    file: 'updateResourceLink.js',
    title: 'Update Resource Link',
    description: 'Updates a resource link by ID using a JSON patch.',
    inputs: [
        { name: 'ID', type: 'string' },
        { name: 'Attributes (JSON)', type: 'string', property: '{}' },
    ],
    outputs: [{ name: 'Result', type: 'object', expr: 'result' }],
    body: `        const link = await api.resourceLinks.getResourceLink(string(params.ID))
        const updated = mergeModelPayload(link, json(params["Attributes (JSON)"]))
        const result = await api.resourceLinks.updateResourceLink(updated)`,
})

emitWriteNode({
    folder: 'Resource Links',
    file: 'deleteResourceLink.js',
    title: 'Delete Resource Link',
    description: 'Deletes a resource link by ID.',
    inputs: [{ name: 'ID', type: 'string' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.resourceLinks.deleteResourceLink(string(params.ID))',
})

// --- Configuration (Bridge) ---
emitReadNode({
    folder: 'Bridge',
    file: 'getBridgeConfiguration.js',
    title: 'Get Bridge Configuration',
    description: 'Returns the authenticated bridge configuration object.',
    outputs: [{ name: 'Configuration', type: 'object' }],
    body: '        return [await api.configuration.getConfiguration()]',
})

emitReadNode({
    folder: 'Bridge',
    file: 'getAllConfiguration.js',
    title: 'Get All Configuration',
    description: 'Returns the full bridge state including lights, groups, scenes, and more.',
    outputs: [{ name: 'Configuration', type: 'object' }],
    body: '        return [await api.configuration.getAll()]',
})

emitWriteNode({
    folder: 'Bridge',
    file: 'updateConfiguration.js',
    title: 'Update Bridge Configuration',
    description: 'Updates bridge configuration using a JSON payload.',
    inputs: [{ name: 'Config (JSON)', type: 'string', property: '{}' }],
    outputs: [{ name: 'Success', type: 'boolean', expr: 'success' }],
    body: '        const success = await api.configuration.updateConfiguration(json(params["Config (JSON)"]))',
})

emitReadNode({
    folder: 'Bridge',
    file: 'getCapabilities.js',
    title: 'Get Capabilities',
    description: 'Returns bridge capability metadata.',
    outputs: [{ name: 'Capabilities', type: 'object' }],
    body: '        return [await api.capabilities.getAll()]',
})

console.log('Generated Philips Hue nodes in', OUT_DIR)
