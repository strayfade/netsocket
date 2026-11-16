#include "zb_zcl.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static const char *TAG = "zbzcl";

typedef enum {
    RK_NONE = 0,
    RK_READ,
    RK_WRITE,
    RK_CONFIG,
    RK_DEFAULT,
} req_kind_t;

#define ZBREQ_POOL 3

static zb_reply_t s_pool[ZBREQ_POOL];
static SemaphoreHandle_t s_guard; /* guards the pending slot + pool */
static SemaphoreHandle_t s_busy;  /* one radio request at a time */

static zb_reply_t *s_pending;
static req_kind_t s_pending_kind;
static uint16_t s_pending_nwk;
static uint16_t s_pending_cluster;

void zbreq_init(void)
{
    s_guard = xSemaphoreCreateMutex();
    s_busy = xSemaphoreCreateMutex();
    for (int i = 0; i < ZBREQ_POOL; i++) {
        s_pool[i].sem = xSemaphoreCreateBinary();
        s_pool[i].in_use = false;
    }
}

zb_reply_t *zbreq_alloc(void)
{
    zb_reply_t *found = NULL;
    if (!s_guard) {
        return NULL;
    }
    xSemaphoreTake(s_guard, portMAX_DELAY);
    for (int i = 0; i < ZBREQ_POOL; i++) {
        if (!s_pool[i].in_use) {
            found = &s_pool[i];
            found->in_use = true;
            found->completed = false;
            found->ok = false;
            found->text[0] = '\0';
            found->value_count = 0;
            found->zdp_ep_count = 0;
            found->desc_ep = 0;
            found->desc_in_count = 0;
            /* Drain anything left over from an earlier timed-out request. */
            xSemaphoreTake(found->sem, 0);
            break;
        }
    }
    xSemaphoreGive(s_guard);
    return found;
}

void zbreq_release(zb_reply_t *reply)
{
    if (!reply || !s_guard) {
        return;
    }
    xSemaphoreTake(s_guard, portMAX_DELAY);
    if (s_pending == reply) {
        s_pending = NULL;
        s_pending_kind = RK_NONE;
    }
    reply->in_use = false;
    xSemaphoreGive(s_guard);
}

void zbreq_complete(zb_reply_t *reply, bool ok, const char *fmt, ...)
{
    if (!reply) {
        return;
    }
    reply->completed = true;
    reply->ok = ok;
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(reply->text, sizeof(reply->text), fmt, ap);
    va_end(ap);
    if (reply->sem) {
        xSemaphoreGive(reply->sem);
    }
}

/* Takes a request slot. Returns false when another request is still running. */
static bool req_begin(zb_reply_t *reply, req_kind_t kind, uint16_t nwk, uint16_t cluster)
{
    if (!s_busy || !s_guard) {
        return false;
    }
    if (xSemaphoreTake(s_busy, pdMS_TO_TICKS(ZB_REQ_TIMEOUT_MS * 2)) != pdTRUE) {
        return false;
    }

    reply->completed = false;
    reply->ok = false;
    reply->text[0] = '\0';

    xSemaphoreTake(s_guard, portMAX_DELAY);
    s_pending = reply;
    s_pending_kind = kind;
    s_pending_nwk = nwk;
    s_pending_cluster = cluster;
    xSemaphoreGive(s_guard);
    return true;
}

/* Waits for the reply, then always frees the slot. */
static bool req_wait(zb_reply_t *reply, uint32_t timeout_ms)
{
    bool signalled = xSemaphoreTake(reply->sem, pdMS_TO_TICKS(timeout_ms)) == pdTRUE;

    xSemaphoreTake(s_guard, portMAX_DELAY);
    if (s_pending == reply) {
        s_pending = NULL;
        s_pending_kind = RK_NONE;
    }
    xSemaphoreGive(s_guard);

    if (s_busy) {
        xSemaphoreGive(s_busy);
    }

    if (!signalled) {
        snprintf(reply->text, sizeof(reply->text), "timeout waiting for device");
        reply->ok = false;
    }
    return signalled && reply->completed;
}

