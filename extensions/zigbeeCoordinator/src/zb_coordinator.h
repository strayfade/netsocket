/*
 * Zigbee coordinator core: stack lifecycle, network formation, join tracking
 * and the background "interview" that turns an unknown device into a set of
 * endpoints, clusters and entities.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"
#include "ezbee/core_types.h"
#include "zb_devices.h"

typedef struct {
    bool formed;
    uint16_t panid;
    uint16_t short_addr;
    uint8_t channel;
    ezb_extpanid_t ext_pan;
    ezb_extaddr_t ieee;
    uint8_t permit_remaining; /* seconds, 0 when joining is closed */
    uint8_t device_count;
} zbcoord_net_t;

typedef enum {
    ZB_EVT_JOINED = 0,
    ZB_EVT_LEFT,
    ZB_EVT_REPORT,
    ZB_EVT_INTERVIEWED,
    ZB_EVT_PERMIT,
} zb_evt_t;

/* dev may be NULL for ZB_EVT_PERMIT. cluster is only meaningful for reports. */
typedef void (*zbcoord_evt_cb_t)(zb_evt_t evt, zb_device_t *dev, uint16_t cluster);

/* Starts the Zigbee task (stack init happens inside it). */
void zbcoord_start(void);

void zbcoord_set_event_cb(zbcoord_evt_cb_t cb);

bool zbcoord_is_formed(void);
void zbcoord_net_info(zbcoord_net_t *out);

/* Opens the network so devices may join for `seconds`. 0 closes it. */
esp_err_t zbcoord_permit(uint8_t seconds);

/* Forms a network on `channel` (11..26). Only valid on a factory-new device;
 * use zbcoord_factory_reset() first to start over. */
esp_err_t zbcoord_form(uint8_t channel);

/* Asks the coordinator to (re)run the interview for an already known device. */
void zbcoord_interview(zb_device_t *dev);

/* Erases network state and reboots. Never returns. */
void zbcoord_factory_reset(void);
