'use strict'

const fs = require('fs')
const path = require('path')

const HUE_DIR = path.join(__dirname, '../server/nodes/smartHome/philipsHue')

const REMOVE = [
    'createRemoteUser.js',
    'createUser.js',
    'deleteUser.js',
    'getAllUsers.js',
    'getBridgeDescription.js',
    'getCachedState.js',
    'getLastSyncTime.js',
    'getLightDefinition.js',
    'getRemoteAccessCredentials.js',
    'getRemoteToken.js',
    'getUnauthenticatedConfig.js',
    'getUserByName.js',
    'getUserByUsername.js',
    'isSyncing.js',
    'mdnsSearch.js',
    'nupnpSearch.js',
    'pressLinkButton.js',
    'refreshRemoteTokens.js',
    'syncWithBridge.js',
]

const FOLDER_BY_FILE = {
    'activateScene.js': 'Scenes',
    'createGroup.js': 'Groups',
    'createResourceLink.js': 'Resource Links',
    'createRule.js': 'Rules',
    'createScene.js': 'Scenes',
    'createSchedule.js': 'Schedules',
    'createSensor.js': 'Sensors',
    'deleteGroup.js': 'Groups',
    'deleteLight.js': 'Lights',
    'deleteResourceLink.js': 'Resource Links',
    'deleteRule.js': 'Rules',
    'deleteScene.js': 'Scenes',
    'deleteSchedule.js': 'Schedules',
    'deleteSensor.js': 'Sensors',
    'disableStreaming.js': 'Groups',
    'enableStreaming.js': 'Groups',
    'getAllConfiguration.js': 'Bridge',
    'getAllGroups.js': 'Groups',
    'getAllLights.js': 'Lights',
    'getAllResourceLinks.js': 'Resource Links',
    'getAllRules.js': 'Rules',
    'getAllScenes.js': 'Scenes',
    'getAllSchedules.js': 'Schedules',
    'getAllSensors.js': 'Sensors',
    'getBridgeConfiguration.js': 'Bridge',
    'getCapabilities.js': 'Bridge',
    'getEntertainment.js': 'Groups',
    'getGroupById.js': 'Groups',
    'getGroupByName.js': 'Groups',
    'getGroupState.js': 'Groups',
    'getLightAttributesAndState.js': 'Lights',
    'getLightById.js': 'Lights',
    'getLightByName.js': 'Lights',
    'getLightGroups.js': 'Groups',
    'getLightSources.js': 'Groups',
    'getLightStateById.js': 'Lights',
    'getLightStateByName.js': 'Lights',
    'getLuminaries.js': 'Groups',
    'getNewLights.js': 'Lights',
    'getNewSensors.js': 'Sensors',
    'getResourceLinkById.js': 'Resource Links',
    'getResourceLinkByName.js': 'Resource Links',
    'getRooms.js': 'Groups',
    'getRuleById.js': 'Rules',
    'getRuleByName.js': 'Rules',
    'getSceneById.js': 'Scenes',
    'getSceneByName.js': 'Scenes',
    'getScheduleById.js': 'Schedules',
    'getScheduleByName.js': 'Schedules',
    'getSensorById.js': 'Sensors',
    'getZones.js': 'Groups',
    'renameLight.js': 'Lights',
    'renameSensor.js': 'Sensors',
    'searchForNewLights.js': 'Lights',
    'searchForNewSensors.js': 'Sensors',
    'setGroupState.js': 'Groups',
    'setLightState.js': 'Lights',
    'setLightStateById.js': 'Lights',
    'setLightStateByName.js': 'Lights',
    'updateConfiguration.js': 'Bridge',
    'updateGroupAttributes.js': 'Groups',
    'updateResourceLink.js': 'Resource Links',
    'updateRule.js': 'Rules',
    'updateScene.js': 'Scenes',
    'updateSceneLightState.js': 'Scenes',
    'updateSchedule.js': 'Schedules',
    'updateSensorConfig.js': 'Sensors',
    'updateSensorState.js': 'Sensors',
}

for (const file of REMOVE) {
    const fullPath = path.join(HUE_DIR, file)
    if (fs.existsSync(fullPath))
        fs.unlinkSync(fullPath)
}

for (const file of fs.readdirSync(HUE_DIR).filter((name) => name.endsWith('.js'))) {
    const folder = FOLDER_BY_FILE[file]
    if (!folder)
        throw new Error(`Missing folder mapping for ${file}`)
    const fullPath = path.join(HUE_DIR, file)
    const source = fs.readFileSync(fullPath, 'utf8')
    const match = source.match(/NodeDefinition\.prototype\.title = "Smart Home\/Philips Hue\/([^"]+)"/)
    if (!match)
        throw new Error(`Could not parse title in ${file}`)
    const titlePath = match[1]
    if (titlePath.includes('/'))
        continue
    const nodeName = titlePath
    const nextTitle = `Smart Home/Philips Hue/${folder}/${nodeName}`
    const updated = source.replace(
        /NodeDefinition\.prototype\.title = "Smart Home\/Philips Hue\/[^"]+"/,
        `NodeDefinition.prototype.title = "${nextTitle}"`
    )
    fs.writeFileSync(fullPath, updated)
}

console.log(`Removed ${REMOVE.length} nodes, updated titles in ${Object.keys(FOLDER_BY_FILE).length} nodes`)