/* Called from the Zigbee task: claims the pending slot when it matches. */
static zb_reply_t *claim_pending(req_kind_t kind, const ezb_zcl_cmd_hdr_t *hdr)
{
    zb_reply_t *reply = NULL;
    if (!s_guard) {
        return NULL;
    }
    xSemaphoreTake(s_guard, portMAX_DELAY);
    if (s_pending && s_pending_kind == kind) {
        bool addr_ok = true;
        if (hdr && hdr->src_addr.addr_mode == EZB_ADDR_MODE_SHORT) {
            addr_ok = (hdr->src_addr.u.short_addr == s_pending_nwk);
        }
        bool cluster_ok = true;
        if (hdr && s_pending_cluster) {
            cluster_ok = (hdr->cluster_id == s_pending_cluster);
        }
        if (addr_ok && cluster_ok) {
            reply = s_pending;
            s_pending = NULL;
            s_pending_kind = RK_NONE;
        }
    }
    xSemaphoreGive(s_guard);
    return reply;
}

/* --- value formatting ---------------------------------------------------- */

int zbzcl_type_size(uint8_t type)
{
    switch (type) {
    case EZB_ZCL_ATTR_TYPE_BOOL:
    case EZB_ZCL_ATTR_TYPE_DATA8:
    case EZB_ZCL_ATTR_TYPE_MAP8:
    case EZB_ZCL_ATTR_TYPE_UINT8:
    case EZB_ZCL_ATTR_TYPE_INT8:
    case EZB_ZCL_ATTR_TYPE_ENUM8:
        return 1;
    case EZB_ZCL_ATTR_TYPE_DATA16:
    case EZB_ZCL_ATTR_TYPE_MAP16:
    case EZB_ZCL_ATTR_TYPE_UINT16:
    case EZB_ZCL_ATTR_TYPE_INT16:
    case EZB_ZCL_ATTR_TYPE_ENUM16:
        return 2;
    case EZB_ZCL_ATTR_TYPE_DATA24:
    case EZB_ZCL_ATTR_TYPE_MAP24:
    case EZB_ZCL_ATTR_TYPE_UINT24:
    case EZB_ZCL_ATTR_TYPE_INT24:
        return 3;
    case EZB_ZCL_ATTR_TYPE_DATA32:
    case EZB_ZCL_ATTR_TYPE_MAP32:
    case EZB_ZCL_ATTR_TYPE_UINT32:
    case EZB_ZCL_ATTR_TYPE_INT32:
    case EZB_ZCL_ATTR_TYPE_SINGLE:
        return 4;
    case EZB_ZCL_ATTR_TYPE_DATA40:
    case EZB_ZCL_ATTR_TYPE_MAP40:
    case EZB_ZCL_ATTR_TYPE_UINT40:
    case EZB_ZCL_ATTR_TYPE_INT40:
        return 5;
    case EZB_ZCL_ATTR_TYPE_DATA48:
    case EZB_ZCL_ATTR_TYPE_MAP48:
    case EZB_ZCL_ATTR_TYPE_UINT48:
    case EZB_ZCL_ATTR_TYPE_INT48:
        return 6;
    case EZB_ZCL_ATTR_TYPE_DATA56:
    case EZB_ZCL_ATTR_TYPE_MAP56:
    case EZB_ZCL_ATTR_TYPE_UINT56:
    case EZB_ZCL_ATTR_TYPE_INT56:
        return 7;
    case EZB_ZCL_ATTR_TYPE_DATA64:
    case EZB_ZCL_ATTR_TYPE_MAP64:
    case EZB_ZCL_ATTR_TYPE_UINT64:
    case EZB_ZCL_ATTR_TYPE_INT64:
    case EZB_ZCL_ATTR_TYPE_EUI64:
        return 8;
    default:
        return 0;
    }
}

static uint64_t read_le(const uint8_t *b, int len)
{
    uint64_t v = 0;
    for (int i = len - 1; i >= 0; i--) {
        v = (v << 8) | b[i];
    }
    return v;
}

static void format_hex(char *out, size_t n, const uint8_t *b, int len)
{
    size_t pos = 0;
    for (int i = 0; i < len && pos + 3 < n; i++) {
        pos += (size_t)snprintf(out + pos, n - pos, "%02x", b[i]);
    }
    if (pos == 0) {
        snprintf(out, n, "-");
    }
}

