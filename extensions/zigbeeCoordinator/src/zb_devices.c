#include "zb_devices.h"

#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "nvs.h"

static const char *TAG = "zbdev";

#define ZBDEV_NAMESPACE "zbdev"
#define ZBDEV_KEY "table"
#define ZBDEV_MAGIC 0x5a444556u /* "ZDEV" */
#define ZBDEV_VERSION 1

typedef struct {
    uint16_t nwk;
    uint64_t ieee;
    uint8_t capability;
    uint8_t interviewed;
    uint8_t ep_count;
    uint8_t eps[ZB_MAX_EPS];
    uint8_t in_count[ZB_MAX_EPS];
    uint16_t in_clusters[ZB_MAX_EPS][ZB_MAX_CLUSTERS];
    char label[ZB_LABEL_LEN];
    char manufacturer[ZB_NAME_LEN];
    char model[ZB_NAME_LEN];
} zbdev_rec_t;

typedef struct {
    uint32_t magic;
    uint16_t version;
    uint16_t count;
    zbdev_rec_t recs[ZB_MAX_DEVICES];
} zbdev_store_t;

static zb_device_t s_devs[ZB_MAX_DEVICES];
static zbdev_store_t s_store; /* scratch buffer, too big for the stack */

static int index_of(const zb_device_t *dev)
{
    for (int i = 0; i < ZB_MAX_DEVICES; i++) {
        if (&s_devs[i] == dev) {
            return i + 1;
        }
    }
    return 0;
}

void zbdev_ieee_str(const ezb_extaddr_t *ieee, char *out, size_t out_len)
{
    if (!out || out_len == 0) {
        return;
    }
    const uint8_t *b = ieee ? ieee->u8 : NULL;
    if (!b) {
        snprintf(out, out_len, "00:00:00:00:00:00:00:00");
        return;
    }
    snprintf(out, out_len, "%02x:%02x:%02x:%02x:%02x:%02x:%02x:%02x",
             b[7], b[6], b[5], b[4], b[3], b[2], b[1], b[0]);
}

void zbdev_node_id(const zb_device_t *dev, char *out, size_t out_len)
{
    if (!out || out_len == 0) {
        return;
    }
    if (!dev) {
        snprintf(out, out_len, "zb-0000000000000000");
        return;
    }
    const uint8_t *b = dev->ieee.u8;
    snprintf(out, out_len, "zb-%02x%02x%02x%02x%02x%02x%02x%02x",
             b[7], b[6], b[5], b[4], b[3], b[2], b[1], b[0]);
}

int zbdev_count(void)
{
    int n = 0;
    for (int i = 0; i < ZB_MAX_DEVICES; i++) {
        if (s_devs[i].used) {
            n++;
        }
    }
    return n;
}

zb_device_t *zbdev_get(int index)
{
    if (index < 1 || index > ZB_MAX_DEVICES) {
        return NULL;
    }
    zb_device_t *dev = &s_devs[index - 1];
    return dev->used ? dev : NULL;
}

zb_device_t *zbdev_find_nwk(uint16_t nwk)
{
    for (int i = 0; i < ZB_MAX_DEVICES; i++) {
        if (s_devs[i].used && s_devs[i].nwk == nwk) {
            return &s_devs[i];
        }
    }
    return NULL;
}

zb_device_t *zbdev_find_ieee(const ezb_extaddr_t *ieee)
{
    if (!ieee) {
        return NULL;
    }
    for (int i = 0; i < ZB_MAX_DEVICES; i++) {
        if (s_devs[i].used && s_devs[i].ieee.u64 == ieee->u64) {
            return &s_devs[i];
        }
    }
    return NULL;
}

zb_device_t *zbdev_find_node_id(const char *node_id)
{
    if (!node_id) {
        return NULL;
    }
    for (int i = 0; i < ZB_MAX_DEVICES; i++) {
        if (!s_devs[i].used) {
            continue;
        }
        char id[24];
        zbdev_node_id(&s_devs[i], id, sizeof(id));
        if (strcmp(id, node_id) == 0) {
            return &s_devs[i];
        }
    }
    return NULL;
}

