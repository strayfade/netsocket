const HomeAssistant = require('homeassistant')
const settingsManager = require('../../manager/settingsManager')
const { log, logColors } = require('../../log')

let hass;

const setupHomeAssistant = () => {
    try {
        hass = new HomeAssistant({
            // Your Home Assistant host
            // Optional, defaults to http://locahost
            host: settingsManager.getSetting("homeAssistant.host"),

            // Your Home Assistant port number
            // Optional, defaults to 8123
            port: parseInt(settingsManager.getSetting("homeAssistant.port")),

            // Your long lived access token generated on your profile page.
            // Optional
            token: settingsManager.getSetting("homeAssistant.token"),

            // Your Home Assistant Legacy API password
            // Optional
            password: settingsManager.getSetting("homeAssistant.legacyPassword"),

            // Ignores SSL certificate errors, use with caution
            // Optional, defaults to false
            ignoreCert: false
        });
    }
    catch (e) {
        log(`Error while setting up Home Assistant: ${e}`, logColors.Error)
    }
}
const tryCallService = (service, domain, serviceData) => {
    hass.services.call(service, domain, serviceData)
}
const getStatus = () => {
    return hass.status();
}
const getConfig = () => {
    return hass.config();
}
const getDiscoveryInfo = () => {
    return hass.discoveryInfo();
}
const getEvents = () => {
    return hass.events.list();
}
const fireEvent = (eventType, domain, service, serviceData) => {
    hass.events.fire(
        eventType, {
        domain,
        service,
        service_data: serviceData
    })
}

module.exports = { setupHomeAssistant, tryCallService, getStatus, getConfig, getDiscoveryInfo, getEvents, fireEvent }