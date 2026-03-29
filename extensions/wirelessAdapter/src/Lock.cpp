#include <Arduino.h>
#include "netsocket/netsocket.hpp"

#include <Servo.h>
Servo lock;
#define LOCK_SERVO_PIN 13

netsocket::physicalNode* phyNode;

void dataRecvCallback(const netsocket::packet& packet) {
    Serial.println(packet.data.c_str());
    if (packet.data == "Lock")
        lock.write(10);
    if (packet.data == "Unlock")
        lock.write(170);
}
void dataSendCallback(const std::string& data, const uint8_t* macAddress) {
    
}

void setup() {
    delay(3000);
    
    lock.attach(LOCK_SERVO_PIN);

    phyNode = new netsocket::physicalNode(
        "Lock",
        3,
        { NETSOCKET_SOURCE_USB, NETSOCKET_SOURCE_2_4 }, 
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