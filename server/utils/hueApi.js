const { config } = require('../config')
const { log, logColors } = require('../log')
const settingsManager = require('../manager/settingsManager')
require('../manager/nodePreferencesRegistry').addPref(
    'Philips Hue',
    'philipsHue.ip',
    'Bridge IP Address',
    'text',
    '',
    '<p>LAN address of your Hue Bridge (for example <code>192.168.1.23</code>). Used to open the local Hue API connection.</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Philips Hue',
    'philipsHue.user',
    'Bridge User',
    'text',
    '',
    '<p>API username created when you pair the Bridge (the “whitelist” user string from the Hue developer flow).</p>'
)
require('../manager/nodePreferencesRegistry').addPref(
    'Philips Hue',
    'philipsHue.clientKey',
    'Client Key',
    'text',
    '',
    '<p>Optional. Used for Hue Secure / entertainment features when required by your setup; leave empty if you only use basic light control.</p>'
)

const hueApiLib = require('node-hue-api').v3.api
const LightState = require('node-hue-api').v3.lightStates.LightState;

let hueApi;
let hueApiStable = false;
const setupHueApi = async () => {
    try {
        const ip = settingsManager.getSetting('philipsHue.ip') || ''
        const user = settingsManager.getSetting('philipsHue.user') || ''
        if (!ip || !user) {
            log('Philips Hue settings not configured; skipping connection', logColors.Warning)
            return
        }
        hueApi = await hueApiLib.createLocal(ip).connect(user);
        hueApiStable = true
    }
    catch (e) {
        log(`Failed to connect to Philips Hue (${e})`, logColors.Warning)
    }
}
setupHueApi();

const getHueApi = () => {
    return hueApi
}
const doesHueApiWork = () => {
    if (!hueApiStable)
        log(`Failed to connect to Philips Hue from netsocket!`)
    return hueApiStable
}
module.exports = { getHueApi, LightState, hueApiLib, doesHueApiWork, setupHueApi }