void zbzcl_format_value(char *out, size_t n, uint8_t type, const void *value)
{
    const uint8_t *b = (const uint8_t *)value;

    int size = zbzcl_type_size(type);

    switch (type) {
    case EZB_ZCL_ATTR_TYPE_BOOL:
        snprintf(out, n, "%u", (unsigned)(b[0] & 0x01));
        return;

    case EZB_ZCL_ATTR_TYPE_UINT8:
    case EZB_ZCL_ATTR_TYPE_MAP8:
    case EZB_ZCL_ATTR_TYPE_ENUM8:
    case EZB_ZCL_ATTR_TYPE_DATA8:
        snprintf(out, n, "%u", (unsigned)b[0]);
        return;

    case EZB_ZCL_ATTR_TYPE_INT8:
        snprintf(out, n, "%d", (int)(int8_t)b[0]);
        return;

    case EZB_ZCL_ATTR_TYPE_UINT16:
    case EZB_ZCL_ATTR_TYPE_MAP16:
    case EZB_ZCL_ATTR_TYPE_ENUM16:
        snprintf(out, n, "%u", (unsigned)read_le(b, size));
        return;

    case EZB_ZCL_ATTR_TYPE_INT16:
        snprintf(out, n, "%d", (int)(int16_t)read_le(b, size));
        return;

    case EZB_ZCL_ATTR_TYPE_UINT24:
    case EZB_ZCL_ATTR_TYPE_MAP24:
    case EZB_ZCL_ATTR_TYPE_UINT32:
    case EZB_ZCL_ATTR_TYPE_MAP32:
    case EZB_ZCL_ATTR_TYPE_UINT48:
    case EZB_ZCL_ATTR_TYPE_UINT64:
        snprintf(out, n, "%llu", (unsigned long long)read_le(b, size));
        return;

    case EZB_ZCL_ATTR_TYPE_INT24:
    case EZB_ZCL_ATTR_TYPE_INT32:
    case EZB_ZCL_ATTR_TYPE_INT48:
    case EZB_ZCL_ATTR_TYPE_INT64:
        /* Sign-extend by shifting into a 64-bit signed value. */
        {
            int64_t v = (int64_t)read_le(b, size);
            int bits = size * 8;
            if (bits < 64 && (v & (1LL << (bits - 1)))) {
                v -= (1LL << bits);
            }
            snprintf(out, n, "%lld", (long long)v);
        }
        return;

    case EZB_ZCL_ATTR_TYPE_STRING:
    case EZB_ZCL_ATTR_TYPE_OCTSTR: {
        int len = b[0];
        if (type == EZB_ZCL_ATTR_TYPE_STRING) {
            snprintf(out, n, "\"%.*s\"", len, (const char *)(b + 1));
        } else {
            snprintf(out, n, "\"0x");
            size_t pos = strlen(out);
            for (int i = 0; i < len && pos + 3 < n; i++) {
                pos += (size_t)snprintf(out + pos, n - pos, "%02x", b[1 + i]);
            }
            snprintf(out + pos, n - pos, "\"");
        }
        return;
    }

    default:
        format_hex(out, n, b, size > 0 ? size : 4);
        return;
    }
}

/* --- ZCL send helpers ---------------------------------------------------- */

static void fill_ctrl(ezb_zcl_cmd_ctrl_t *ctrl, uint16_t nwk, uint8_t ep, uint16_t cluster)
{
    memset(ctrl, 0, sizeof(*ctrl));
    ctrl->dst_addr = EZB_ADDRESS_SHORT(nwk);
    ctrl->dst_ep = ep;
    ctrl->src_ep = ZB_COORD_EP;
    ctrl->cluster_id = cluster;
    ctrl->manuf_code = EZB_ZCL_STD_MANUF_CODE;
    ctrl->fc.dis_default_rsp = 1;
}

static void fill_cluster_ctrl(ezb_zcl_cluster_cmd_ctrl_t *ctrl, uint16_t nwk, uint8_t ep)
{
    memset(ctrl, 0, sizeof(*ctrl));
    ctrl->dst_addr = EZB_ADDRESS_SHORT(nwk);
    ctrl->dst_ep = ep;
    ctrl->src_ep = ZB_COORD_EP;
    ctrl->dis_default_rsp = false;
}

