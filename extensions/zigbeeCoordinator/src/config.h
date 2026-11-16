/*
 * Persistent settings for the Zigbee coordinator.
 *
 * Everything the device needs to survive a reboot lives here: WiFi and broker
 * credentials, the preferred Zigbee channel, and whether the MQTT bridge runs.
 * The Zigbee network credentials themselves are NOT here - the stack keeps its
 * own datasets in the shared "nvs" partition.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"

#define CFG_WIFI_SSID_LEN 33
#define CFG_WIFI_PASS_LEN 65
#define CFG_HOST_LEN 64
#define CFG_USER_LEN 33
#define CFG_PASS_LEN 65

typedef struct app_config_s {
    uint32_t magic;
    uint16_t version;

    char wifi_ssid[CFG_WIFI_SSID_LEN];
    char wifi_pass[CFG_WIFI_PASS_LEN];

    char mqtt_host[CFG_HOST_LEN];
    uint16_t mqtt_port;
    char mqtt_user[CFG_USER_LEN];
    char mqtt_pass[CFG_PASS_LEN];
    bool mqtt_tls;

    /* 0 = let the stack scan all channels, otherwise 11..26. */
    uint8_t zigbee_channel;

    /* Publish discovered devices into netsocket. */
    bool bridge_enabled;
} app_config_t;

void config_init(void);

/* Mutable so the CLI can edit fields; call config_save() to persist. */
app_config_t *config_get(void);

esp_err_t config_save(void);

/* Wipe settings back to defaults (does not touch the Zigbee network). */
void config_wipe(void);

bool config_has_wifi(void);
bool config_has_mqtt(void);
