#include "mqtt_bridge.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "cJSON.h"
#include "config.h"
#include "console.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "mqtt_client.h"
#include "zb_zcl.h"

static const char *TAG = "mqtt";

#define MQTT_CMD_QUEUE_LEN 8
#define MQTT_CMD_MAX 96

typedef struct {
    char node[24];
    char object[16];
    char payload[MQTT_CMD_MAX];
} mqtt_cmd_t;

static esp_mqtt_client_handle_t s_client;
static bool s_connected;
static bool s_stopping;
static QueueHandle_t s_cmd_q;

static void publish_discovery(zb_device_t *dev);

/* --- publishing ---------------------------------------------------------- */

static void publish(const char *topic, const char *payload, int retain)
{
    if (!s_client || !s_connected) {
        return;
    }
    esp_mqtt_client_publish(s_client, topic, payload, 0, 1, retain);
}

static void publish_json(const char *topic, cJSON *root, int retain)
{
    char *text = cJSON_PrintUnformatted(root);
    if (text) {
        publish(topic, text, retain);
        cJSON_free(text);
    }
}

static void publish_availability(zb_device_t *dev, bool online)
{
    char node[24];
    char topic[96];
    zbdev_node_id(dev, node, sizeof(node));
    snprintf(topic, sizeof(topic), "netsocket/dev/%s/availability", node);
    publish(topic, online ? "online" : "offline", 1);
}

static void publish_onoff_state(zb_device_t *dev)
{
    if (!dev->has_onoff || !dev->onoff_ep) {
        return;
    }
    char node[24];
    char topic[96];
    zbdev_node_id(dev, node, sizeof(node));
    snprintf(topic, sizeof(topic), "netsocket/dev/%s/%u-onoff/state", node, dev->onoff_ep);
    publish(topic, dev->onoff ? "ON" : "OFF", 1);
}

static void publish_sensor_state(zb_device_t *dev, uint8_t ep, const char *kind, double value)
{
    if (!ep) {
        return;
    }
    char node[24];
    char topic[96];
    char payload[32];
    char object[24];
    zbdev_node_id(dev, node, sizeof(node));
    snprintf(object, sizeof(object), "%u-%s", ep, kind);
    snprintf(topic, sizeof(topic), "netsocket/dev/%s/%s/state", node, object);
    snprintf(payload, sizeof(payload), "%.3f", value);
    publish(topic, payload, 1);
}

static cJSON *device_block(zb_device_t *dev, char *node, size_t node_len)
{
    zbdev_node_id(dev, node, node_len);

    cJSON *device = cJSON_CreateObject();
    cJSON *ids = cJSON_CreateArray();
    cJSON_AddItemToArray(ids, cJSON_CreateString(node));
    cJSON_AddItemToObject(device, "identifiers", ids);
    cJSON_AddStringToObject(device, "name",
                            dev->label[0] ? dev->label : (dev->model[0] ? dev->model : "Zigbee device"));
    cJSON_AddStringToObject(device, "manufacturer",
                            dev->manufacturer[0] ? dev->manufacturer : "Zigbee");
    cJSON_AddStringToObject(device, "model", dev->model[0] ? dev->model : "unknown");
    cJSON_AddStringToObject(device, "sw_version", "1.0.0");
    return device;
}

static void add_sensor_discovery(zb_device_t *dev, uint8_t ep, const char *kind,
                                 const char *unit, const char *device_class)
{
    char node[24];
    char topic[128];
    char object[24];
    char state_topic[96];
    char unique_id[64];
    char object_id[64];

    zbdev_node_id(dev, node, sizeof(node));
    snprintf(object, sizeof(object), "%u-%s", ep, kind);
    snprintf(topic, sizeof(topic), "homeassistant/sensor/%s/%s/config", node, object);
    snprintf(state_topic, sizeof(state_topic), "netsocket/dev/%s/%s/state", node, object);
    snprintf(unique_id, sizeof(unique_id), "%s-%s", node, object);
    snprintf(object_id, sizeof(object_id), "%s_%u_%s", node, ep, kind);

    cJSON *root = cJSON_CreateObject();
    cJSON_AddItemToObject(root, "device", device_block(dev, node, sizeof(node)));
    cJSON_AddStringToObject(root, "unique_id", unique_id);
    cJSON_AddStringToObject(root, "object_id", object_id);
    cJSON_AddStringToObject(root, "name", kind);
    cJSON_AddStringToObject(root, "state_topic", state_topic);
    cJSON_AddStringToObject(root, "unit_of_measurement", unit);
    cJSON_AddStringToObject(root, "device_class", device_class);
    cJSON_AddStringToObject(root, "state_class", "measurement");
    publish_json(topic, root, 1);
    cJSON_Delete(root);
}