esp_err_t zbzcl_onoff(uint16_t nwk, uint8_t ep, int op)
{
    esp_err_t ret = ESP_FAIL;
    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        return ESP_ERR_NO_MEM;
    }

    /* Wait for the default response so a dead device is noticed, but treat a
     * missing response as "sent" - plenty of devices do not answer. */
    if (req_begin(reply, RK_DEFAULT, nwk, 0x0006)) {
        ezb_zcl_on_off_cmd_t cmd;
        fill_cluster_ctrl(&cmd.cmd_ctrl, nwk, ep);

        esp_zigbee_lock_acquire(portMAX_DELAY);
        ezb_err_t err;
        if (op == ZB_ONOFF_ON) {
            err = ezb_zcl_on_off_on_cmd_req(&cmd);
        } else if (op == ZB_ONOFF_TOGGLE) {
            err = ezb_zcl_on_off_toggle_cmd_req(&cmd);
        } else {
            err = ezb_zcl_on_off_off_cmd_req(&cmd);
        }
        esp_zigbee_lock_release();

        ret = (err == EZB_ERR_NONE) ? ESP_OK : ESP_FAIL;
        req_wait(reply, ZB_CMD_TIMEOUT_MS);
    }

    zbreq_release(reply);
    return ret;
}

esp_err_t zbzcl_level(uint16_t nwk, uint8_t ep, uint8_t level, uint16_t transition_ds)
{
    esp_err_t ret = ESP_FAIL;
    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        return ESP_ERR_NO_MEM;
    }

    if (req_begin(reply, RK_DEFAULT, nwk, 0x0008)) {
        ezb_zcl_level_move_to_level_cmd_t cmd;
        fill_cluster_ctrl(&cmd.cmd_ctrl, nwk, ep);
        cmd.payload.level = level;
        cmd.payload.transition_time = transition_ds;

        esp_zigbee_lock_acquire(portMAX_DELAY);
        ezb_err_t err = ezb_zcl_level_move_to_level_cmd_req(&cmd);
        esp_zigbee_lock_release();

        ret = (err == EZB_ERR_NONE) ? ESP_OK : ESP_FAIL;
        req_wait(reply, ZB_CMD_TIMEOUT_MS);
    }

    zbreq_release(reply);
    return ret;
}

esp_err_t zbzcl_identify(uint16_t nwk, uint8_t ep, uint16_t seconds)
{
    esp_err_t ret = ESP_FAIL;
    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        return ESP_ERR_NO_MEM;
    }

    if (req_begin(reply, RK_DEFAULT, nwk, 0x0003)) {
        ezb_zcl_identify_cmd_t cmd;
        fill_cluster_ctrl(&cmd.cmd_ctrl, nwk, ep);
        cmd.payload.identify_time = seconds;

        esp_zigbee_lock_acquire(portMAX_DELAY);
        ezb_err_t err = ezb_zcl_identify_identify_cmd_req(&cmd);
        esp_zigbee_lock_release();

        ret = (err == EZB_ERR_NONE) ? ESP_OK : ESP_FAIL;
        req_wait(reply, ZB_CMD_TIMEOUT_MS);
    }

    zbreq_release(reply);
    return ret;
}

esp_err_t zbzcl_read_attr(zb_reply_t *reply, uint16_t nwk, uint8_t ep, uint16_t cluster,
                         const uint16_t *attrs, uint8_t count)
{
    if (!reply || !attrs || count == 0) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!req_begin(reply, RK_READ, nwk, cluster)) {
        return ESP_ERR_TIMEOUT;
    }

    ezb_zcl_read_attr_cmd_t cmd;
    fill_ctrl(&cmd.cmd_ctrl, nwk, ep, cluster);
    cmd.payload.attr_number = count;
    cmd.payload.attr_field = (uint16_t *)attrs;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    ezb_err_t err = ezb_zcl_read_attr_cmd_req(&cmd);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "send failed (0x%04x)", err);
        /* Complete without a waiter would leak the busy slot; wait briefly. */
        req_wait(reply, 0);
        return ESP_FAIL;
    }

    req_wait(reply, ZB_REQ_TIMEOUT_MS);
    return reply->ok ? ESP_OK : ESP_FAIL;
}

esp_err_t zbzcl_write_attr(zb_reply_t *reply, uint16_t nwk, uint8_t ep, uint16_t cluster,
                           uint16_t attr, uint8_t type, const void *value, uint16_t size)
{
    if (!reply || !value) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!req_begin(reply, RK_WRITE, nwk, cluster)) {
        return ESP_ERR_TIMEOUT;
    }

    ezb_zcl_attribute_t attribute;
    memset(&attribute, 0, sizeof(attribute));
    attribute.id = attr;
    attribute.data.type = type;
    attribute.data.size = size;
    attribute.data.value = (void *)value;

    ezb_zcl_write_attr_cmd_t cmd;
    fill_ctrl(&cmd.cmd_ctrl, nwk, ep, cluster);
    cmd.payload.attr_number = 1;
    cmd.payload.attr_field = &attribute;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    ezb_err_t err = ezb_zcl_write_attr_cmd_req(&cmd);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "send failed (0x%04x)", err);
        req_wait(reply, 0);
        return ESP_FAIL;
    }

    req_wait(reply, ZB_REQ_TIMEOUT_MS);
    return reply->ok ? ESP_OK : ESP_FAIL;
}