static zb_device_t *alloc_slot(void)
{
    for (int i = 0; i < ZB_MAX_DEVICES; i++) {
        if (!s_devs[i].used) {
            memset(&s_devs[i], 0, sizeof(s_devs[i]));
            s_devs[i].used = true;
            return &s_devs[i];
        }
    }
    return NULL;
}

zb_device_t *zbdev_upsert(uint16_t nwk, const ezb_extaddr_t *ieee, uint8_t capability)
{
    if (!ieee) {
        return NULL;
    }

    zb_device_t *dev = zbdev_find_ieee(ieee);
    if (!dev) {
        dev = alloc_slot();
        if (!dev) {
            ESP_LOGW(TAG, "device table full (%d entries)", ZB_MAX_DEVICES);
            return NULL;
        }
        dev->ieee = *ieee;
        ESP_LOGI(TAG, "registering new device");
    }

    dev->nwk = nwk;
    dev->capability = capability;
    dev->online = true;
    dev->last_seen = (uint32_t)(esp_log_timestamp() / 1000);

    /* A rejoin invalidates the cached addresses/endpoints. */
    dev->interviewed = dev->interviewed && (dev->ep_count > 0);
    return dev;
}

bool zbdev_remove_by_nwk(uint16_t nwk)
{
    zb_device_t *dev = zbdev_find_nwk(nwk);
    if (!dev) {
        return false;
    }
    memset(dev, 0, sizeof(*dev));
    return true;
}

void zbdev_mark_all_offline(void)
{
    for (int i = 0; i < ZB_MAX_DEVICES; i++) {
        if (s_devs[i].used) {
            s_devs[i].online = false;
            s_devs[i].interviewed = s_devs[i].ep_count > 0;
        }
    }
}

void zbdev_set_online(zb_device_t *dev, bool online)
{
    if (!dev) {
        return;
    }
    dev->online = online;
    if (online) {
        dev->last_seen = (uint32_t)(esp_log_timestamp() / 1000);
    }
}

void zbdev_reset_endpoints(zb_device_t *dev)
{
    if (!dev) {
        return;
    }
    dev->ep_count = 0;
    memset(dev->eps, 0, sizeof(dev->eps));
    memset(dev->in_count, 0, sizeof(dev->in_count));
    memset(dev->in_clusters, 0, sizeof(dev->in_clusters));
}

static int ep_slot(const zb_device_t *dev, uint8_t ep)
{
    for (int i = 0; i < dev->ep_count; i++) {
        if (dev->eps[i] == ep) {
            return i;
        }
    }
    return -1;
}

bool zbdev_add_endpoint(zb_device_t *dev, uint8_t ep)
{
    if (!dev || ep == 0 || ep == 0xFF) {
        return false;
    }
    if (ep_slot(dev, ep) >= 0) {
        return true;
    }
    if (dev->ep_count >= ZB_MAX_EPS) {
        return false;
    }
    dev->eps[dev->ep_count++] = ep;
    return true;
}

bool zbdev_add_cluster(zb_device_t *dev, uint8_t ep, uint16_t cluster)
{
    if (!dev) {
        return false;
    }
    int slot = ep_slot(dev, ep);
    if (slot < 0) {
        if (!zbdev_add_endpoint(dev, ep)) {
            return false;
        }
        slot = ep_slot(dev, ep);
    }
    if (slot < 0) {
        return false;
    }

    for (int i = 0; i < dev->in_count[slot]; i++) {
        if (dev->in_clusters[slot][i] == cluster) {
            return true;
        }
    }
    if (dev->in_count[slot] >= ZB_MAX_CLUSTERS) {
        return false;
    }
    dev->in_clusters[slot][dev->in_count[slot]++] = cluster;
    return true;
}

