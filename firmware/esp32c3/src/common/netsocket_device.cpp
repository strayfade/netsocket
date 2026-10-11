#include "netsocket_device.h"

#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiManager.h>

namespace netsocket {

static const char* kAvailabilitySuffix = "availability";

String deviceId() {
    uint64_t mac = ESP.getEfuseMac();
    char buf[16];
    snprintf(buf, sizeof(buf), "c3-%04x%04x%04x",
             (uint16_t)(mac >> 32), (uint16_t)(mac >> 16), (uint16_t)mac);
    return String(buf);
}

DeviceConfig loadConfig() {
    Preferences prefs;
    DeviceConfig cfg;
    prefs.begin("netsocket", true);
    cfg.mqttHost = prefs.getString("mqtt_host", "");
    cfg.mqttPort = (uint16_t)prefs.getUShort("mqtt_port", 1883);
    cfg.mqttUser = prefs.getString("mqtt_user", "");
    cfg.mqttPass = prefs.getString("mqtt_pass", "");
    cfg.room = prefs.getString("room", "");
    cfg.friendlyName = prefs.getString("name", "");
    prefs.end();
    return cfg;
}

void saveConfig(const DeviceConfig& cfg) {
    Preferences prefs;
    prefs.begin("netsocket", false);
    prefs.putString("mqtt_host", cfg.mqttHost);
    prefs.putUShort("mqtt_port", cfg.mqttPort);
    prefs.putString("mqtt_user", cfg.mqttUser);
    prefs.putString("mqtt_pass", cfg.mqttPass);
    prefs.putString("room", cfg.room);
    prefs.putString("name", cfg.friendlyName);
    prefs.end();
}

String topicAvailability() {
    return "netsocket/dev/" + deviceId() + "/" + kAvailabilitySuffix;
}
String topicState(const char* entity) {
    return "netsocket/dev/" + deviceId() + "/" + entity + "/state";
}
String topicSet(const char* entity) {
    return "netsocket/dev/" + deviceId() + "/" + entity + "/set";
}
String topicEvent(const char* entity) {
    return "netsocket/dev/" + deviceId() + "/" + entity + "/event";
}
String topicDiscovery(const char* component, const char* entity) {
    return "homeassistant/" + String(component) + "/" + deviceId() + "/" + entity + "/config";
}

static void addDeviceBlock(JsonObject doc, const DeviceConfig& cfg, const char* model) {
    JsonObject dev = doc["device"].to<JsonObject>();
    JsonArray ids = dev["identifiers"].to<JsonArray>();
    ids.add(deviceId());
    if (cfg.friendlyName.length()) dev["name"] = cfg.friendlyName;
    dev["manufacturer"] = "netsocket-diy";
    dev["model"] = model;
    dev["sw_version"] = "1.0.0";
}

String discoverySwitch(const char* entity, const char* model) {
    DeviceConfig cfg = loadConfig();
    JsonDocument doc;
    addDeviceBlock(doc.as<JsonObject>(), cfg, model);
    doc["unique_id"] = deviceId() + "-" + entity;
    doc["object_id"] = deviceId() + "_" + entity;
    doc["name"] = nullptr;
    doc["state_topic"] = topicState(entity);
    doc["command_topic"] = topicSet(entity);
    doc["availability_topic"] = topicAvailability();
    doc["payload_on"] = "ON";
    doc["payload_off"] = "OFF";
    doc["state_on"] = "ON";
    doc["state_off"] = "OFF";
    String out;
    serializeJson(doc, out);
    return out;
}

String discoveryButton(const char* entity, const char* subtype) {
    DeviceConfig cfg = loadConfig();
    JsonDocument doc;
    addDeviceBlock(doc.as<JsonObject>(), cfg, "C3-button-v1");
    doc["unique_id"] = deviceId() + "-" + entity;
    doc["automation_type"] = "trigger";
    doc["type"] = "button_short_press";
    doc["subtype"] = subtype;
    doc["topic"] = topicEvent(entity);
    doc["payload"] = "press";
    String out;
    serializeJson(doc, out);
    return out;
}void connectWifi(DeviceConfig& cfg) {
    WiFiManager wm;
    wm.setConfigPortalTimeout(300);

    char apName[24];
    String id = deviceId();
    snprintf(apName, sizeof(apName), "NETSOCKET-%s", id.substring(3, 7).c_str());

    WiFiManagerParameter p_host("host", "MQTT broker host", cfg.mqttHost.c_str(), 64);
    WiFiManagerParameter p_port("port", "MQTT broker port", String(cfg.mqttPort).c_str(), 6);
    WiFiManagerParameter p_user("user", "MQTT username (optional)", cfg.mqttUser.c_str(), 64);
    WiFiManagerParameter p_pass("pass", "MQTT password (optional)", cfg.mqttPass.c_str(), 64, "type=\"password\"");
    WiFiManagerParameter p_room("room", "Room (optional)", cfg.room.c_str(), 40);
    WiFiManagerParameter p_name("name", "Device name (optional)", cfg.friendlyName.c_str(), 40);
    wm.addParameter(&p_host);
    wm.addParameter(&p_port);
    wm.addParameter(&p_user);
    wm.addParameter(&p_pass);
    wm.addParameter(&p_room);
    wm.addParameter(&p_name);

    if (!wm.autoConnect(apName)) {
        // Portal timed out with no credentials; restart and try again.
        ESP.restart();
    }

    cfg.mqttHost = String(p_host.getValue());
    uint16_t parsedPort = (uint16_t)atoi(p_port.getValue());
    cfg.mqttPort = parsedPort ? parsedPort : 1883;
    cfg.mqttUser = String(p_user.getValue());
    cfg.mqttPass = String(p_pass.getValue());
    cfg.room = String(p_room.getValue());
    cfg.friendlyName = String(p_name.getValue());
    saveConfig(cfg);
}

Device::Device(PubSubClient& mqtt, DeviceConfig& cfg) : mqtt_(mqtt), cfg_(cfg) {}

bool Device::maintain() {
    if (mqtt_.connected()) {
        wasConnected_ = true;
        mqtt_.loop();
        return true;
    }
    String id = deviceId();
    String willTopic = topicAvailability();
    bool ok = mqtt_.connect(
        id.c_str(),
        cfg_.mqttUser.length() ? cfg_.mqttUser.c_str() : nullptr,
        cfg_.mqttPass.length() ? cfg_.mqttPass.c_str() : nullptr,
        willTopic.c_str(), 1, true, "offline");
    if (!ok) {
        wasConnected_ = false;
        return false;
    }
    mqtt_.publish(willTopic.c_str(), "online", true);
    for (const String& entity : commands_) {
        mqtt_.subscribe(topicSet(entity.c_str()).c_str(), 1);
    }
    if (announce_) {
        announce_();
    }
    wasConnected_ = true;
    return true;
}

bool Device::publishState(const char* entity, const String& value) {
    if (!mqtt_.connected()) return false;
    return mqtt_.publish(topicState(entity).c_str(), value.c_str(), true);
}

bool Device::publishEvent(const char* entity, const String& value) {
    if (!mqtt_.connected()) return false;
    return mqtt_.publish(topicEvent(entity).c_str(), value.c_str(), false);
}

}  // namespace netsocket