esp_err_t zbzcl_config_report(zb_reply_t *reply, uint16_t nwk, uint8_t ep, uint16_t cluster,
                              uint16_t attr, uint8_t type, uint16_t min_s, uint16_t max_s)
{
    if (!reply) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!req_begin(reply, RK_CONFIG, nwk, cluster)) {
        return ESP_ERR_TIMEOUT;
    }

    ezb_zcl_config_report_record_t record;
    memset(&record, 0, sizeof(record));
    record.direction = EZB_ZCL_REPORTING_SEND;
    record.attr_id = attr;
    record.client.attr_type = type;
    record.client.min_interval = min_s;
    record.client.max_interval = max_s;
    /* reportable_change stays 0: mandatory for analog attributes in theory,
     * accepted as "any change" by every implementation we target. */

    ezb_zcl_config_report_cmd_t cmd;
    fill_ctrl(&cmd.cmd_ctrl, nwk, ep, cluster);
    cmd.payload.record_number = 1;
    cmd.payload.record_field = &record;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    ezb_err_t err = ezb_zcl_config_report_cmd_req(&cmd);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "send failed (0x%04x)", err);
        req_wait(reply, 0);
        return ESP_FAIL;
    }

    req_wait(reply, ZB_REQ_TIMEOUT_MS);
    return reply->ok ? ESP_OK : ESP_FAIL;
}

esp_err_t zbzcl_refresh_onoff(zb_reply_t *reply, uint16_t nwk, uint8_t ep)
{
    static const uint16_t attrs[] = {0x0000};
    return zbzcl_read_attr(reply, nwk, ep, 0x0006, attrs, 1);
}

/* --- ZCL callbacks ------------------------------------------------------- */

void zbzcl_on_read_rsp(const ezb_zcl_cmd_read_attr_rsp_message_t *msg)
{
    if (!msg) {
        return;
    }
    zb_reply_t *reply = claim_pending(RK_READ, msg->in.header);
    if (!reply) {
        return;
    }

    size_t pos = 0;
    bool all_ok = true;
    reply->text[0] = '\0';
    reply->value_count = 0;

    for (const ezb_zcl_read_attr_rsp_variable_t *v = msg->in.variables; v; v = v->next) {
        char value[96];
        if (v->status == EZB_ZCL_STATUS_SUCCESS) {
            zbzcl_format_value(value, sizeof(value), v->attr_type, v->attr_value);

            /* Keep a bounded copy for callers that need the raw bytes. */
            if (reply->value_count < ZB_REPLY_MAX_ATTRS) {
                zb_reply_value_t *out = &reply->values[reply->value_count++];
                out->attr = v->attr_id;
                out->type = v->attr_type;
                int sz = zbzcl_type_size(v->attr_type);
                if (sz == 0 && (v->attr_type == EZB_ZCL_ATTR_TYPE_STRING ||
                                v->attr_type == EZB_ZCL_ATTR_TYPE_OCTSTR)) {
                    sz = 1 + ((const uint8_t *)v->attr_value)[0];
                }
                if (sz <= 0 || sz > ZB_REPLY_VALUE_MAX) {
                    sz = ZB_REPLY_VALUE_MAX;
                }
                out->size = (uint8_t)sz;
                memcpy(out->data, v->attr_value, (size_t)sz);
            }
        } else {
            snprintf(value, sizeof(value), "err(0x%02x)", v->status);
            all_ok = false;
        }
        if (pos < sizeof(reply->text)) {
            pos += (size_t)snprintf(reply->text + pos, sizeof(reply->text) - pos, "%s0x%04x=%s",
                                    pos ? "," : "", v->attr_id, value);
        }
    }

    if (pos == 0) {
        snprintf(reply->text, sizeof(reply->text), "empty response");
        all_ok = false;
    }

    zbreq_complete(reply, all_ok, "%s", reply->text);
}

