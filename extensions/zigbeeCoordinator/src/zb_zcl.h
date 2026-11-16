/*
 * Blocking ZCL/ZDO request helpers.
 *
 * The Zigbee stack answers asynchronously inside its own task. To keep the
 * serial protocol scriptable, every command here publishes the request, then
 * waits for the matching callback and returns a pre-formatted line. Calls are
 * serialized through one mutex, so only a single radio request is in flight at
 * a time.
 *
 * Rules that matter:
 *  - Never call these from a Zigbee callback (they block).
 *  - Never hold the Zigbee lock while waiting; only around the send itself.
 */
#pragma once

#include <stdbool.h>
#include <stdint.h>

#include "esp_err.h"
#include "esp_zigbee.h"

/* Our own endpoint: an HA on/off switch, i.e. a client of OnOff. Devices bind
 * and report to this endpoint. */
#define ZB_COORD_EP 1

#define ZB_REQ_TIMEOUT_MS 5000
#define ZB_CMD_TIMEOUT_MS 2500

#define ZB_REPLY_MAX_ATTRS 4
#define ZB_REPLY_VALUE_MAX 16

typedef struct {
    uint16_t attr;
    uint8_t type;
    uint8_t size;
    uint8_t data[ZB_REPLY_VALUE_MAX];
} zb_reply_value_t;

typedef struct zb_reply_s {
    SemaphoreHandle_t sem;
    bool in_use;
    bool completed;
    bool ok;
    char text[640];

    /* Structured copies of the results, for callers that are not a human.
     * Pointers inside stack messages die when the callback returns, hence the
     * copies. */
    uint8_t value_count;
    zb_reply_value_t values[ZB_REPLY_MAX_ATTRS];

    uint8_t zdp_ep_count;
    uint8_t zdp_eps[8];

    uint8_t desc_ep;
    uint8_t desc_in_count;
    uint16_t desc_in[16];
} zb_reply_t;

void zbreq_init(void);

/* Replies come from a small static pool, never the stack: a callback that
 * arrives just after a timeout must not write into a dead frame. */
zb_reply_t *zbreq_alloc(void);
void zbreq_release(zb_reply_t *reply);

/* Fills text/ok and releases the waiter. Called from the Zigbee task. */
void zbreq_complete(zb_reply_t *reply, bool ok, const char *fmt, ...)
    __attribute__((format(printf, 3, 4)));

/* --- ZCL ---------------------------------------------------------------- */

enum {
    ZB_ONOFF_OFF = 0,
    ZB_ONOFF_ON = 1,
    ZB_ONOFF_TOGGLE = 2,
};

/* Sends On/Off. Returns once the stack accepted the command; a default
 * response is awaited but its absence is not an error (many devices skip it). */
esp_err_t zbzcl_onoff(uint16_t nwk, uint8_t ep, int op);

esp_err_t zbzcl_level(uint16_t nwk, uint8_t ep, uint8_t level, uint16_t transition_ds);
esp_err_t zbzcl_identify(uint16_t nwk, uint8_t ep, uint16_t seconds);

esp_err_t zbzcl_read_attr(zb_reply_t *reply, uint16_t nwk, uint8_t ep, uint16_t cluster,
                         const uint16_t *attrs, uint8_t count);

esp_err_t zbzcl_write_attr(zb_reply_t *reply, uint16_t nwk, uint8_t ep, uint16_t cluster,
                           uint16_t attr, uint8_t type, const void *value, uint16_t size);

esp_err_t zbzcl_config_report(zb_reply_t *reply, uint16_t nwk, uint8_t ep, uint16_t cluster,
                              uint16_t attr, uint8_t type, uint16_t min_s, uint16_t max_s);

/* --- ZDO ---------------------------------------------------------------- */

esp_err_t zbzdo_active_ep(zb_reply_t *reply, uint16_t nwk);
esp_err_t zbzdo_simple_desc(zb_reply_t *reply, uint16_t nwk, uint8_t ep);
esp_err_t zbzdo_lqi(zb_reply_t *reply, uint16_t nwk);

/* Binding installed on the *device*, so that it reports `cluster` to us. */
esp_err_t zbzdo_bind(zb_reply_t *reply, uint16_t nwk, uint8_t ep, uint16_t cluster);

/* Asks the device to leave. Asynchronous; the leave indication is what
 * actually removes it from the table. */
esp_err_t zbzdo_leave(uint16_t nwk);

/* --- Callback entry points (called by zb_coordinator) ------------------- */

void zbzcl_on_read_rsp(const ezb_zcl_cmd_read_attr_rsp_message_t *msg);
void zbzcl_on_write_rsp(const ezb_zcl_cmd_write_attr_rsp_message_t *msg);
void zbzcl_on_config_report_rsp(const ezb_zcl_cmd_config_report_rsp_message_t *msg);
void zbzcl_on_default_rsp(const ezb_zcl_cmd_default_rsp_message_t *msg);

/* Reads the OnOff attribute and fills `reply` with "on"/"off". Used right
 * after sending a command so the reported state is the device's own. */
esp_err_t zbzcl_refresh_onoff(zb_reply_t *reply, uint16_t nwk, uint8_t ep);

/* Human-readable size of a ZCL attribute type, 0 for variable-length types. */
int zbzcl_type_size(uint8_t type);

/* Formats one attribute value for display ("on" as 1, strings quoted). */
void zbzcl_format_value(char *out, size_t out_len, uint8_t type, const void *value);