static void publish_discovery(zb_device_t *dev)
{
    if (!dev || !dev->interviewed) {
        return;
    }

    char node[24];
    zbdev_node_id(dev, node, sizeof(node));

    if (dev->has_onoff && dev->onoff_ep) {
        char topic[128];
        char state_topic[96];
        char command_topic[96];
        char availability_topic[96];
        char unique_id[64];
        char object_id[64];
        char object[24];

        snprintf(object, sizeof(object), "%u-onoff", dev->onoff_ep);
        snprintf(topic, sizeof(topic), "homeassistant/switch/%s/%s/config", node, object);
        snprintf(state_topic, sizeof(state_topic), "netsocket/dev/%s/%s/state", node, object);
        snprintf(command_topic, sizeof(command_topic), "netsocket/dev/%s/%s/set", node, object);
        snprintf(availability_topic, sizeof(availability_topic), "netsocket/dev/%s/availability", node);
        snprintf(unique_id, sizeof(unique_id), "%s-%s", node, object);
        snprintf(object_id, sizeof(object_id), "%s_%u_onoff", node, dev->onoff_ep);

        cJSON *root = cJSON_CreateObject();
        cJSON_AddItemToObject(root, "device", device_block(dev, node, sizeof(node)));
        cJSON_AddStringToObject(root, "unique_id", unique_id);
        cJSON_AddStringToObject(root, "object_id", object_id);
        cJSON_AddStringToObject(root, "name", "Outlet");
        cJSON_AddStringToObject(root, "state_topic", state_topic);
        cJSON_AddStringToObject(root, "command_topic", command_topic);
        cJSON_AddStringToObject(root, "availability_topic", availability_topic);
        cJSON_AddStringToObject(root, "payload_on", "ON");
        cJSON_AddStringToObject(root, "payload_off", "OFF");
        cJSON_AddStringToObject(root, "state_on", "ON");
        cJSON_AddStringToObject(root, "state_off", "OFF");
        publish_json(topic, root, 1);
        cJSON_Delete(root);
    }

    if (dev->has_power && dev->power_ep) {
        add_sensor_discovery(dev, dev->power_ep, "power", "W", "power");
    }
    if (dev->has_energy && dev->energy_ep) {
        add_sensor_discovery(dev, dev->energy_ep, "energy", "kWh", "energy");
    }
}

static void publish_state(zb_device_t *dev, uint16_t cluster)
{
    if (!dev) {
        return;
    }
    if (cluster == 0 || cluster == 0x0006) {
        publish_onoff_state(dev);
    }
    if (cluster == 0x0B04 && dev->has_power) {
        publish_sensor_state(dev, dev->power_ep, "power", (double)dev->power_w);
    }
    if (cluster == 0x0702 && dev->has_energy) {
        /* Metering sums are usually Wh; netsocket wants kWh for state_class
         * energy. */
        publish_sensor_state(dev, dev->energy_ep, "energy", (double)dev->energy_wh / 1000.0);
    }
}

void mqtt_publish_all(void)
{
    for (int i = 1; i <= ZB_MAX_DEVICES; i++) {
        zb_device_t *dev = zbdev_get(i);
        if (!dev) {
            continue;
        }
        publish_availability(dev, dev->online);
        if (dev->interviewed) {
            publish_discovery(dev);
            publish_state(dev, 0);
            publish_state(dev, 0x0B04);
            publish_state(dev, 0x0702);
        }
    }
}

/* --- command handling ---------------------------------------------------- */

