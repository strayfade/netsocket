#include "zb_coordinator.h"

#include <stdio.h>
#include <string.h>

#include "console.h"
#include "config.h"
#include "esp_zigbee.h"
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "zb_zcl.h"
#include "ezbee/zha.h"

static const char *TAG = "zbcoord";

#define ZB_INTERVIEW_QUEUE_LEN 8

static zbcoord_evt_cb_t s_evt_cb;
static QueueHandle_t s_interview_q;

static bool s_formed;
static bool s_stack_started;
static uint32_t s_permit_until_ms; /* xTaskGetTickCount based */
static bool s_auto_permit_done;

/* --- small helpers ------------------------------------------------------- */

static uint32_t now_ms(void)
{
    return (uint32_t)(xTaskGetTickCount() * portTICK_PERIOD_MS);
}

static void emit(zb_evt_t evt, zb_device_t *dev, uint16_t cluster)
{
    if (s_evt_cb) {
        s_evt_cb(evt, dev, cluster);
    }
}

static void copy_zb_string(char *dst, size_t dst_len, const uint8_t *data, uint8_t size)
{
    if (!dst || dst_len == 0) {
        return;
    }
    if (!data || size < 1) {
        dst[0] = '\0';
        return;
    }
    size_t len = data[0];
    if (len > (size_t)(size - 1)) {
        len = (size_t)(size - 1);
    }
    if (len >= dst_len) {
        len = dst_len - 1;
    }
    memcpy(dst, data + 1, len);
    dst[len] = '\0';
}

/* --- commissioning ------------------------------------------------------- */

static uint32_t channel_mask_for(uint8_t channel)
{
    if (channel >= 11 && channel <= 26) {
        return 1u << channel;
    }
    return 0x07FFF800u; /* all of 11..26 */
}

/* Callback context already runs inside the Zigbee task with the stack lock
 * held, so these two primitives deliberately do NOT take the lock. The public
 * wrappers below do. */
static void start_formation_nolock(void)
{
    uint32_t mask = channel_mask_for(config_get()->zigbee_channel);
    ezb_err_t merr = ezb_bdb_set_primary_channel_set(mask);
    ezb_err_t cerr = ezb_bdb_start_top_level_commissioning(EZB_BDB_MODE_NETWORK_FORMATION);

    ESP_LOGI(TAG, "network formation started (mask 0x%08x, set=0x%04x form=0x%04x)",
             (unsigned)mask, merr, cerr);
}

static bool permit_nolock(uint8_t seconds)
{
    ezb_err_t err = seconds ? ezb_bdb_open_network(seconds) : ezb_bdb_close_network();
    if (err != EZB_ERR_NONE) {
        return false;
    }
    s_permit_until_ms = now_ms() + (uint32_t)seconds * 1000u;
    return true;
}

esp_err_t zbcoord_permit(uint8_t seconds)
{
    if (!s_formed) {
        return ESP_ERR_INVALID_STATE;
    }
    esp_zigbee_lock_acquire(portMAX_DELAY);
    bool ok = permit_nolock(seconds);
    esp_zigbee_lock_release();
    return ok ? ESP_OK : ESP_FAIL;
}

esp_err_t zbcoord_form(uint8_t channel)
{
    if (s_formed) {
        return ESP_ERR_INVALID_STATE;
    }
    config_get()->zigbee_channel = channel;
    config_save();

    esp_zigbee_lock_acquire(portMAX_DELAY);
    start_formation_nolock();
    esp_zigbee_lock_release();
    return ESP_OK;
}

void zbcoord_factory_reset(void)
{
    console_write_line("OK resetting zigbee state, device will reboot");
    vTaskDelay(pdMS_TO_TICKS(150));

    /* Only call into the stack when it actually started; otherwise a plain
     * restart is all that is needed. */
    if (!s_stack_started) {
        esp_restart();
    }
    esp_zigbee_factory_reset(); /* does not return */
}

bool zbcoord_is_formed(void)
{
    return s_formed;
}

void zbcoord_net_info(zbcoord_net_t *out)
{
    if (!out) {
        return;
    }
    memset(out, 0, sizeof(*out));

    out->formed = s_formed;
    out->device_count = (uint8_t)zbdev_count();
    out->permit_remaining = 0;

    /* Calling into the stack before it has formed a network is not safe, and a
     * fresh board has no addresses to report anyway. */
    if (!s_formed) {
        return;
    }

    out->panid = ezb_nwk_get_panid();
    out->short_addr = ezb_nwk_get_short_address();
    out->channel = ezb_nwk_get_current_channel();
    ezb_nwk_get_extended_panid(&out->ext_pan);
    ezb_nwk_get_extended_address(&out->ieee);

    uint32_t now = now_ms();
    out->permit_remaining = (s_permit_until_ms > now) ? (uint8_t)((s_permit_until_ms - now) / 1000u) : 0;
}