bool zbdev_has_cluster(const zb_device_t *dev, uint16_t cluster)
{
    if (!dev) {
        return false;
    }
    for (int e = 0; e < dev->ep_count; e++) {
        for (int c = 0; c < dev->in_count[e]; c++) {
            if (dev->in_clusters[e][c] == cluster) {
                return true;
            }
        }
    }
    return false;
}

uint8_t zbdev_ep_for_cluster(const zb_device_t *dev, uint16_t cluster)
{
    if (!dev) {
        return 0;
    }
    for (int e = 0; e < dev->ep_count; e++) {
        for (int c = 0; c < dev->in_count[e]; c++) {
            if (dev->in_clusters[e][c] == cluster) {
                return dev->eps[e];
            }
        }
    }
    return 0;
}

static uint16_t rd16(const uint8_t *p)
{
    return (uint16_t)(p[0] | ((uint16_t)p[1] << 8));
}

static uint64_t rd_var(const uint8_t *p, int len)
{
    uint64_t v = 0;
    for (int i = len - 1; i >= 0; i--) {
        v = (v << 8) | p[i];
    }
    return v;
}

void zbdev_note_attr(zb_device_t *dev, uint16_t cluster, uint16_t attr, uint8_t type, const void *value)
{
    if (!dev || !value) {
        return;
    }
    const uint8_t *b = (const uint8_t *)value;
    dev->last_seen = (uint32_t)(esp_log_timestamp() / 1000);
    dev->online = true;

    switch (cluster) {
    case 0x0006: /* On/Off */
        if (attr == 0x0000) {
            uint8_t ep = zbdev_ep_for_cluster(dev, cluster);
            dev->has_onoff = true;
            if (ep) {
                dev->onoff_ep = ep;
            }
            dev->onoff = (*b & 0x01) != 0;
        }
        break;

    case 0x0008: /* Level control */
        if (attr == 0x0000) {
            uint8_t ep = zbdev_ep_for_cluster(dev, cluster);
            dev->has_level = true;
            if (ep) {
                dev->level_ep = ep;
            }
            dev->level = *b;
        }
        break;

    case 0x0B04: /* Electrical measurement */
        if (attr == 0x050B /* active power */) {
            uint8_t ep = zbdev_ep_for_cluster(dev, cluster);
            dev->has_power = true;
            if (ep) {
                dev->power_ep = ep;
            }
            dev->power_w = (type == 0x29 /* INT16 */) ? (int16_t)rd16(b) : (int16_t)*b;
        }
        break;

    case 0x0702: /* Metering */
        if (attr == 0x0300 /* summation delivered / energy */) {
            int len = (type == 0x25) ? 6 : (type == 0x23 ? 4 : 2);
            uint8_t ep = zbdev_ep_for_cluster(dev, cluster);
            dev->has_energy = true;
            if (ep) {
                dev->energy_ep = ep;
            }
            dev->energy_wh = rd_var(b, len);
        }
        break;

    default:
        break;
    }
}

void zbdev_note_onoff(zb_device_t *dev, bool on)
{
    if (!dev) {
        return;
    }
    dev->has_onoff = true;
    if (dev->onoff_ep == 0) {
        dev->onoff_ep = zbdev_ep_for_cluster(dev, 0x0006);
    }
    dev->onoff = on;
    dev->last_seen = (uint32_t)(esp_log_timestamp() / 1000);
}

