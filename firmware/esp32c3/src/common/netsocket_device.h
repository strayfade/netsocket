// Netsocket smart-home device support (ESP32-C3).
//
// Speaks the netsocket MQTT contract: Home Assistant discovery payloads
// (retained) on `homeassistant/<component>/<deviceId>/<entity>/config`,
// retained state on `netsocket/dev/<deviceId>/<entity>/state`, commands
// in on `.../set`, and an LWT availability topic. The payload shapes
// here are asserted against the server parser in
// tests/smarthomeFirmwareContract.test.js — keep them in sync.
#pragma once

#include <Arduino.h>
#include <PubSubClient.h>
#include <functional>
#include <vector>

namespace netsocket {

struct DeviceConfig {
    String mqttHost;
    uint16_t mqttPort;
    String mqttUser;
    String mqttPass;
    bool tls;
    String room;
    String friendlyName;
};

// Stable lowercase device id, e.g. "c3-a4cf12ab34".
String deviceId();

// NVS-backed configuration (also settable from the captive portal).
DeviceConfig loadConfig();
void saveConfig(const DeviceConfig& cfg);

// Blocks until WiFi is up; opens a captive portal ("NETSOCKET-XXXX") on
// first boot or when the stored network is unreachable. Portal also
// collects MQTT host/port/user/pass, room, and a friendly name.
void connectWifi(DeviceConfig& cfg);

// Topic builders — the single source of truth for the wire contract.
String topicAvailability();
String topicState(const char* entity);
String topicSet(const char* entity);
String topicEvent(const char* entity);
String topicDiscovery(const char* component, const char* entity);

// Retained discovery payloads. These exact shapes are asserted against
// the server-side parser; changing a key here means changing
// server/utils/mqttDiscovery.js (and the contract test) too.
String discoverySwitch(const char* entity, const char* model);
String discoveryButton(const char* entity, const char* subtype);

class Device {
public:
    Device(PubSubClient& mqtt, DeviceConfig& cfg);
    // Register the retained-discovery + initial-state publisher. Invoked
    // after every (re)connect so the broker self-heals.
    void setAnnounceHandler(std::function<void()> fn) { announce_ = fn; }
    // Subscribe to `<entity>/set` once connected.
    void addCommandEntity(const char* entity) { commands_.push_back(String(entity)); }
    // Connects and (re)announces as needed. Call every loop().
    bool maintain();
    // Publish a retained state value for an entity.
    bool publishState(const char* entity, const String& value);
    // Publish a transient (non-retained) event, e.g. a button press.
    bool publishEvent(const char* entity, const String& value);
    PubSubClient& client() { return mqtt_; }

private:
    PubSubClient& mqtt_;
    DeviceConfig& cfg_;
    std::function<void()> announce_;
    std::vector<String> commands_;
    bool wasConnected_ = false;
};

}  // namespace netsocket