/* --- device interview ---------------------------------------------------- */

static void refresh_onoff(zb_device_t *dev, zb_reply_t *reply)
{
    static const uint16_t attrs[] = {0x0000};
    if (zbzcl_read_attr(reply, dev->nwk, dev->onoff_ep, 0x0006, attrs, 1) == ESP_OK) {
        for (int i = 0; i < reply->value_count; i++) {
            if (reply->values[i].attr == 0x0000) {
                zbdev_note_attr(dev, 0x0006, 0x0000, reply->values[i].type, reply->values[i].data);
            }
        }
    }
}

static void refresh_analog(zb_device_t *dev, zb_reply_t *reply, uint16_t cluster, uint8_t ep, uint16_t attr_id)
{
    if (!ep) {
        return;
    }
    if (zbzcl_read_attr(reply, dev->nwk, ep, cluster, &attr_id, 1) == ESP_OK) {
        for (int i = 0; i < reply->value_count; i++) {
            if (reply->values[i].attr == attr_id) {
                zbdev_note_attr(dev, cluster, attr_id, reply->values[i].type, reply->values[i].data);
            }
        }
    }
}

static void setup_reporting(zb_device_t *dev, zb_reply_t *reply)
{
    /* Bind and configure reporting once per joining device. Configure
     * Reporting alone is usually enough (reports go back to the configuring
     * client), but binding makes it work on devices that ignore that rule. */
    if (dev->has_onoff && dev->onoff_ep) {
        zbzdo_bind(reply, dev->nwk, dev->onoff_ep, 0x0006);
        if (zbzcl_config_report(reply, dev->nwk, dev->onoff_ep, 0x0006, 0x0000,
                                EZB_ZCL_ATTR_TYPE_BOOL, 0, 300) != ESP_OK) {
            ESP_LOGD(TAG, "configure reporting (on/off) failed: %s", reply->text);
        }
    }
    if (dev->has_level && dev->level_ep) {
        zbzcl_config_report(reply, dev->nwk, dev->level_ep, 0x0008, 0x0000,
                            EZB_ZCL_ATTR_TYPE_UINT8, 1, 300);
    }
    if (dev->has_power && dev->power_ep) {
        zbzcl_config_report(reply, dev->nwk, dev->power_ep, 0x0B04, 0x050B,
                            EZB_ZCL_ATTR_TYPE_INT16, 10, 300);
    }
    if (dev->has_energy && dev->energy_ep) {
        zbzcl_config_report(reply, dev->nwk, dev->energy_ep, 0x0702, 0x0300,
                            EZB_ZCL_ATTR_TYPE_UINT48, 30, 600);
    }
}

