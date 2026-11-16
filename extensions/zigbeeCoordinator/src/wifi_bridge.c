#include "wifi_bridge.h"

#include <string.h>

#include "config.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_timer.h"
#include "esp_wifi.h"
#include "mqtt_bridge.h"

static const char *TAG = "wifi";

#define WIFI_MAX_DELAY_MS 60000
#define WIFI_BASE_DELAY_MS 2000

static bool s_started;
static bool s_connected;
static bool s_netif_created;
static bool s_handlers_registered;
static bool s_wifi_inited;
static int s_retry;
static esp_timer_handle_t s_retry_timer;

static void schedule_retry(void)
{
    if (!s_retry_timer) {
        return;
    }
    uint32_t delay = WIFI_BASE_DELAY_MS;
    for (int i = 0; i < s_retry && delay < WIFI_MAX_DELAY_MS; i++) {
        delay *= 2;
    }
    if (delay > WIFI_MAX_DELAY_MS) {
        delay = WIFI_MAX_DELAY_MS;
    }
    if (s_retry < 1000) {
        s_retry++;
    }
    ESP_LOGW(TAG, "reconnecting in %ums", (unsigned)delay);
    esp_timer_stop(s_retry_timer);
    esp_timer_start_once(s_retry_timer, (uint64_t)delay * 1000ULL);
}

static void retry_cb(void *arg)
{
    esp_wifi_connect();
}

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        s_connected = false;
        mqtt_stop();
        schedule_retry();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        const ip_event_got_ip_t *ev = data;
        ESP_LOGI(TAG, "got ip " IPSTR, IP2STR(&ev->ip_info.ip));
        s_connected = true;
        s_retry = 0;
        mqtt_start();
    }
}

void wifi_start(void)
{
    if (s_started) {
        return;
    }
    const app_config_t *cfg = config_get();
    if (!cfg->wifi_ssid[0]) {
        ESP_LOGI(TAG, "no SSID configured, staying offline");
        return;
    }

    esp_err_t err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "esp_netif_init: %s", esp_err_to_name(err));
        return;
    }

    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, "event loop: %s", esp_err_to_name(err));
        return;
    }

    if (!s_netif_created) {
        esp_netif_create_default_wifi_sta();
        s_netif_created = true;
    }

    if (!s_wifi_inited) {
        wifi_init_config_t init_cfg = WIFI_INIT_CONFIG_DEFAULT();
        ESP_ERROR_CHECK(esp_wifi_init(&init_cfg));
        s_wifi_inited = true;
    }

    if (!s_handlers_registered) {
        esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL);
        esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL);
        s_handlers_registered = true;
    }

    wifi_config_t wifi_cfg;
    memset(&wifi_cfg, 0, sizeof(wifi_cfg));
    strncpy((char *)wifi_cfg.sta.ssid, cfg->wifi_ssid, sizeof(wifi_cfg.sta.ssid) - 1);
    strncpy((char *)wifi_cfg.sta.password, cfg->wifi_pass, sizeof(wifi_cfg.sta.password) - 1);
    wifi_cfg.sta.threshold.authmode = WIFI_AUTH_OPEN;
    wifi_cfg.sta.sae_pwe_h2e = WPA3_SAE_PWE_BOTH;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));

    if (!s_retry_timer) {
        const esp_timer_create_args_t args = {
            .callback = retry_cb,
            .name = "wifi_retry",
        };
        ESP_ERROR_CHECK(esp_timer_create(&args, &s_retry_timer));
    }

    ESP_ERROR_CHECK(esp_wifi_start());
    s_started = true;
    ESP_LOGI(TAG, "connecting to \"%s\"", cfg->wifi_ssid);
}

esp_err_t wifi_connect(const char *ssid, const char *pass)
{
    if (!ssid || !ssid[0]) {
        return ESP_ERR_INVALID_ARG;
    }
    app_config_t *cfg = config_get();
    strncpy(cfg->wifi_ssid, ssid, sizeof(cfg->wifi_ssid) - 1);
    cfg->wifi_ssid[sizeof(cfg->wifi_ssid) - 1] = '\0';
    strncpy(cfg->wifi_pass, pass ? pass : "", sizeof(cfg->wifi_pass) - 1);
    cfg->wifi_pass[sizeof(cfg->wifi_pass) - 1] = '\0';
    esp_err_t err = config_save();
    if (err != ESP_OK) {
        return err;
    }

    if (!s_started) {
        wifi_start();
        return ESP_OK;
    }

    wifi_config_t wifi_cfg;
    memset(&wifi_cfg, 0, sizeof(wifi_cfg));
    strncpy((char *)wifi_cfg.sta.ssid, cfg->wifi_ssid, sizeof(wifi_cfg.sta.ssid) - 1);
    strncpy((char *)wifi_cfg.sta.password, cfg->wifi_pass, sizeof(wifi_cfg.sta.password) - 1);
    wifi_cfg.sta.threshold.authmode = WIFI_AUTH_OPEN;
    wifi_cfg.sta.sae_pwe_h2e = WPA3_SAE_PWE_BOTH;

    esp_wifi_disconnect();
    err = esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg);
    if (err == ESP_OK) {
        s_retry = 0;
        esp_wifi_connect();
    }
    return err;
}

void wifi_clear(void)
{
    app_config_t *cfg = config_get();
    memset(cfg->wifi_ssid, 0, sizeof(cfg->wifi_ssid));
    memset(cfg->wifi_pass, 0, sizeof(cfg->wifi_pass));
    config_save();
    if (s_started) {
        esp_wifi_disconnect();
        esp_wifi_stop();
        s_started = false;
    }
    s_connected = false;
    mqtt_stop();
}

bool wifi_connected(void)
{
    return s_connected;
}

const char *wifi_state_str(void)
{
    if (!s_started) {
        return "off";
    }
    return s_connected ? "connected" : "connecting";
}

int8_t wifi_rssi(void)
{
    wifi_ap_record_t ap;
    if (s_connected && esp_wifi_sta_get_ap_info(&ap) == ESP_OK) {
        return ap.rssi;
    }
    return 0;
}
