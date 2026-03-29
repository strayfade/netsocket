#ifndef NETSOCKET_HPP
#define NETSOCKET_HPP

#include <string>
#include <vector>
#include <esp_now.h>
#include <WiFi.h>
#include <functional>

#include "log.hpp"
#include "pkcs7.hpp"

#define _NETSOCKET_DEFAULT_BAUDRATE 115200
#define _NETSOCKET_DEFAULT_NAME "Unknown Device"
#define _NETSOCKET_VERSION 001
#define NETSOCKET_SOURCE_USB 0
#define NETSOCKET_SOURCE_2_4 1
#define _NETSOCKET_DEFAULT_DATA_SOURCE { NETSOCKET_SOURCE_2_4 }
#define _NETSOCKET_DEFAULT_DATA_OUTPUTS { NETSOCKET_SOURCE_2_4 }
#define _NETSOCKET_DEFAULT_ID -1
#define _NETSOCKET_BROADCAST_ADDRESS {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF}

namespace netsocket {

    struct packet {
        std::string targetName = "";
        int targetId = -1;
        std::string data = "";
    };

    esp_now_peer_info_t peerInfo;

    class physicalNode {

        int baudRate = _NETSOCKET_DEFAULT_BAUDRATE;
        std::string name = _NETSOCKET_DEFAULT_NAME;
        int id = _NETSOCKET_DEFAULT_ID;
        int supportedProtocolVersion = _NETSOCKET_VERSION;
        std::vector<char> dataSources = _NETSOCKET_DEFAULT_DATA_SOURCE;
        std::vector<char> dataOutputs = _NETSOCKET_DEFAULT_DATA_OUTPUTS;

        // Used for polling USB-CDC Serial
        std::string _inputBuffer;

        bool usesInputSource(char inputSource) {
            for (char i : dataSources) {
                if (i == inputSource)
                    return true;
            }
            return false;
        }
        bool usesOutputSource(char inputSource) {
            for (char i : dataOutputs) {
                if (i == inputSource)
                    return true;
            }
            return false;
        }

    public:
        
        bool skipRecvIdentityCheck = false;
        std::function<void(const packet&)> dataRecvCallback;
        std::function<void(const std::string&, const uint8_t*)> dataSendCallback;

        void parseDataAndForward(std::string input) {
            packet pck;
            size_t firstColon = input.find(':');
            if (firstColon == std::string::npos) {
                log("Invalid packet format: missing first colon");
                return;
            }
            size_t secondColon = input.find(':', firstColon + 1);
            if (secondColon == std::string::npos) {
                log("Invalid packet format: missing second colon");
                return;
            }

            // Extract parts
            pck.targetName = input.substr(0, firstColon);
            pck.targetId = std::stoi(input.substr(firstColon + 1, secondColon - firstColon - 1));
            pck.data = input.substr(secondColon + 1);

            if ((pck.targetName == this->name && pck.targetId == this->id) || this->skipRecvIdentityCheck) {
                dataRecvCallback(pck);
            }
        }

        void poll() {
            if (usesInputSource(NETSOCKET_SOURCE_USB)) {
                while (Serial.available() > 0) {
                    char c = Serial.read();
                    if (c == '\r') {
                        continue;
                    }
                    if (c == '\n') {
                        if (!_inputBuffer.empty()) {
                            //if (dataRecvCallback) {
                                //const uint8_t mac[6] = {0x00, 0x00, 0x00, 0x00, 0x00, 0x00};
                                //netsocketPacket packet;
                                //packet.targetName = this->name;
                                //packet.targetId = this->id;
                                //packet.data = _inputBuffer;
                                //dataRecvCallback(packet, mac);
                            //}
                            parseDataAndForward(_inputBuffer);
                            _inputBuffer.clear();
                        }
                    } else {
                        _inputBuffer += c;
                    }
                }
            }
        }

        void sendData(const netsocket::packet& packet) {
            //if (usesOutputSource(NETSOCKET_SOURCE_USB)) {
            //    Serial.println(packet.data.c_str());
            //}
            if (usesOutputSource(NETSOCKET_SOURCE_2_4)) {
                uint8_t macAddress[] = _NETSOCKET_BROADCAST_ADDRESS;
                std::stringstream stream;
                stream << packet.targetName << ":" << packet.targetId << ":" << packet.data;
                while (stream.str().length() % 16 != 0) {
                    stream << " ";
                }
                std::string encryptedPacket = pkcs7::encryptString(stream.str());
                esp_err_t res = esp_now_send(macAddress, (uint8_t*)encryptedPacket.c_str(), encryptedPacket.length());
            }
        }

        void init();

        void bindOnDataSent(std::function<void(const std::string&, const uint8_t*)> dataSendCallbackNew) {
            dataSendCallback = dataSendCallbackNew;
        }
        void bindOnDataRecv(std::function<void(const packet&)> dataRecvCallbackNew) {
            dataRecvCallback = dataRecvCallbackNew;
        }

        physicalNode(
            std::string newName = _NETSOCKET_DEFAULT_NAME, 
            int newId = _NETSOCKET_DEFAULT_ID,
            std::vector<char> newDataSources = _NETSOCKET_DEFAULT_DATA_SOURCE,
            std::vector<char> newDataOutputs = _NETSOCKET_DEFAULT_DATA_OUTPUTS,
            int newBaudRate = _NETSOCKET_DEFAULT_BAUDRATE
        ) {
            name = newName;
            id = newId;
            dataSources = newDataSources;
            dataOutputs = newDataOutputs;
            baudRate = newBaudRate;
        }
    };

    physicalNode* recvNode;
    void onDataSend(const uint8_t* macAddress, esp_now_send_status_t status) {
        
    }
    inline std::string rtrim(std::string& s) {
        s.erase(std::find_if(s.rbegin(), s.rend(), [](unsigned char ch) {
            return !std::isspace(ch);
            }).base(), s.end());
        return s;
    }
    void onDataRecv(const uint8_t* macAddress, const uint8_t* data, int length) {
        char msg[length];
        memcpy(msg, data, length);
        std::string encryptedMessage(msg);
        std::string decryptedMessage = pkcs7::decryptString(encryptedMessage);
        decryptedMessage = rtrim(decryptedMessage);
        recvNode->parseDataAndForward(decryptedMessage);
    }
}

void netsocket::physicalNode::init()  {

    // Begin serial
    Serial.begin(baudRate);
    while (!Serial);
    Serial.println();

    WiFi.mode(WIFI_STA);
    log(std::string("MAC Address: ") + std::string(WiFi.macAddress().c_str()));
    if (esp_now_init() != ESP_OK) {
        log("Error initializing ESP-NOW");
        return;
    }
    esp_now_register_send_cb(onDataSend);
    esp_now_register_recv_cb(onDataRecv);
    uint8_t macAddress[] = _NETSOCKET_BROADCAST_ADDRESS;
    memcpy(peerInfo.peer_addr, macAddress, 6);
    peerInfo.channel = 1;
    peerInfo.encrypt = false;
    if (esp_now_add_peer(&peerInfo) != ESP_OK) {
        log("Failed to add peer");
        return;
    }
    log("Enabled broadcast mode");
    recvNode = this;

    log(name + std::string(" initialized"));
}

#endif