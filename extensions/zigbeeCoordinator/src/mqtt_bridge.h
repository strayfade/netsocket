/*
 * MQTT bridge into netsocket.
 *
 * Speaks the same dialect as netsocket's own firmware (firmware/esp32c3):
 * retained Home Assistant discovery under `homeassistant/<component>/...`,
 * state on `netsocket/dev/<node>/<object>/state`, commands on
 * `netsocket/dev/<node>/<object>/set`, availability per device.
 *
 * `node` is always `zb-<16 hex IEEE>`, so it is stable across rejoins and the
 * operator's approval in netsocket survives NWK address changes.
 */
#pragma once

#include <stdbool.h>

#include "esp_err.h"
#include "zb_coordinator.h"

void mqtt_start(void);
void mqtt_stop(void);
bool mqtt_connected(void);
const char *mqtt_state_str(void);

/* Called from the Zigbee task whenever something publishable changed. */
void mqtt_on_zigbee_event(zb_evt_t evt, zb_device_t *dev, uint16_t cluster);

/* Re-publishes everything (used when the broker connection is (re)established). */
void mqtt_publish_all(void);
