#include <Arduino.h>
#include "netsocket/netsocket.hpp"

netsocket::physicalNode* phyNode;

void retransmit(const netsocket::packet& packet) {
    phyNode->sendData(packet);
}
void dataRecvCallback(const netsocket::packet& packet) {
    //Serial.println(std::string(packet.targetName + " << " + std::to_string(packet.targetId) + " << " + packet.data).c_str());
    retransmit(packet);
}
void dataSendCallback(const std::string& data, const uint8_t* macAddress) {
    Serial.print("Data sent: ");
    Serial.println(data.c_str());
}

void setup() {
    delay(3000);
    phyNode = new netsocket::physicalNode(
        "Wireless Adapter",
        1,
        { NETSOCKET_SOURCE_USB }, 
        { NETSOCKET_SOURCE_2_4 },
        115200
    );
    phyNode->skipRecvIdentityCheck = true;
    phyNode->bindOnDataSent(dataSendCallback);
    phyNode->bindOnDataRecv(dataRecvCallback);
    phyNode->init();
}

void loop() {
    phyNode->poll();
}