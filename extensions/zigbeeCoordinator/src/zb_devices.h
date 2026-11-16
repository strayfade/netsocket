/*
 * Registry of Zigbee devices that have joined our network.
 *
 * A device is identified permanently by its 64-bit IEEE (MAC) address; the
 * 16-bit NWK address is only a routing handle that the coordinator assigns and
 * that can change on every rejoin. Everything the outside world sees (MQTT
 * node ids, the CLI's stable listing) is therefore IEEE-based, while the CLI
 * also accepts the NWK address and a short 1-based index for convenience.
 *
 * Structural facts (label, endpoints, clusters, manufacturer) are persisted in
 * NVS; volatile state (on/off, level, power) is not, to spare the flash.
 */
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "ezbee/core_types.h"

#define ZB_MAX_DEVICES 24
#define ZB_MAX_EPS 4
#define ZB_MAX_CLUSTERS 6
#define ZB_LABEL_LEN 24
#define ZB_NAME_LEN 24

typedef struct zb_device_s {
    bool used;

    uint16_t nwk;
    ezb_extaddr_t ieee;
    uint8_t capability; /* device announce capability bits */
    bool interviewed;
    bool online;
    uint32_t last_seen;

    uint8_t ep_count;
    uint8_t eps[ZB_MAX_EPS];
    uint8_t in_count[ZB_MAX_EPS];
    uint16_t in_clusters[ZB_MAX_EPS][ZB_MAX_CLUSTERS];

    char label[ZB_LABEL_LEN];
    char manufacturer[ZB_NAME_LEN];
    char model[ZB_NAME_LEN];

    /* Cached entity state, refreshed by reports and by our own commands. */
    bool has_onoff;
    uint8_t onoff_ep;
    bool onoff;

    bool has_level;
    uint8_t level_ep;
    uint8_t level;

    bool has_power;
    uint8_t power_ep;
    int16_t power_w;

    bool has_energy;
    uint8_t energy_ep;
    uint64_t energy_wh;
} zb_device_t;

/* Loads the table from NVS. Devices come back marked offline. */
void zbdev_init(void);

int zbdev_count(void);

/* 1-based index as printed by `dev list`; NULL when out of range. */
zb_device_t *zbdev_get(int index);

zb_device_t *zbdev_find_nwk(uint16_t nwk);
zb_device_t *zbdev_find_ieee(const ezb_extaddr_t *ieee);

/* Looks up by the netsocket-facing id, e.g. "zb-00124b002243a1b7". */
zb_device_t *zbdev_find_node_id(const char *node_id);

/* Insert or refresh a device on join/rejoin. Structure is kept when the IEEE
 * address matches an existing entry; NWK address is updated. */
zb_device_t *zbdev_upsert(uint16_t nwk, const ezb_extaddr_t *ieee, uint8_t capability);

bool zbdev_remove_by_nwk(uint16_t nwk);

void zbdev_mark_all_offline(void);

void zbdev_set_online(zb_device_t *dev, bool online);

/* Records endpoint + server cluster discovery results. */
void zbdev_reset_endpoints(zb_device_t *dev);
bool zbdev_add_endpoint(zb_device_t *dev, uint8_t ep);
bool zbdev_add_cluster(zb_device_t *dev, uint8_t ep, uint16_t cluster);
bool zbdev_has_cluster(const zb_device_t *dev, uint16_t cluster);
uint8_t zbdev_ep_for_cluster(const zb_device_t *dev, uint16_t cluster);

/* Refreshes the cached entity state from a ZCL attribute value. */
void zbdev_note_attr(zb_device_t *dev, uint16_t cluster, uint16_t attr, uint8_t type, const void *value);

/* Applies an On/Off state learned from a command we sent. */
void zbdev_note_onoff(zb_device_t *dev, bool on);

/* Persists label/interview results. */
void zbdev_save(void);

/* Erases the persisted device table (used by `factory`). */
void zbdev_wipe(void);

/* Formatting helpers (IEEE is printed most-significant byte first, the way
 * every Zigbee tool prints it). */
void zbdev_ieee_str(const ezb_extaddr_t *ieee, char *out, size_t out_len);

/* netsocket-facing node id: zb-<16 lowercase hex>. */
void zbdev_node_id(const zb_device_t *dev, char *out, size_t out_len);
