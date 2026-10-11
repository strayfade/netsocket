// ESP32-C3 bespoke light switch: a relay plus a physical toggle input.
//
// Publishes retained relay state, listens for `<entity>/set` commands,
// and advertises a `switch` entity via retained discovery. Pairs by
// powering on (captive portal collects WiFi + broker + room/name), then
// appears in netsocket's Smart Home inbox for approval.
#include <Arduino.h>
#include <ArduinoOTA.h>
#include <PubSubClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "common/netsocket_device.h"

namespace {
constexpr int kRelayPin = 4;    // relay / MOSFET gate
constexpr int kButtonPin = 5;   // physical toggle (to GND, INPUT_PULLUP)
constexpr char kEntity[] = "relay0";
constexpr char kModel[] = "C3-switch-v1";

WiFiClient plainClient;
WiFiClientSecure secureClient;
PubSubClient mqtt(plainClient);
netsocket::DeviceConfig cfg;
netsocket::Device* device = nullptr;

bool relayOn = false;
int lastButtonReading = HIGH;
int stableButtonReading = HIGH;
unsigned long lastDebounceAt = 0;
constexpr unsigned long kDebounceMs = 50;

void applyRelay(bool on) {
    relayOn = on;
    digitalWrite(kRelayPin, on ? HIGH : LOW);
    if (device) device->publishState(kEntity, on ? "ON" : "OFF");
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String message;
    message.reserve(length);
    for (unsigned int i = 0; i < length; i++) message += (char)payload[i];
    message.trim();
    if (!String(topic).endsWith("/set")) return;
    if (message.equalsIgnoreCase("ON")) applyRelay(true);
    else if (message.equalsIgnoreCase("OFF")) applyRelay(false);
    else if (message.equalsIgnoreCase("TOGGLE")) applyRelay(!relayOn);
}

void announce() {
    mqtt.publish(netsocket::topicDiscovery("switch", kEntity).c_str(),
                 netsocket::discoverySwitch(kEntity, kModel).c_str(), true);
    device->publishState(kEntity, relayOn ? "ON" : "OFF");
}
}  // namespace

void setup() {
    Serial.begin(115200);
    pinMode(kRelayPin, OUTPUT);
    pinMode(kButtonPin, INPUT_PULLUP);
    applyRelay(false);

    cfg = netsocket::loadConfig();
    netsocket::connectWifi(cfg);

    // Pick the transport after the portal so TLS can be configured on first boot.
    mqtt.setClient(cfg.tls ? (Client&)secureClient : (Client&)plainClient);
    if (cfg.tls) {
        // Bring-up default: accept the broker cert without pinning a CA.
        // Add secureClient.setCACert(...) before shipping past a lab LAN.
        secureClient.setInsecure();
    }
    mqtt.setServer(cfg.mqttHost.c_str(), cfg.mqttPort);
    mqtt.setBufferSize(1024);
    mqtt.setCallback(onMqttMessage);

    static netsocket::Device dev(mqtt, cfg);
    device = &dev;
    device->addCommandEntity(kEntity);
    device->setAnnounceHandler(announce);

    ArduinoOTA.setHostname((String("netsocket-") + netsocket::deviceId()).c_str());
    ArduinoOTA.begin();
}

void loop() {
    device->maintain();
    ArduinoOTA.handle();

    int reading = digitalRead(kButtonPin);
    if (reading != lastButtonReading) lastDebounceAt = millis();
    if (millis() - lastDebounceAt > kDebounceMs && reading != stableButtonReading) {
        stableButtonReading = reading;
        if (reading == LOW) applyRelay(!relayOn);
    }
    lastButtonReading = reading;
}