static void interview_one(uint16_t nwk)
{
    if (!zbcoord_is_formed()) {
        return;
    }
    zb_device_t *dev = zbdev_find_nwk(nwk);
    if (!dev) {
        return;
    }

    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        ESP_LOGW(TAG, "interview: no reply slot");
        return;
    }

    zbdev_reset_endpoints(dev);

    if (zbzdo_active_ep(reply, nwk) == ESP_OK && reply->zdp_ep_count > 0) {
        for (int i = 0; i < reply->zdp_ep_count; i++) {
            zbdev_add_endpoint(dev, reply->zdp_eps[i]);
        }
    } else {
        zbdev_add_endpoint(dev, 1);
    }

    for (int e = 0; e < dev->ep_count; e++) {
        uint8_t ep = dev->eps[e];
        if (zbzdo_simple_desc(reply, nwk, ep) == ESP_OK) {
            for (int c = 0; c < reply->desc_in_count; c++) {
                zbdev_add_cluster(dev, ep, reply->desc_in[c]);
            }
        }
    }

    uint8_t basic_ep = dev->ep_count ? dev->eps[0] : 1;
    static const uint16_t basic_attrs[] = {0x0004, 0x0005}; /* manufacturer, model */
    if (zbzcl_read_attr(reply, nwk, basic_ep, 0x0000, basic_attrs, 2) == ESP_OK) {
        for (int i = 0; i < reply->value_count; i++) {
            if (reply->values[i].attr == 0x0004) {
                copy_zb_string(dev->manufacturer, sizeof(dev->manufacturer),
                               reply->values[i].data, reply->values[i].size);
            } else if (reply->values[i].attr == 0x0005) {
                copy_zb_string(dev->model, sizeof(dev->model),
                               reply->values[i].data, reply->values[i].size);
            }
        }
    }

    dev->has_onoff = zbdev_has_cluster(dev, 0x0006);
    dev->onoff_ep = zbdev_ep_for_cluster(dev, 0x0006);
    dev->has_level = zbdev_has_cluster(dev, 0x0008);
    dev->level_ep = zbdev_ep_for_cluster(dev, 0x0008);
    dev->has_power = zbdev_has_cluster(dev, 0x0B04);
    dev->power_ep = zbdev_ep_for_cluster(dev, 0x0B04);
    dev->has_energy = zbdev_has_cluster(dev, 0x0702);
    dev->energy_ep = zbdev_ep_for_cluster(dev, 0x0702);

    dev->interviewed = true;
    zbdev_save();

    setup_reporting(dev, reply);

    if (dev->has_onoff && dev->onoff_ep) {
        refresh_onoff(dev, reply);
    }
    if (dev->has_level && dev->level_ep) {
        refresh_analog(dev, reply, 0x0008, dev->level_ep, 0x0000);
    }
    if (dev->has_power && dev->power_ep) {
        refresh_analog(dev, reply, 0x0B04, dev->power_ep, 0x050B);
    }
    if (dev->has_energy && dev->energy_ep) {
        refresh_analog(dev, reply, 0x0702, dev->energy_ep, 0x0300);
    }

    char ieee[24];
    zbdev_ieee_str(&dev->ieee, ieee, sizeof(ieee));
    console_printf("EVT interviewed nwk=0x%04x ieee=%s model=%s onoff=%u level=%u power=%u energy=%u",
                   dev->nwk, ieee, dev->model[0] ? dev->model : "?",
                   dev->has_onoff, dev->has_level, dev->has_power, dev->has_energy);

    zbreq_release(reply);
    emit(ZB_EVT_INTERVIEWED, dev, 0);
}

static void interview_task(void *arg)
{
    uint16_t nwk;
    for (;;) {
        if (xQueueReceive(s_interview_q, &nwk, portMAX_DELAY) == pdTRUE) {
            interview_one(nwk);
        }
    }
}

/* --- signals ------------------------------------------------------------- */

static const char *signal_name(ezb_app_signal_type_t type)
{
    switch (type) {
    case EZB_ZDO_SIGNAL_SKIP_STARTUP:
        return "startup";
    case EZB_BDB_SIGNAL_DEVICE_FIRST_START:
        return "first-start";
    case EZB_BDB_SIGNAL_DEVICE_REBOOT:
        return "reboot";
    case EZB_BDB_SIGNAL_FORMATION:
        return "formation";
    case EZB_BDB_SIGNAL_STEERING:
        return "steering";
    case EZB_ZDO_SIGNAL_DEVICE_ANNCE:
        return "device-announce";
    case EZB_ZDO_SIGNAL_LEAVE:
        return "leave";
    case EZB_ZDO_SIGNAL_LEAVE_INDICATION:
        return "leave-indication";
    case EZB_NWK_SIGNAL_PERMIT_JOIN_STATUS:
        return "permit-join";
    case EZB_ZDO_SIGNAL_DEVICE_UNAVAILABLE:
        return "device-unavailable";
    default:
        return "other";
    }
}