static void run_command(mqtt_cmd_t *cmd)
{
    if (!zbcoord_is_formed()) {
        return;
    }
    zb_device_t *dev = zbdev_find_node_id(cmd->node);
    if (!dev) {
        ESP_LOGW(TAG, "command for unknown node %s", cmd->node);
        return;
    }

    unsigned ep = 0;
    char kind[12] = {0};
    if (sscanf(cmd->object, "%u-%11s", &ep, kind) != 2) {
        return;
    }

    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        return;
    }

    if (strcmp(kind, "onoff") == 0 && dev->has_onoff) {
        int op = -1;
        if (strcmp(cmd->payload, "ON") == 0 || strcmp(cmd->payload, "on") == 0) {
            op = ZB_ONOFF_ON;
        } else if (strcmp(cmd->payload, "OFF") == 0 || strcmp(cmd->payload, "off") == 0) {
            op = ZB_ONOFF_OFF;
        } else if (strcmp(cmd->payload, "TOGGLE") == 0 || strcmp(cmd->payload, "toggle") == 0) {
            op = ZB_ONOFF_TOGGLE;
        }
        if (op >= 0) {
            if (zbzcl_onoff(dev->nwk, (uint8_t)ep, op) == ESP_OK) {
                /* Ask the device what it actually did. */
                static const uint16_t attrs[] = {0x0000};
                if (zbzcl_read_attr(reply, dev->nwk, (uint8_t)ep, 0x0006, attrs, 1) == ESP_OK) {
                    for (int i = 0; i < reply->value_count; i++) {
                        if (reply->values[i].attr == 0x0000) {
                            zbdev_note_attr(dev, 0x0006, 0x0000, reply->values[i].type,
                                            reply->values[i].data);
                        }
                    }
                }
                publish_state(dev, 0x0006);
            }
        }
    } else if (strcmp(kind, "level") == 0) {
        int level = atoi(cmd->payload);
        if (level >= 0 && level <= 254) {
            if (zbzcl_level(dev->nwk, (uint8_t)ep, (uint8_t)level, 0) == ESP_OK) {
                dev->level = (uint8_t)level;
            }
        }
    }

    zbreq_release(reply);
}

static void cmd_task(void *arg)
{
    mqtt_cmd_t cmd;
    for (;;) {
        if (xQueueReceive(s_cmd_q, &cmd, portMAX_DELAY) == pdTRUE) {
            run_command(&cmd);
        }
    }
}

/* --- client ------------------------------------------------------------- */

static void handle_data(esp_mqtt_event_handle_t event)
{
    if (event->data_len <= 0 || event->topic_len <= 0) {
        return;
    }

    char topic[160];
    size_t tlen = (size_t)event->topic_len;
    if (tlen >= sizeof(topic)) {
        tlen = sizeof(topic) - 1;
    }
    memcpy(topic, event->topic, tlen);
    topic[tlen] = '\0';

    /* netsocket/dev/<node>/<object>/set */
    char *parts[6] = {0};
    int n = 0;
    char *save = NULL;
    for (char *p = strtok_r(topic, "/", &save); p && n < 6; p = strtok_r(NULL, "/", &save)) {
        parts[n++] = p;
    }
    if (n < 5 || strcmp(parts[n - 1], "set") != 0) {
        return;
    }

    mqtt_cmd_t cmd;
    memset(&cmd, 0, sizeof(cmd));
    snprintf(cmd.node, sizeof(cmd.node), "%s", parts[2]);
    snprintf(cmd.object, sizeof(cmd.object), "%s", parts[3]);
    size_t plen = (size_t)event->data_len;
    if (plen >= sizeof(cmd.payload)) {
        plen = sizeof(cmd.payload) - 1;
    }
    memcpy(cmd.payload, event->data, plen);
    cmd.payload[plen] = '\0';

    if (s_cmd_q) {
        xQueueSend(s_cmd_q, &cmd, 0);
    }
}