void zbzcl_on_write_rsp(const ezb_zcl_cmd_write_attr_rsp_message_t *msg)
{
    if (!msg) {
        return;
    }
    zb_reply_t *reply = claim_pending(RK_WRITE, msg->in.header);
    if (!reply) {
        return;
    }

    bool all_ok = true;
    size_t pos = 0;
    reply->text[0] = '\0';

    for (const ezb_zcl_write_attr_rsp_variable_t *v = msg->in.variables; v; v = v->next) {
        if (v->status != EZB_ZCL_STATUS_SUCCESS) {
            all_ok = false;
            pos += (size_t)snprintf(reply->text + pos, sizeof(reply->text) - pos,
                                    "%s0x%04x=err(0x%02x)", pos ? "," : "", v->attr_id, v->status);
        }
    }
    if (all_ok) {
        snprintf(reply->text, sizeof(reply->text), "written");
    }

    zbreq_complete(reply, all_ok, "%s", reply->text);
}

void zbzcl_on_config_report_rsp(const ezb_zcl_cmd_config_report_rsp_message_t *msg)
{
    if (!msg) {
        return;
    }
    zb_reply_t *reply = claim_pending(RK_CONFIG, msg->in.header);
    if (!reply) {
        return;
    }

    bool all_ok = true;
    size_t pos = 0;
    reply->text[0] = '\0';

    for (const ezb_zcl_config_report_rsp_variable_t *v = msg->in.variables; v; v = v->next) {
        if (v->status != EZB_ZCL_STATUS_SUCCESS) {
            all_ok = false;
            pos += (size_t)snprintf(reply->text + pos, sizeof(reply->text) - pos,
                                    "%s0x%04x=err(0x%02x)", pos ? "," : "", v->attr_id, v->status);
        }
    }
    if (all_ok) {
        snprintf(reply->text, sizeof(reply->text), "configured");
    }

    zbreq_complete(reply, all_ok, "%s", reply->text);
}

void zbzcl_on_default_rsp(const ezb_zcl_cmd_default_rsp_message_t *msg)
{
    if (!msg) {
        return;
    }
    zb_reply_t *reply = claim_pending(RK_DEFAULT, msg->in.header);
    if (!reply) {
        return;
    }
    bool ok = (msg->in.status_code == EZB_ZCL_STATUS_SUCCESS);
    zbreq_complete(reply, ok, ok ? "ok" : "device rejected (0x%02x)", msg->in.status_code);
}

/* --- ZDO ---------------------------------------------------------------- */

static void active_ep_cb(const ezb_zdo_active_ep_req_result_t *result, void *user_ctx)
{
    zb_reply_t *reply = (zb_reply_t *)user_ctx;
    if (!reply) {
        return;
    }
    if (result->error != EZB_ERR_NONE || !result->rsp) {
        zbreq_complete(reply, false, "ZDO failed (0x%04x)", result->error);
        return;
    }
    if (result->rsp->status != EZB_ZDP_STATUS_SUCCESS) {
        zbreq_complete(reply, false, "ZDO status 0x%02x", result->rsp->status);
        return;
    }

    size_t pos = 0;
    reply->text[0] = '\0';
    for (int i = 0; i < result->rsp->active_ep_count; i++) {
        pos += (size_t)snprintf(reply->text + pos, sizeof(reply->text) - pos, "%s%u",
                                pos ? "," : "", result->rsp->active_ep_list[i]);
    }
    if (pos == 0) {
        snprintf(reply->text, sizeof(reply->text), "none");
    }

    reply->zdp_ep_count = 0;
    for (int i = 0; i < result->rsp->active_ep_count && i < (int)sizeof(reply->zdp_eps); i++) {
        reply->zdp_eps[reply->zdp_ep_count++] = result->rsp->active_ep_list[i];
    }

    zbreq_complete(reply, true, "%s", reply->text);
}

esp_err_t zbzdo_active_ep(zb_reply_t *reply, uint16_t nwk)
{
    if (!reply) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!req_begin(reply, RK_NONE, nwk, 0)) {
        return ESP_ERR_TIMEOUT;
    }

    ezb_zdo_active_ep_req_t req;
    memset(&req, 0, sizeof(req));
    req.dst_nwk_addr = nwk;
    req.field.nwk_addr_of_interest = nwk;
    req.cb = active_ep_cb;
    req.user_ctx = reply;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    ezb_err_t err = ezb_zdo_active_ep_req(&req);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "send failed (0x%04x)", err);
        req_wait(reply, 0);
        return ESP_FAIL;
    }
    req_wait(reply, ZB_REQ_TIMEOUT_MS);
    return reply->ok ? ESP_OK : ESP_FAIL;
}

