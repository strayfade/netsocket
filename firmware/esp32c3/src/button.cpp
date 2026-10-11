// ESP32-C3 bespoke button: a momentary input that emits press /
// long-press events. Buttons are stateless — events are published
// non-retained so a stale press never replays after a broker restart.
#include <Arduino.h>
#include <PubSubClient.h>
#include <WiFi.h>

#include "common/netsocket_device.h"

namespace {
constexpr int kButtonPin = 5;  // momentary, to GND, INPUT_PULLUP
constexpr char kEntity[] = "btn0";
constexpr unsigned long kLongPressMs = 700;

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);
netsocket::DeviceConfig cfg;
netsocket::Device* device = nullptr;

bool pressed = false;
unsigned long pressedAt = 0;
bool longPressFired = false;
}  // namespace

void onMqttMessage(char*, byte*, unsigned int) {
    // Buttons accept no commands.
}

void announce() {
    mqtt.publish(netsocket::topicDiscovery("device_automation", kEntity).c_str(),
                 netsocket::discoveryButton(kEntity, "button_1").c_str(), true);
    // Liveness: keep an availability signal fresh even without state.
    mqtt.publish(netsocket::topicAvailability().c_str(), "online", true);
}

void setup() {
    Serial.begin(115200);
    pinMode(kButtonPin, INPUT_PULLUP);

    cfg = netsocket::loadConfig();
    netsocket::connectWifi(cfg);

    mqtt.setServer(cfg.mqttHost.c_str(), cfg.mqttPort);
    mqtt.setBufferSize(1024);
    mqtt.setCallback(onMqttMessage);

    static netsocket::Device dev(mqtt, cfg);
    device = &dev;
    device->setAnnounceHandler(announce);
}

void loop() {
    device->maintain();

    int reading = digitalRead(kButtonPin);
    if (reading == LOW && !pressed) {
        pressed = true;
        pressedAt = millis();
        longPressFired = false;
    } else if (pressed && reading == HIGH) {
        if (!longPressFired) device->publishEvent(kEntity, "press");
        pressed = false;
    } else if (pressed && !longPressFired && millis() - pressedAt >= kLongPressMs) {
        device->publishEvent(kEntity, "long_press");
        longPressFired = true;
    }
}