static bool app_signal_handler(const ezb_app_signal_t *signal)
{
    ezb_app_signal_type_t type = ezb_app_signal_get_type(signal);
    const void *params = ezb_app_signal_get_params(signal);

    switch (type) {
    case EZB_ZDO_SIGNAL_SKIP_STARTUP: {
        uint32_t mask = channel_mask_for(config_get()->zigbee_channel);
        (void)ezb_bdb_set_primary_channel_set(mask);
        (void)ezb_bdb_start_top_level_commissioning(EZB_BDB_MODE_INITIALIZATION);
        break;
    }

    case EZB_BDB_SIGNAL_DEVICE_FIRST_START:
    case EZB_BDB_SIGNAL_DEVICE_REBOOT: {
        ezb_bdb_comm_status_t status = params ? *(const ezb_bdb_comm_status_t *)params : EZB_BDB_STATUS_SUCCESS;
        if (status != EZB_BDB_STATUS_SUCCESS) {
            ESP_LOGW(TAG, "commissioning (%s) failed with 0x%02x", signal_name(type), status);
            break;
        }
        if (ezb_bdb_is_factory_new()) {
            console_write_line("EVT network factory-new, forming");
            start_formation_nolock();
        } else {
            s_formed = true;
            zbdev_mark_all_offline();
            zbcoord_net_t info;
            zbcoord_net_info(&info);
            console_printf("EVT network restored panid=0x%04x channel=%u short=0x%04x",
                           info.panid, info.channel, info.short_addr);
        }
        break;
    }

    case EZB_BDB_SIGNAL_FORMATION: {
        s_formed = true;
        zbcoord_net_t info;
        zbcoord_net_info(&info);
        char extpan[24];
        zbdev_ieee_str(&info.ext_pan, extpan, sizeof(extpan));
        console_printf("EVT network formed panid=0x%04x channel=%u short=0x%04x extpan=%s",
                       info.panid, info.channel, info.short_addr, extpan);

        /* First formation: invite devices right away, so flashing and then
         * resetting the outlet is all a user has to do. */
        if (!s_auto_permit_done) {
            s_auto_permit_done = true;
            permit_nolock(180);
        }
        break;
    }

    case EZB_ZDO_SIGNAL_DEVICE_ANNCE: {
        const ezb_zdo_signal_device_annce_params_t *p = params;
        if (!p) {
            break;
        }
        zb_device_t *dev = zbdev_upsert(p->short_addr, &p->device_addr, p->capability);
        if (!dev) {
            break;
        }
        char ieee[24];
        zbdev_ieee_str(&p->device_addr, ieee, sizeof(ieee));
        console_printf("EVT join nwk=0x%04x ieee=%s type=%s",
                       p->short_addr, ieee,
                       (p->capability & 0x02) ? "router" : "end-device");
        emit(ZB_EVT_JOINED, dev, 0);

        uint16_t nwk = p->short_addr;
        if (s_interview_q) {
            xQueueSend(s_interview_q, &nwk, pdMS_TO_TICKS(50));
        }
        break;
    }

    case EZB_ZDO_SIGNAL_LEAVE_INDICATION: {
        const ezb_zdo_signal_leave_indication_params_t *p = params;
        if (!p) {
            break;
        }
        zb_device_t *dev = zbdev_find_ieee(&p->device_addr);
        if (dev) {
            console_printf("EVT leave nwk=0x%04x", dev->nwk);
            emit(ZB_EVT_LEFT, dev, 0);
        }
        zbdev_remove_by_nwk(p->short_addr);
        zbdev_save();
        break;
    }

    case EZB_ZDO_SIGNAL_DEVICE_UNAVAILABLE: {
        /* Payload layout is version dependent; the cheapest reliable signal is
         * that some device stopped answering. Mark unknown ones offline lazily
         * through the report path instead of guessing here. */
        console_write_line("EVT device unavailable");
        break;
    }

    case EZB_NWK_SIGNAL_PERMIT_JOIN_STATUS: {
        uint8_t duration = params ? *(const uint8_t *)params : 0;
        if (duration) {
            s_permit_until_ms = now_ms() + (uint32_t)duration * 1000u;
            console_printf("EVT permit open %u s", duration);
        } else {
            s_permit_until_ms = 0;
            console_write_line("EVT permit closed");
        }
        emit(ZB_EVT_PERMIT, NULL, duration);
        break;
    }

    case EZB_ZDO_SIGNAL_LEAVE:
        console_write_line("EVT left network");
        s_formed = false;
        break;

    default:
        ESP_LOGD(TAG, "signal %s (0x%02x)", signal_name(type), type);
        break;
    }
    return true;
}

/* --- ZCL core actions ---------------------------------------------------- */