static void simple_desc_cb(const ezb_zdo_simple_desc_req_result_t *result, void *user_ctx)
{
    zb_reply_t *reply = (zb_reply_t *)user_ctx;
    if (!reply) {
        return;
    }
    if (result->error != EZB_ERR_NONE || !result->rsp) {
        zbreq_complete(reply, false, "ZDO failed (0x%04x)", result->error);
        return;
    }
    if (result->rsp->status != EZB_ZDP_STATUS_SUCCESS) {
        zbreq_complete(reply, false, "ZDO status 0x%02x", result->rsp->status);
        return;
    }

    const ezb_af_simple_desc_t *d = &result->rsp->desc;
    size_t pos = 0;
    reply->text[0] = '\0';
    pos += (size_t)snprintf(reply->text + pos, sizeof(reply->text) - pos, "ep=%u prof=0x%04x dev=0x%04x in=",
                            d->ep_id, d->app_profile_id, d->app_device_id);
    for (int i = 0; i < d->app_input_cluster_count; i++) {
        pos += (size_t)snprintf(reply->text + pos, sizeof(reply->text) - pos, "%s0x%04x",
                                i ? "," : "", d->app_cluster_list[i]);
    }
    pos += (size_t)snprintf(reply->text + pos, sizeof(reply->text) - pos, " out=");
    for (int i = 0; i < d->app_output_cluster_count; i++) {
        pos += (size_t)snprintf(reply->text + pos, sizeof(reply->text) - pos, "%s0x%04x",
                                i ? "," : "", d->app_cluster_list[d->app_input_cluster_count + i]);
    }

    reply->desc_ep = d->ep_id;
    reply->desc_in_count = 0;
    for (int i = 0; i < d->app_input_cluster_count && i < (int)(sizeof(reply->desc_in) / sizeof(reply->desc_in[0])); i++) {
        reply->desc_in[reply->desc_in_count++] = d->app_cluster_list[i];
    }

    zbreq_complete(reply, true, "%s", reply->text);
}

esp_err_t zbzdo_simple_desc(zb_reply_t *reply, uint16_t nwk, uint8_t ep)
{
    if (!reply) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!req_begin(reply, RK_NONE, nwk, 0)) {
        return ESP_ERR_TIMEOUT;
    }

    ezb_zdo_simple_desc_req_t req;
    memset(&req, 0, sizeof(req));
    req.dst_nwk_addr = nwk;
    req.field.nwk_addr_of_interest = nwk;
    req.field.endpoint = ep;
    req.cb = simple_desc_cb;
    req.user_ctx = reply;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    ezb_err_t err = ezb_zdo_simple_desc_req(&req);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "send failed (0x%04x)", err);
        req_wait(reply, 0);
        return ESP_FAIL;
    }
    req_wait(reply, ZB_REQ_TIMEOUT_MS);
    return reply->ok ? ESP_OK : ESP_FAIL;
}

static void lqi_cb(const ezb_zdo_nwk_mgmt_lqi_req_result_t *result, void *user_ctx)
{
    zb_reply_t *reply = (zb_reply_t *)user_ctx;
    if (!reply) {
        return;
    }
    if (result->error != EZB_ERR_NONE || !result->rsp) {
        zbreq_complete(reply, false, "ZDO failed (0x%04x)", result->error);
        return;
    }

    /* Find the device in the neighbour table. LQA is 0..255, roughly /3 = dBm. */
    for (int i = 0; i < result->rsp->neighbor_table_list_count; i++) {
        const ezb_zdp_nwk_mgmt_lqi_neighbor_table_entry_t *e = &result->rsp->neighbor_table_list[i];
        if (e->nwk_addr == s_pending_nwk || (s_pending_nwk == 0 && e->nwk_addr != 0)) {
            int lqi = e->lqa;
            int rssi = (lqi > 0) ? (int)(lqi / 3) - 100 : -127;
            zbreq_complete(reply, true, "lqi=%d rssi~%d dBm depth=%u", lqi, rssi, e->device_depth);
            return;
        }
    }
    zbreq_complete(reply, false, "not in neighbour table");
}

