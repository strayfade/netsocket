#include "config.h"

#include <string.h>

#include "esp_log.h"
#include "nvs.h"

static const char *TAG = "config";

#define CFG_NAMESPACE "zbcfg"
#define CFG_KEY "cfg"
#define CFG_MAGIC 0x5a424331u /* "ZBC1" */
#define CFG_VERSION 1

static app_config_t s_cfg;

static void set_defaults(app_config_t *cfg)
{
    memset(cfg, 0, sizeof(*cfg));
    cfg->magic = CFG_MAGIC;
    cfg->version = CFG_VERSION;
    cfg->mqtt_port = 1883;
    cfg->mqtt_tls = false;
    cfg->zigbee_channel = 20; /* away from the usual WiFi 1/6/11 */
    cfg->bridge_enabled = false;
}

void config_init(void)
{
    set_defaults(&s_cfg);

    nvs_handle_t h;
    esp_err_t err = nvs_open(CFG_NAMESPACE, NVS_READONLY, &h);
    if (err != ESP_OK) {
        ESP_LOGI(TAG, "no stored settings, using defaults");
        return;
    }

    app_config_t stored;
    size_t len = sizeof(stored);
    err = nvs_get_blob(h, CFG_KEY, &stored, &len);
    nvs_close(h);

    if (err != ESP_OK || len != sizeof(stored) || stored.magic != CFG_MAGIC) {
        ESP_LOGI(TAG, "settings missing or from another layout, using defaults");
        return;
    }

    s_cfg = stored;
    /* Fields added in later versions must not be zeroed by an old blob. */
    if (s_cfg.mqtt_port == 0) {
        s_cfg.mqtt_port = 1883;
    }
    if (s_cfg.zigbee_channel < 11 || s_cfg.zigbee_channel > 26) {
        s_cfg.zigbee_channel = 20;
    }

    ESP_LOGI(TAG, "loaded settings (wifi=%s mqtt=%s bridge=%s channel=%u)",
             s_cfg.wifi_ssid[0] ? s_cfg.wifi_ssid : "-",
             s_cfg.mqtt_host[0] ? s_cfg.mqtt_host : "-",
             s_cfg.bridge_enabled ? "on" : "off", s_cfg.zigbee_channel);
}

app_config_t *config_get(void)
{
    return &s_cfg;
}

esp_err_t config_save(void)
{
    nvs_handle_t h;
    esp_err_t err = nvs_open(CFG_NAMESPACE, NVS_READWRITE, &h);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "nvs_open failed: %s", esp_err_to_name(err));
        return err;
    }

    s_cfg.magic = CFG_MAGIC;
    s_cfg.version = CFG_VERSION;
    err = nvs_set_blob(h, CFG_KEY, &s_cfg, sizeof(s_cfg));
    if (err == ESP_OK) {
        err = nvs_commit(h);
    }
    nvs_close(h);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "saving settings failed: %s", esp_err_to_name(err));
    }
    return err;
}

void config_wipe(void)
{
    set_defaults(&s_cfg);
    nvs_handle_t h;
    if (nvs_open(CFG_NAMESPACE, NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_all(h);
        nvs_commit(h);
        nvs_close(h);
    }
    ESP_LOGW(TAG, "settings wiped");
}

bool config_has_wifi(void)
{
    return s_cfg.wifi_ssid[0] != '\0';
}

bool config_has_mqtt(void)
{
    return s_cfg.mqtt_host[0] != '\0' && s_cfg.mqtt_port != 0;
}