static void mqtt_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    esp_mqtt_event_handle_t event = data;

    switch ((esp_mqtt_event_id_t)id) {
    case MQTT_EVENT_CONNECTED:
        s_connected = true;
        ESP_LOGI(TAG, "connected to broker");
        console_write_line("EVT mqtt connected");
        mqtt_publish_all();
        for (int i = 1; i <= ZB_MAX_DEVICES; i++) {
            zb_device_t *dev = zbdev_get(i);
            if (!dev || !dev->has_onoff) {
                continue;
            }
            char node[24];
            char topic[96];
            zbdev_node_id(dev, node, sizeof(node));
            snprintf(topic, sizeof(topic), "netsocket/dev/%s/+/set", node);
            esp_mqtt_client_subscribe(s_client, topic, 1);
        }
        break;

    case MQTT_EVENT_DISCONNECTED:
        s_connected = false;
        console_write_line("EVT mqtt disconnected");
        break;

    case MQTT_EVENT_DATA:
        handle_data(event);
        break;

    case MQTT_EVENT_ERROR:
        ESP_LOGW(TAG, "transport error");
        break;

    default:
        break;
    }
}

void mqtt_start(void)
{
    if (s_client && !s_stopping) {
        return;
    }
    const app_config_t *cfg = config_get();
    if (!cfg->bridge_enabled) {
        ESP_LOGI(TAG, "bridge disabled in settings");
        return;
    }
    if (!cfg->mqtt_host[0]) {
        ESP_LOGI(TAG, "no broker configured");
        return;
    }

    if (!s_cmd_q) {
        s_cmd_q = xQueueCreate(MQTT_CMD_QUEUE_LEN, sizeof(mqtt_cmd_t));
        xTaskCreate(cmd_task, "mqtt_cmd", 4096, NULL, 3, NULL);
    }

    static char uri[128];
    snprintf(uri, sizeof(uri), "%s://%s:%u", cfg->mqtt_tls ? "mqtts" : "mqtt",
             cfg->mqtt_host, cfg->mqtt_port);

    esp_mqtt_client_config_t mqtt_cfg;
    memset(&mqtt_cfg, 0, sizeof(mqtt_cfg));
    mqtt_cfg.broker.address.uri = uri;
    if (cfg->mqtt_user[0]) {
        mqtt_cfg.credentials.username = cfg->mqtt_user;
        mqtt_cfg.credentials.authentication.password = cfg->mqtt_pass;
    }
    mqtt_cfg.session.keepalive = 30;
    mqtt_cfg.network.reconnect_timeout_ms = 5000;

    s_client = esp_mqtt_client_init(&mqtt_cfg);
    if (!s_client) {
        ESP_LOGE(TAG, "client init failed");
        return;
    }
    esp_mqtt_client_register_event(s_client, ESP_EVENT_ANY_ID, mqtt_event_handler, NULL);
    esp_mqtt_client_start(s_client);
    s_stopping = false;
    ESP_LOGI(TAG, "connecting to %s", uri);
}

void mqtt_stop(void)
{
    if (!s_client) {
        return;
    }
    s_stopping = true;
    s_connected = false;
    esp_mqtt_client_stop(s_client);
    esp_mqtt_client_destroy(s_client);
    s_client = NULL;
}

bool mqtt_connected(void)
{
    return s_connected;
}

const char *mqtt_state_str(void)
{
    if (!s_client) {
        return "off";
    }
    return s_connected ? "connected" : "connecting";
}

void mqtt_on_zigbee_event(zb_evt_t evt, zb_device_t *dev, uint16_t cluster)
{
    if (!s_connected || !dev) {
        return;
    }

    switch (evt) {
    case ZB_EVT_JOINED:
        publish_availability(dev, true);
        break;

    case ZB_EVT_INTERVIEWED:
        publish_availability(dev, true);
        publish_discovery(dev);
        publish_state(dev, 0);
        publish_state(dev, 0x0B04);
        publish_state(dev, 0x0702);
        if (dev->has_onoff) {
            char node[24];
            char topic[96];
            zbdev_node_id(dev, node, sizeof(node));
            snprintf(topic, sizeof(topic), "netsocket/dev/%s/+/set", node);
            esp_mqtt_client_subscribe(s_client, topic, 1);
        }
        break;

    case ZB_EVT_LEFT:
        publish_availability(dev, false);
        break;

    case ZB_EVT_REPORT:
        publish_availability(dev, true);
        publish_state(dev, cluster);
        break;

    default:
        break;
    }
}