esp_err_t zbzdo_lqi(zb_reply_t *reply, uint16_t nwk)
{
    if (!reply) {
        return ESP_ERR_INVALID_ARG;
    }
    if (!req_begin(reply, RK_NONE, nwk, 0)) {
        return ESP_ERR_TIMEOUT;
    }
    /* s_pending_nwk is used by the callback, keep it set for the lookup. */
    s_pending_nwk = nwk;

    ezb_zdo_nwk_mgmt_lqi_req_t req;
    memset(&req, 0, sizeof(req));
    req.dst_nwk_addr = nwk;
    req.field.start_index = 0;
    req.cb = lqi_cb;
    req.user_ctx = reply;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    ezb_err_t err = ezb_zdo_nwk_mgmt_lqi_req(&req);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "send failed (0x%04x)", err);
        req_wait(reply, 0);
        return ESP_FAIL;
    }
    req_wait(reply, ZB_REQ_TIMEOUT_MS);
    return reply->ok ? ESP_OK : ESP_FAIL;
}

static void bind_cb(const ezb_zdp_bind_req_result_t *result, void *user_ctx)
{
    zb_reply_t *reply = (zb_reply_t *)user_ctx;
    if (!reply) {
        return;
    }
    if (result->error != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "ZDO failed (0x%04x)", result->error);
        return;
    }
    if (result->rsp && result->rsp->status != EZB_ZDP_STATUS_SUCCESS) {
        zbreq_complete(reply, false, "ZDO status 0x%02x", result->rsp->status);
        return;
    }
    zbreq_complete(reply, true, "bound");
}

esp_err_t zbzdo_bind(zb_reply_t *reply, uint16_t nwk, uint8_t ep, uint16_t cluster)
{
    if (!reply) {
        return ESP_ERR_INVALID_ARG;
    }
    ezb_extaddr_t device_ext;
    ezb_extaddr_t coord_ext;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    ezb_err_t err = ezb_address_extended_by_short(nwk, &device_ext);
    ezb_nwk_get_extended_address(&coord_ext);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "no extended address for 0x%04x", nwk);
        return ESP_FAIL;
    }

    if (!req_begin(reply, RK_NONE, nwk, cluster)) {
        return ESP_ERR_TIMEOUT;
    }

    ezb_zdo_bind_req_t req;
    memset(&req, 0, sizeof(req));
    /* The binding is installed on the device, mapping its reporting endpoint
     * cluster onto our endpoint. */
    req.dst_nwk_addr = nwk;
    req.field.src_addr = device_ext;
    req.field.src_ep = ep;
    req.field.cluster_id = cluster;
    req.field.dst_addr_mode = EZB_ADDR_MODE_EXT;
    req.field.dst_addr.extended_addr = coord_ext;
    req.field.dst_ep = ZB_COORD_EP;
    req.cb = bind_cb;
    req.user_ctx = reply;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    err = ezb_zdo_bind_req(&req);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        zbreq_complete(reply, false, "send failed (0x%04x)", err);
        req_wait(reply, 0);
        return ESP_FAIL;
    }
    req_wait(reply, ZB_REQ_TIMEOUT_MS);
    return reply->ok ? ESP_OK : ESP_FAIL;
}

static void leave_cb(const ezb_zdo_nwk_mgmt_leave_req_result_t *result, void *user_ctx)
{
    /* Nothing to correlate: the device either leaves (leave indication removes
     * it from the table) or it does not. */
    (void)result;
    (void)user_ctx;
}

esp_err_t zbzdo_leave(uint16_t nwk)
{
    ezb_extaddr_t ext;
    esp_zigbee_lock_acquire(portMAX_DELAY);
    ezb_err_t err = ezb_address_extended_by_short(nwk, &ext);
    esp_zigbee_lock_release();

    if (err != EZB_ERR_NONE) {
        return ESP_FAIL;
    }

    ezb_zdo_nwk_mgmt_leave_req_t req;
    memset(&req, 0, sizeof(req));
    req.dst_nwk_addr = nwk;
    req.field.device_addr = ext;
    req.field.remove_children = false;
    req.field.rejoin = false;
    req.cb = leave_cb;
    req.user_ctx = NULL;

    esp_zigbee_lock_acquire(portMAX_DELAY);
    err = ezb_zdo_nwk_mgmt_leave_req(&req);
    esp_zigbee_lock_release();

    return (err == EZB_ERR_NONE) ? ESP_OK : ESP_FAIL;
}
