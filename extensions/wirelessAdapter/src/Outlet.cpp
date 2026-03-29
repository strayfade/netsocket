#include <Arduino.h>
#include "netsocket/netsocket.hpp"

netsocket::physicalNode* phyNode;

#define OUTLET_RELAY_PIN 21

void dataRecvCallback(const netsocket::packet& packet) {
    //Serial.println(packet.data.c_str());
    if (packet.data == "On")
        digitalWrite(OUTLET_RELAY_PIN, HIGH);
    if (packet.data == "Off")
        digitalWrite(OUTLET_RELAY_PIN, LOW);
}
void dataSendCallback(const std::string& data, const uint8_t* macAddress) {
    
}

void setup() {
    delay(3000);
    pinMode(OUTLET_RELAY_PIN, OUTPUT);
    phyNode = new netsocket::physicalNode(
        "Outlet",
        2,
        { NETSOCKET_SOURCE_2_4 }, 
        { },
        115200
    );
    phyNode->bindOnDataSent(dataSendCallback);
    phyNode->bindOnDataRecv(dataRecvCallback);
    phyNode->init();
}

void loop() {
    phyNode->poll();
}