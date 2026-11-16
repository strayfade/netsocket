/* Wi-Fi station for the MQTT bridge (the 802.15.4 side is the Zigbee stack). */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

/* Connects using stored settings. No-op when no SSID is configured. */
void wifi_start(void);

/* Stores new credentials and (re)connects. */
esp_err_t wifi_connect(const char *ssid, const char *pass);

/* Forgets credentials and disconnects. */
void wifi_clear(void);

bool wifi_connected(void);
const char *wifi_state_str(void);
int8_t wifi_rssi(void);