void zbdev_save(void)
{
    memset(&s_store, 0, sizeof(s_store));
    s_store.magic = ZBDEV_MAGIC;
    s_store.version = ZBDEV_VERSION;

    uint16_t n = 0;
    for (int i = 0; i < ZB_MAX_DEVICES; i++) {
        const zb_device_t *dev = &s_devs[i];
        if (!dev->used) {
            continue;
        }
        zbdev_rec_t *r = &s_store.recs[n++];
        r->nwk = dev->nwk;
        r->ieee = dev->ieee.u64;
        r->capability = dev->capability;
        r->interviewed = dev->interviewed ? 1 : 0;
        r->ep_count = dev->ep_count;
        memcpy(r->eps, dev->eps, sizeof(r->eps));
        memcpy(r->in_count, dev->in_count, sizeof(r->in_count));
        memcpy(r->in_clusters, dev->in_clusters, sizeof(r->in_clusters));
        memcpy(r->label, dev->label, sizeof(r->label));
        memcpy(r->manufacturer, dev->manufacturer, sizeof(r->manufacturer));
        memcpy(r->model, dev->model, sizeof(r->model));
    }
    s_store.count = n;

    nvs_handle_t h;
    esp_err_t err = nvs_open(ZBDEV_NAMESPACE, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        ESP_LOGW(TAG, "nvs_open failed: %s", esp_err_to_name(err));
        return;
    }
    err = nvs_set_blob(h, ZBDEV_KEY, &s_store, sizeof(s_store));
    if (err == ESP_OK) {
        err = nvs_commit(h);
    }
    nvs_close(h);

    if (err != ESP_OK) {
        ESP_LOGW(TAG, "saving device table failed: %s", esp_err_to_name(err));
    }
}

void zbdev_wipe(void)
{
    memset(s_devs, 0, sizeof(s_devs));
    memset(&s_store, 0, sizeof(s_store));
    s_store.magic = ZBDEV_MAGIC;
    s_store.version = ZBDEV_VERSION;

    nvs_handle_t h;
    if (nvs_open(ZBDEV_NAMESPACE, NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_all(h);
        nvs_commit(h);
        nvs_close(h);
    }
    ESP_LOGW(TAG, "device table cleared");
}

void zbdev_init(void)
{
    memset(s_devs, 0, sizeof(s_devs));

    nvs_handle_t h;
    if (nvs_open(ZBDEV_NAMESPACE, NVS_READONLY, &h) != ESP_OK) {
        return;
    }

    size_t len = sizeof(s_store);
    esp_err_t err = nvs_get_blob(h, ZBDEV_KEY, &s_store, &len);
    nvs_close(h);

    if (err != ESP_OK || len != sizeof(s_store) || s_store.magic != ZBDEV_MAGIC) {
        ESP_LOGI(TAG, "no stored device table");
        return;
    }

    for (int i = 0; i < ZB_MAX_DEVICES && i < s_store.count; i++) {
        const zbdev_rec_t *r = &s_store.recs[i];
        zb_device_t *dev = &s_devs[i];
        memset(dev, 0, sizeof(*dev));
        dev->used = true;
        dev->nwk = r->nwk;
        dev->ieee.u64 = r->ieee;
        dev->capability = r->capability;
        dev->interviewed = r->interviewed != 0;
        dev->ep_count = r->ep_count > ZB_MAX_EPS ? ZB_MAX_EPS : r->ep_count;
        memcpy(dev->eps, r->eps, sizeof(dev->eps));
        memcpy(dev->in_count, r->in_count, sizeof(dev->in_count));
        memcpy(dev->in_clusters, r->in_clusters, sizeof(dev->in_clusters));
        memcpy(dev->label, r->label, sizeof(dev->label));
        memcpy(dev->manufacturer, r->manufacturer, sizeof(dev->manufacturer));
        memcpy(dev->model, r->model, sizeof(dev->model));

        /* Rebuild entity availability from the persisted cluster list. */
        dev->has_onoff = zbdev_has_cluster(dev, 0x0006);
        dev->onoff_ep = zbdev_ep_for_cluster(dev, 0x0006);
        dev->has_level = zbdev_has_cluster(dev, 0x0008);
        dev->level_ep = zbdev_ep_for_cluster(dev, 0x0008);
        dev->has_power = zbdev_has_cluster(dev, 0x0B04);
        dev->power_ep = zbdev_ep_for_cluster(dev, 0x0B04);
        dev->has_energy = zbdev_has_cluster(dev, 0x0702);
        dev->energy_ep = zbdev_ep_for_cluster(dev, 0x0702);
        dev->online = false;
    }

    ESP_LOGI(TAG, "loaded %d device(s)", zbdev_count());
}
