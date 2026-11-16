/*
 * netsocket Zigbee coordinator - entry point.
 *
 * Boot order matters:
 *   NVS -> RF front end -> console -> settings -> device table -> request engine
 *   -> Zigbee stack -> CLI -> WiFi (only if credentials exist)
 *
 * The Zigbee stack keeps its network datasets in the shared "nvs" partition, so
 * nvs_flash_init() must succeed before the stack is initialised.
 */
#include <string.h>

#include "cli.h"
#include "config.h"
#include "console.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "mqtt_bridge.h"
#include "nvs_flash.h"
#include "wifi_bridge.h"
#include "zb_coordinator.h"
#include "zb_devices.h"
#include "zb_zcl.h"

static const char *TAG = "boot";

/*
 * Seeed XIAO ESP32-C6 RF switch.
 *
 * The board shares one antenna front end between WiFi and 802.15.4 and gates it
 * behind two GPIOs (same pins as the Arduino variant: WIFI_ENABLE=3,
 * WIFI_ANT_CONFIG=14). Leaving them floating is the usual reason "Zigbee does
 * not work" on this board: the radio transmits into a disconnected antenna.
 * Level 0 selects the onboard ceramic antenna; use 1 for the u.FL connector.
 */
#define XIAO_RF_ENABLE_GPIO GPIO_NUM_3
#define XIAO_RF_ANTENNA_GPIO GPIO_NUM_14
#define XIAO_RF_USE_EXTERNAL_ANTENNA 0

static void rf_frontend_init(void)
{
    gpio_config_t cfg = {
        .pin_bit_mask = (1ULL << XIAO_RF_ENABLE_GPIO) | (1ULL << XIAO_RF_ANTENNA_GPIO),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&cfg));
    gpio_set_level(XIAO_RF_ENABLE_GPIO, 1);
    gpio_set_level(XIAO_RF_ANTENNA_GPIO, XIAO_RF_USE_EXTERNAL_ANTENNA ? 1 : 0);
}

static void on_zigbee_event(zb_evt_t evt, zb_device_t *dev, uint16_t cluster)
{
    mqtt_on_zigbee_event(evt, dev, cluster);
}

void app_main(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_LOGW(TAG, "erasing NVS (%s)", esp_err_to_name(err));
        ESP_ERROR_CHECK(nvs_flash_erase());
        ESP_ERROR_CHECK(nvs_flash_init());
    } else {
        ESP_ERROR_CHECK(err);
    }

    rf_frontend_init();
    console_init();
    ESP_LOGI(TAG, "netsocket zigbee coordinator starting");

    config_init();
    zbdev_init();
    zbreq_init();

    zbcoord_set_event_cb(on_zigbee_event);
    zbcoord_start();
    cli_start();

    if (config_has_wifi()) {
        wifi_start();
    } else {
        ESP_LOGI(TAG, "no WiFi configured; serial-only mode");
    }
}