static void core_action_handler(ezb_zcl_core_action_callback_id_t callback_id, void *message)
{
    switch (callback_id) {
    case EZB_ZCL_CORE_READ_ATTR_RSP_CB_ID:
        zbzcl_on_read_rsp((const ezb_zcl_cmd_read_attr_rsp_message_t *)message);
        break;

    case EZB_ZCL_CORE_WRITE_ATTR_RSP_CB_ID:
        zbzcl_on_write_rsp((const ezb_zcl_cmd_write_attr_rsp_message_t *)message);
        break;

    case EZB_ZCL_CORE_CONFIG_REPORT_RSP_CB_ID:
        zbzcl_on_config_report_rsp((const ezb_zcl_cmd_config_report_rsp_message_t *)message);
        break;

    case EZB_ZCL_CORE_DEFAULT_RSP_CB_ID:
        zbzcl_on_default_rsp((const ezb_zcl_cmd_default_rsp_message_t *)message);
        break;

    case EZB_ZCL_CORE_REPORT_ATTR_CB_ID: {
        const ezb_zcl_cmd_report_attr_message_t *msg = message;
        if (!msg || !msg->in.header) {
            break;
        }
        const ezb_zcl_cmd_hdr_t *hdr = msg->in.header;
        if (hdr->src_addr.addr_mode != EZB_ADDR_MODE_SHORT) {
            break;
        }
        zb_device_t *dev = zbdev_find_nwk(hdr->src_addr.u.short_addr);
        if (!dev) {
            break;
        }

        for (const ezb_zcl_report_attr_variable_t *v = msg->in.variables; v; v = v->next) {
            zbdev_note_attr(dev, hdr->cluster_id, v->attr_id, v->attr_type, v->attr_value);

            char value[96];
            zbzcl_format_value(value, sizeof(value), v->attr_type, v->attr_value);
            console_printf("EVT report nwk=0x%04x ep=%u cluster=0x%04x attr=0x%04x value=%s",
                           dev->nwk, hdr->src_ep, hdr->cluster_id, v->attr_id, value);

            emit(ZB_EVT_REPORT, dev, hdr->cluster_id);
        }
        break;
    }

    default:
        break;
    }
}

/* --- stack task ---------------------------------------------------------- */

static esp_err_t create_endpoint(void)
{
    ezb_af_device_desc_t dev_desc = ezb_af_create_device_desc();
    ezb_zha_on_off_switch_config_t ep_cfg = EZB_ZHA_ON_OFF_SWITCH_CONFIG();
    ezb_af_ep_desc_t ep = ezb_zha_create_on_off_switch(ZB_COORD_EP, &ep_cfg);

    if (!ep) {
        ESP_LOGE(TAG, "creating coordinator endpoint failed");
        return ESP_FAIL;
    }

    ezb_zcl_cluster_desc_t basic = ezb_af_endpoint_get_cluster_desc(ep, EZB_ZCL_CLUSTER_ID_BASIC, EZB_ZCL_CLUSTER_SERVER);
    if (basic) {
        ezb_zcl_basic_cluster_desc_add_attr(basic, EZB_ZCL_ATTR_BASIC_MANUFACTURER_NAME_ID, "netsocket");
        ezb_zcl_basic_cluster_desc_add_attr(basic, EZB_ZCL_ATTR_BASIC_MODEL_IDENTIFIER_ID, "zigbee-coordinator-c6");
    }

    esp_err_t err = ezb_af_device_add_endpoint_desc(dev_desc, ep);
    if (err != ESP_OK) {
        return err;
    }
    return ezb_af_device_desc_register(dev_desc);
}

static void zigbee_task(void *arg)
{
    esp_zigbee_config_t config;
    memset(&config, 0, sizeof(config));
    config.device_config.device_type = EZB_NWK_DEVICE_TYPE_COORDINATOR;
    config.device_config.install_code_policy = false;
    config.device_config.zczr_config.max_children = 10;
    config.platform_config.storage_partition_name = "nvs";
    config.platform_config.radio_config.radio_mode = ESP_ZIGBEE_RADIO_MODE_NATIVE;

    ESP_ERROR_CHECK(esp_zigbee_init(&config));

    if (create_endpoint() != ESP_OK) {
        ESP_LOGE(TAG, "endpoint registration failed, continuing without it");
    }

    ezb_zcl_core_action_handler_register(core_action_handler);
    ezb_app_signal_add_handler(app_signal_handler);

    ESP_ERROR_CHECK(esp_zigbee_start(false));
    s_stack_started = true;
    esp_zigbee_launch_mainloop();

    esp_zigbee_deinit();
    vTaskDelete(NULL);
}

void zbcoord_start(void)
{
    s_interview_q = xQueueCreate(ZB_INTERVIEW_QUEUE_LEN, sizeof(uint16_t));
    xTaskCreate(interview_task, "zb_interview", 4096, NULL, 4, NULL);
    xTaskCreate(zigbee_task, "zigbee_main", 6144, NULL, 5, NULL);
}

void zbcoord_set_event_cb(zbcoord_evt_cb_t cb)
{
    s_evt_cb = cb;
}

void zbcoord_interview(zb_device_t *dev)
{
    if (!dev || !s_interview_q) {
        return;
    }
    uint16_t nwk = dev->nwk;
    xQueueSend(s_interview_q, &nwk, pdMS_TO_TICKS(50));
}
