#include "cli.h"

#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "config.h"
#include "console.h"
#include "esp_log.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "mqtt_bridge.h"
#include "wifi_bridge.h"
#include "zb_coordinator.h"
#include "zb_devices.h"
#include "zb_zcl.h"

#define ZBCOORD_VERSION "1.0.0"
#define CLI_MAX_ARGS 10
#define CLI_LINE_MAX 256

static const char *TAG = "cli";

typedef int (*cli_fn_t)(int argc, char **argv);

typedef struct {
    const char *name;
    cli_fn_t fn;
    const char *usage;
    const char *help;
} cli_cmd_t;

/* --- output -------------------------------------------------------------- */

static void reply_ok(const char *fmt, ...)
{
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    console_printf("OK %s", buf);
}

static void reply_err(const char *fmt, ...)
{
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    console_printf("ERR %s", buf);
}

static void reply_info(const char *fmt, ...)
{
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    console_printf("INFO %s", buf);
}

/* Guards every command that talks to the radio: the stack needs a formed
 * network before its lock and APIs are usable. */
static bool require_formed(void)
{
    if (!zbcoord_is_formed()) {
        reply_err("zigbee network is not formed yet (wait for formation)");
        return false;
    }
    return true;
}

/* --- parsing ------------------------------------------------------------- */

static bool parse_u32(const char *s, uint32_t *out)
{
    if (!s || !*s) {
        return false;
    }
    char *end = NULL;
    unsigned long v;
    if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) {
        v = strtoul(s + 2, &end, 16);
    } else {
        v = strtoul(s, &end, 10);
    }
    if (end == s || (end && *end != '\0')) {
        return false;
    }
    *out = (uint32_t)v;
    return true;
}

static int parse_hex_digit(char c)
{
    if (c >= '0' && c <= '9') {
        return c - '0';
    }
    if (c >= 'a' && c <= 'f') {
        return c - 'a' + 10;
    }
    if (c >= 'A' && c <= 'F') {
        return c - 'A' + 10;
    }
    return -1;
}

/* Selects a device by index, NWK address, IEEE address or label. */
static zb_device_t *resolve_device(const char *tok)
{
    if (!tok || !*tok) {
        return NULL;
    }

    if (strncmp(tok, "ieee:", 5) == 0) {
        uint8_t bytes[8];
        int idx = 0;
        int hi = -1;
        for (const char *p = tok + 5; *p; p++) {
            if (*p == ':' || *p == '-') {
                continue;
            }
            int v = parse_hex_digit(*p);
            if (v < 0) {
                return NULL;
            }
            if (hi < 0) {
                hi = v;
            } else {
                if (idx >= 8) {
                    return NULL;
                }
                bytes[idx++] = (uint8_t)((hi << 4) | v);
                hi = -1;
            }
        }
        if (idx != 8 || hi >= 0) {
            return NULL;
        }
        ezb_extaddr_t ieee;
        for (int i = 0; i < 8; i++) {
            ieee.u8[i] = bytes[7 - i];
        }
        return zbdev_find_ieee(&ieee);
    }

    if (strncmp(tok, "nwk:", 4) == 0) {
        uint32_t v;
        return parse_u32(tok + 4, &v) ? zbdev_find_nwk((uint16_t)v) : NULL;
    }

    if (tok[0] == '0' && (tok[1] == 'x' || tok[1] == 'X')) {
        uint32_t v;
        return parse_u32(tok, &v) ? zbdev_find_nwk((uint16_t)v) : NULL;
    }

    uint32_t v;
    if (parse_u32(tok, &v)) {
        zb_device_t *dev = zbdev_get((int)v);
        if (dev) {
            return dev;
        }
        return zbdev_find_nwk((uint16_t)v);
    }

    for (int i = 1; i <= ZB_MAX_DEVICES; i++) {
        zb_device_t *dev = zbdev_get(i);
        if (dev && dev->label[0] && strcmp(dev->label, tok) == 0) {
            return dev;
        }
    }
    return NULL;
}

static uint8_t ep_or_default(const zb_device_t *dev, const char *tok)
{
    uint32_t v;
    if (tok && parse_u32(tok, &v) && v >= 1 && v <= 240) {
        return (uint8_t)v;
    }
    return dev && dev->ep_count ? dev->eps[0] : 1;
}

/* --- attribute type helpers --------------------------------------------- */

static bool parse_attr_type(const char *s, uint8_t *out)
{
    struct {
        const char *name;
        uint8_t type;
    } table[] = {
        {"bool", EZB_ZCL_ATTR_TYPE_BOOL},
        {"u8", EZB_ZCL_ATTR_TYPE_UINT8},
        {"u16", EZB_ZCL_ATTR_TYPE_UINT16},
        {"u24", EZB_ZCL_ATTR_TYPE_UINT24},
        {"u32", EZB_ZCL_ATTR_TYPE_UINT32},
        {"s8", EZB_ZCL_ATTR_TYPE_INT8},
        {"s16", EZB_ZCL_ATTR_TYPE_INT16},
        {"s32", EZB_ZCL_ATTR_TYPE_INT32},
        {"enum8", EZB_ZCL_ATTR_TYPE_ENUM8},
        {"enum16", EZB_ZCL_ATTR_TYPE_ENUM16},
        {"string", EZB_ZCL_ATTR_TYPE_STRING},
        {"octstr", EZB_ZCL_ATTR_TYPE_OCTSTR},
    };

    for (size_t i = 0; i < sizeof(table) / sizeof(table[0]); i++) {
        if (strcmp(s, table[i].name) == 0) {
            *out = table[i].type;
            return true;
        }
    }

    uint32_t raw;
    if (parse_u32(s, &raw) && raw <= 0xFF) {
        *out = (uint8_t)raw;
        return true;
    }
    return false;
}

static bool encode_value(uint8_t type, const char *text, uint8_t *buf, size_t buf_len, uint16_t *out_size)
{
    int size = zbzcl_type_size(type);

    if (type == EZB_ZCL_ATTR_TYPE_STRING || type == EZB_ZCL_ATTR_TYPE_OCTSTR) {
        size_t len = strlen(text);
        if (len > buf_len - 1 || len > 254) {
            return false;
        }
        buf[0] = (uint8_t)len;
        memcpy(buf + 1, text, len);
        *out_size = (uint16_t)(len + 1);
        return true;
    }

    if (size <= 0 || (size_t)size > buf_len) {
        return false;
    }

    uint32_t v;
    if (!parse_u32(text, &v)) {
        return false;
    }
    for (int i = 0; i < size; i++) {
        buf[i] = (uint8_t)(v >> (8 * i));
    }
    *out_size = (uint16_t)size;
    return true;
}

/* --- commands ------------------------------------------------------------ */

static int cmd_help(int argc, char **argv);

static const cli_cmd_t s_cmds[] = {
    {"help", cmd_help, "help [command]", "List commands, or explain one."},
    {"status", NULL, "status", "Coordinator, network, WiFi and MQTT state."},
    {"net", NULL, "net info|form [ch]|permit <s|off>|reset", "Network lifecycle."},
    {"dev", NULL, "dev list|info|desc|interview|remove|rename", "Device registry."},
    {"on", NULL, "on <sel> [ep]", "Turn a device on."},
    {"off", NULL, "off <sel> [ep]", "Turn a device off."},
    {"toggle", NULL, "toggle <sel> [ep]", "Toggle a device."},
    {"level", NULL, "level <sel> <0-254> [ep]", "Set level."},
    {"read", NULL, "read <sel> <ep> <cluster> <attr>[,<attr>...]", "ZCL read attributes."},
    {"write", NULL, "write <sel> <ep> <cluster> <attr> <type> <value>", "ZCL write attribute."},
    {"report", NULL, "report <sel> <ep> <cluster> <attr> <min> <max>", "Configure reporting."},
    {"bind", NULL, "bind <sel> <ep> <cluster>", "Bind device cluster to us."},
    {"identify", NULL, "identify <sel> [seconds]", "Ask the device to blink."},
    {"ping", NULL, "ping <sel>", "Link quality from the neighbour table."},
    {"wifi", NULL, "wifi set <ssid> <pass>|status|clear", "Wi-Fi credentials."},
    {"mqtt", NULL, "mqtt set <host> [port] [user] [pass]|status", "Broker settings."},
    {"bridge", NULL, "bridge on|off", "Enable/disable the MQTT bridge."},
    {"log", NULL, "log <0-4>", "ESP log verbosity."},
    {"save", NULL, "save", "Persist settings and the device table."},
    {"reboot", NULL, "reboot", "Restart the board."},
    {"factory", NULL, "factory", "Wipe settings + Zigbee network, reboot."},
};

static const cli_cmd_t *find_cmd(const char *name)
{
    for (size_t i = 0; i < sizeof(s_cmds) / sizeof(s_cmds[0]); i++) {
        if (strcmp(s_cmds[i].name, name) == 0) {
            return &s_cmds[i];
        }
    }
    return NULL;
}

static int cmd_help(int argc, char **argv)
{
    if (argc > 1) {
        const cli_cmd_t *cmd = find_cmd(argv[1]);
        if (!cmd) {
            reply_err("unknown command \"%s\"", argv[1]);
            return 1;
        }
        reply_info("%s", cmd->usage);
        reply_ok("%s", cmd->help);
        return 0;
    }
    for (size_t i = 0; i < sizeof(s_cmds) / sizeof(s_cmds[0]); i++) {
        reply_info("%s", s_cmds[i].usage);
    }
    reply_ok("selector: <idx> | 0xNNNN | ieee:... | label");
    return 0;
}

static int cmd_status(int argc, char **argv)
{
    zbcoord_net_t net;
    zbcoord_net_info(&net);
    const app_config_t *cfg = config_get();

    reply_ok("version=%s zigbee=%s panid=0x%04x channel=%u short=0x%04x permit=%us devices=%u "
             "wifi=%s rssi=%d mqtt=%s bridge=%s",
             ZBCOORD_VERSION, net.formed ? "formed" : "idle", net.panid, net.channel,
             net.short_addr, net.permit_remaining, net.device_count, wifi_state_str(),
             wifi_rssi(), mqtt_state_str(), cfg->bridge_enabled ? "on" : "off");
    return 0;
}

static int cmd_net(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: net info|form [channel]|permit <seconds|off>|reset");
        return 1;
    }

    if (strcmp(argv[1], "info") == 0) {
        zbcoord_net_t net;
        zbcoord_net_info(&net);
        char extpan[24];
        char ieee[24];
        zbdev_ieee_str(&net.ext_pan, extpan, sizeof(extpan));
        zbdev_ieee_str(&net.ieee, ieee, sizeof(ieee));
        reply_info("panid=0x%04x channel=%u short=0x%04x extpan=%s ieee=%s",
                   net.panid, net.channel, net.short_addr, extpan, ieee);
        reply_info("permit=%us devices=%u formed=%u", net.permit_remaining, net.device_count, net.formed);
        reply_ok("network");
        return 0;
    }

    if (strcmp(argv[1], "form") == 0) {
        uint32_t channel = config_get()->zigbee_channel;
        if (argc > 2 && (!parse_u32(argv[2], &channel) || channel < 11 || channel > 26)) {
            reply_err("channel must be 11..26");
            return 1;
        }
        esp_err_t err = zbcoord_form((uint8_t)channel);
        if (err == ESP_ERR_INVALID_STATE) {
            reply_err("network already formed; run 'net reset' first");
            return 1;
        }
        if (err != ESP_OK) {
            reply_err("formation failed: %s", esp_err_to_name(err));
            return 1;
        }
        reply_ok("forming on channel %u", (unsigned)channel);
        return 0;
    }

    if (strcmp(argv[1], "permit") == 0) {
        if (argc < 3) {
            reply_err("usage: net permit <seconds|off>");
            return 1;
        }
        uint8_t seconds = 0;
        if (strcmp(argv[2], "off") != 0) {
            uint32_t v;
            if (!parse_u32(argv[2], &v) || v > 254) {
                reply_err("seconds must be 1..254, or 'off'");
                return 1;
            }
            seconds = (uint8_t)v;
        }
        if (zbcoord_permit(seconds) != ESP_OK) {
            reply_err("permit-join failed");
            return 1;
        }
        reply_ok("permit %s", seconds ? "open" : "closed");
        return 0;
    }

    if (strcmp(argv[1], "reset") == 0) {
        zbcoord_factory_reset(); /* does not return */
        return 0;
    }

    reply_err("unknown net subcommand \"%s\"", argv[1]);
    return 1;
}

static void print_device_line(const zb_device_t *dev, int index)
{
    char ieee[24];
    zbdev_ieee_str(&dev->ieee, ieee, sizeof(ieee));
    console_printf("DEV idx=%d nwk=0x%04x ieee=%s label=\"%s\" model=\"%s\" online=%u interviewed=%u "
                   "onoff=%u power=%u energy=%u",
                   index, dev->nwk, ieee, dev->label, dev->model, dev->online, dev->interviewed,
                   dev->has_onoff, dev->has_power, dev->has_energy);
}

static int cmd_dev(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: dev list|info|desc|interview|remove|rename");
        return 1;
    }

    if (strcmp(argv[1], "list") == 0) {
        int count = 0;
        for (int i = 1; i <= ZB_MAX_DEVICES; i++) {
            zb_device_t *dev = zbdev_get(i);
            if (dev) {
                print_device_line(dev, i);
                count++;
            }
        }
        reply_ok("count=%d", count);
        return 0;
    }

    if (argc < 3) {
        reply_err("missing device selector");
        return 1;
    }

    zb_device_t *dev = resolve_device(argv[2]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[2]);
        return 1;
    }

    if (strcmp(argv[1], "info") == 0) {
        char ieee[24];
        zbdev_ieee_str(&dev->ieee, ieee, sizeof(ieee));
        reply_info("nwk=0x%04x ieee=%s type=%s capability=0x%02x",
                   dev->nwk, ieee, (dev->capability & 0x02) ? "router" : "end-device", dev->capability);
        reply_info("label=\"%s\" manufacturer=\"%s\" model=\"%s\"",
                   dev->label, dev->manufacturer, dev->model);
        reply_info("online=%u interviewed=%u last_seen=%us", dev->online, dev->interviewed,
                   dev->last_seen);
        for (int e = 0; e < dev->ep_count; e++) {
            char clusters[160];
            size_t pos = 0;
            clusters[0] = '\0';
            for (int c = 0; c < dev->in_count[e]; c++) {
                pos += (size_t)snprintf(clusters + pos, sizeof(clusters) - pos, "%s0x%04x",
                                        c ? "," : "", dev->in_clusters[e][c]);
            }
            reply_info("ep=%u in=%s", dev->eps[e], clusters);
        }
        reply_ok("device");
        return 0;
    }

    if (strcmp(argv[1], "desc") == 0) {
        if (!require_formed()) {
            return 1;
        }
        uint8_t only_ep = 0;
        if (argc > 3) {
            uint32_t v;
            if (parse_u32(argv[3], &v)) {
                only_ep = (uint8_t)v;
            }
        }
        zb_reply_t *reply = zbreq_alloc();
        if (!reply) {
            reply_err("busy");
            return 1;
        }
        int eps = dev->ep_count ? dev->ep_count : 1;
        for (int e = 0; e < eps; e++) {
            uint8_t ep = dev->ep_count ? dev->eps[e] : 1;
            if (only_ep && ep != only_ep) {
                continue;
            }
            if (zbzdo_simple_desc(reply, dev->nwk, ep) == ESP_OK) {
                reply_info("%s", reply->text);
            } else {
                reply_info("ep=%u %s", ep, reply->text);
            }
        }
        zbreq_release(reply);
        reply_ok("descriptors");
        return 0;
    }

    if (strcmp(argv[1], "interview") == 0) {
        if (!require_formed()) {
            return 1;
        }
        dev->interviewed = false;
        zbcoord_interview(dev);
        reply_ok("interview queued for nwk=0x%04x", dev->nwk);
        return 0;
    }

    if (strcmp(argv[1], "remove") == 0) {
        if (!require_formed()) {
            return 1;
        }
        uint16_t nwk = dev->nwk;
        zbzdo_leave(nwk);
        zbdev_remove_by_nwk(nwk);
        zbdev_save();
        mqtt_publish_all();
        reply_ok("removed nwk=0x%04x", nwk);
        return 0;
    }

    if (strcmp(argv[1], "rename") == 0) {
        if (argc < 4) {
            reply_err("usage: dev rename <sel> <name>");
            return 1;
        }
        strncpy(dev->label, argv[3], sizeof(dev->label) - 1);
        dev->label[sizeof(dev->label) - 1] = '\0';
        zbdev_save();
        mqtt_publish_all();
        reply_ok("label \"%s\"", dev->label);
        return 0;
    }

    reply_err("unknown dev subcommand \"%s\"", argv[1]);
    return 1;
}

static int cmd_onoff(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: %s <sel> [ep]", argv[0]);
        return 1;
    }
    zb_device_t *dev = resolve_device(argv[1]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[1]);
        return 1;
    }
    if (!require_formed()) {
        return 1;
    }
    uint8_t ep = ep_or_default(dev, argc > 2 ? argv[2] : NULL);

    int op = ZB_ONOFF_OFF;
    if (strcmp(argv[0], "on") == 0) {
        op = ZB_ONOFF_ON;
    } else if (strcmp(argv[0], "toggle") == 0) {
        op = ZB_ONOFF_TOGGLE;
    }

    if (zbzcl_onoff(dev->nwk, ep, op) != ESP_OK) {
        reply_err("command not accepted");
        return 1;
    }

    /* Report the device's own view of the attribute. */
    zb_reply_t *reply = zbreq_alloc();
    if (reply && zbzcl_refresh_onoff(reply, dev->nwk, ep) == ESP_OK) {
        bool known = false;
        for (int i = 0; i < reply->value_count; i++) {
            if (reply->values[i].attr == 0x0000) {
                bool on = (reply->values[i].data[0] & 0x01) != 0;
                zbdev_note_onoff(dev, on);
                reply_ok("on=%u", on ? 1 : 0);
                known = true;
            }
        }
        if (!known) {
            reply_ok("sent (no state in response: %s)", reply->text);
        }
    } else {
        reply_ok("sent (state unknown)");
    }
    zbreq_release(reply);
    return 0;
}

static int cmd_level(int argc, char **argv)
{
    if (argc < 3) {
        reply_err("usage: level <sel> <0-254> [ep]");
        return 1;
    }
    zb_device_t *dev = resolve_device(argv[1]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[1]);
        return 1;
    }
    uint32_t level;
    if (!parse_u32(argv[2], &level) || level > 254) {
        reply_err("level must be 0..254");
        return 1;
    }
    if (!require_formed()) {
        return 1;
    }
    uint8_t ep = ep_or_default(dev, argc > 3 ? argv[3] : NULL);
    if (zbzcl_level(dev->nwk, ep, (uint8_t)level, 0) != ESP_OK) {
        reply_err("command not accepted");
        return 1;
    }
    dev->level = (uint8_t)level;
    reply_ok("level=%u", (unsigned)level);
    return 0;
}

static int cmd_read(int argc, char **argv)
{
    if (argc < 5) {
        reply_err("usage: read <sel> <ep> <cluster> <attr>[,<attr>...]");
        return 1;
    }
    zb_device_t *dev = resolve_device(argv[1]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[1]);
        return 1;
    }

    uint32_t ep, cluster;
    if (!parse_u32(argv[2], &ep) || !parse_u32(argv[3], &cluster)) {
        reply_err("bad endpoint or cluster");
        return 1;
    }
    if (!require_formed()) {
        return 1;
    }

    uint16_t attrs[8];
    uint8_t attr_count = 0;
    char *save = NULL;
    for (char *tok = strtok_r(argv[4], ",", &save); tok && attr_count < 8;
         tok = strtok_r(NULL, ",", &save)) {
        uint32_t attr;
        if (!parse_u32(tok, &attr)) {
            reply_err("bad attribute \"%s\"", tok);
            return 1;
        }
        attrs[attr_count++] = (uint16_t)attr;
    }
    if (attr_count == 0) {
        reply_err("no attributes");
        return 1;
    }

    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        reply_err("busy");
        return 1;
    }
    esp_err_t err = zbzcl_read_attr(reply, dev->nwk, (uint8_t)ep, (uint16_t)cluster, attrs, attr_count);
    if (err == ESP_OK) {
        for (int i = 0; i < reply->value_count; i++) {
            zbdev_note_attr(dev, (uint16_t)cluster, reply->values[i].attr, reply->values[i].type,
                            reply->values[i].data);
        }
        reply_ok("%s", reply->text);
    } else {
        reply_err("%s", reply->text);
    }
    zbreq_release(reply);
    return err == ESP_OK ? 0 : 1;
}

static int cmd_write(int argc, char **argv)
{
    if (argc < 7) {
        reply_err("usage: write <sel> <ep> <cluster> <attr> <type> <value>");
        return 1;
    }
    zb_device_t *dev = resolve_device(argv[1]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[1]);
        return 1;
    }

    uint32_t ep, cluster, attr;
    if (!parse_u32(argv[2], &ep) || !parse_u32(argv[3], &cluster) || !parse_u32(argv[4], &attr)) {
        reply_err("bad endpoint, cluster or attribute");
        return 1;
    }
    if (!require_formed()) {
        return 1;
    }

    uint8_t type;
    if (!parse_attr_type(argv[5], &type)) {
        reply_err("unknown type \"%s\"", argv[5]);
        return 1;
    }

    uint8_t value[64];
    uint16_t size = 0;
    if (!encode_value(type, argv[6], value, sizeof(value), &size)) {
        reply_err("value does not fit type");
        return 1;
    }

    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        reply_err("busy");
        return 1;
    }
    esp_err_t err = zbzcl_write_attr(reply, dev->nwk, (uint8_t)ep, (uint16_t)cluster, (uint16_t)attr,
                                     type, value, size);
    if (err == ESP_OK) {
        reply_ok("%s", reply->text);
    } else {
        reply_err("%s", reply->text);
    }
    zbreq_release(reply);
    return err == ESP_OK ? 0 : 1;
}

static int cmd_report(int argc, char **argv)
{
    if (argc < 7) {
        reply_err("usage: report <sel> <ep> <cluster> <attr> <min> <max>");
        return 1;
    }
    zb_device_t *dev = resolve_device(argv[1]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[1]);
        return 1;
    }

    uint32_t ep, cluster, attr, min_s, max_s;
    if (!parse_u32(argv[2], &ep) || !parse_u32(argv[3], &cluster) || !parse_u32(argv[4], &attr) ||
        !parse_u32(argv[5], &min_s) || !parse_u32(argv[6], &max_s)) {
        reply_err("bad numeric argument");
        return 1;
    }
    if (!require_formed()) {
        return 1;
    }

    /* Guess the attribute type from the cluster so the caller does not have to
     * repeat it: the common cases are what this firmware auto-configures. */
    uint8_t type = EZB_ZCL_ATTR_TYPE_UINT8;
    if (cluster == 0x0006) {
        type = EZB_ZCL_ATTR_TYPE_BOOL;
    } else if (cluster == 0x0B04 && attr == 0x050B) {
        type = EZB_ZCL_ATTR_TYPE_INT16;
    } else if (cluster == 0x0702 && attr == 0x0300) {
        type = EZB_ZCL_ATTR_TYPE_UINT48;
    } else if (cluster == 0x0006 && attr != 0x0000) {
        type = EZB_ZCL_ATTR_TYPE_UINT8;
    }

    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        reply_err("busy");
        return 1;
    }
    esp_err_t err = zbzcl_config_report(reply, dev->nwk, (uint8_t)ep, (uint16_t)cluster,
                                        (uint16_t)attr, type, (uint16_t)min_s, (uint16_t)max_s);
    if (err == ESP_OK) {
        reply_ok("%s", reply->text);
    } else {
        reply_err("%s", reply->text);
    }
    zbreq_release(reply);
    return err == ESP_OK ? 0 : 1;
}

static int cmd_bind(int argc, char **argv)
{
    if (argc < 5) {
        reply_err("usage: bind <sel> <ep> <cluster>");
        return 1;
    }
    zb_device_t *dev = resolve_device(argv[1]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[1]);
        return 1;
    }
    uint32_t ep, cluster;
    if (!parse_u32(argv[2], &ep) || !parse_u32(argv[3], &cluster)) {
        reply_err("bad endpoint or cluster");
        return 1;
    }
    if (!require_formed()) {
        return 1;
    }

    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        reply_err("busy");
        return 1;
    }
    esp_err_t err = zbzdo_bind(reply, dev->nwk, (uint8_t)ep, (uint16_t)cluster);
    if (err == ESP_OK) {
        reply_ok("%s", reply->text);
    } else {
        reply_err("%s", reply->text);
    }
    zbreq_release(reply);
    return err == ESP_OK ? 0 : 1;
}

static int cmd_identify(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: identify <sel> [seconds]");
        return 1;
    }
    zb_device_t *dev = resolve_device(argv[1]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[1]);
        return 1;
    }
    uint32_t seconds = 5;
    if (argc > 2 && !parse_u32(argv[2], &seconds)) {
        reply_err("bad seconds");
        return 1;
    }
    if (!require_formed()) {
        return 1;
    }
    if (zbzcl_identify(dev->nwk, ep_or_default(dev, NULL), (uint16_t)seconds) == ESP_OK) {
        reply_ok("identifying for %us", (unsigned)seconds);
        return 0;
    }
    reply_err("command not accepted");
    return 1;
}

static int cmd_ping(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: ping <sel>");
        return 1;
    }
    zb_device_t *dev = resolve_device(argv[1]);
    if (!dev) {
        reply_err("unknown device \"%s\"", argv[1]);
        return 1;
    }
    if (!require_formed()) {
        return 1;
    }
    zb_reply_t *reply = zbreq_alloc();
    if (!reply) {
        reply_err("busy");
        return 1;
    }
    esp_err_t err = zbzdo_lqi(reply, dev->nwk);    if (err == ESP_OK) {
        reply_ok("%s", reply->text);
    } else {
        reply_err("%s", reply->text);
    }
    zbreq_release(reply);
    return err == ESP_OK ? 0 : 1;
}

static int cmd_wifi(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: wifi set <ssid> <pass>|status|clear");
        return 1;
    }
    if (strcmp(argv[1], "status") == 0) {
        const app_config_t *cfg = config_get();
        reply_ok("state=%s ssid=\"%s\" rssi=%d", wifi_state_str(), cfg->wifi_ssid, wifi_rssi());
        return 0;
    }
    if (strcmp(argv[1], "clear") == 0) {
        wifi_clear();
        reply_ok("credentials cleared");
        return 0;
    }
    if (strcmp(argv[1], "set") == 0) {
        if (argc < 4) {
            reply_err("usage: wifi set <ssid> <pass>");
            return 1;
        }
        if (wifi_connect(argv[2], argv[3]) != ESP_OK) {
            reply_err("could not store/connect");
            return 1;
        }
        reply_ok("connecting to \"%s\"", argv[2]);
        return 0;
    }
    reply_err("unknown wifi subcommand \"%s\"", argv[1]);
    return 1;
}

static int cmd_mqtt(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: mqtt set <host> [port] [user] [pass]|status");
        return 1;
    }
    const app_config_t *cfg = config_get();

    if (strcmp(argv[1], "status") == 0) {
        reply_ok("state=%s host=\"%s\" port=%u user=\"%s\" tls=%u",
                 mqtt_state_str(), cfg->mqtt_host, cfg->mqtt_port, cfg->mqtt_user, cfg->mqtt_tls);
        return 0;
    }

    if (strcmp(argv[1], "set") == 0) {
        if (argc < 3) {
            reply_err("usage: mqtt set <host> [port] [user] [pass]");
            return 1;
        }
        app_config_t *mcfg = config_get();
        strncpy(mcfg->mqtt_host, argv[2], sizeof(mcfg->mqtt_host) - 1);
        mcfg->mqtt_host[sizeof(mcfg->mqtt_host) - 1] = '\0';
        uint32_t port = mcfg->mqtt_port ? mcfg->mqtt_port : 1883;
        if (argc > 3 && strcmp(argv[3], "-") != 0) {
            if (!parse_u32(argv[3], &port) || port == 0 || port > 65535) {
                reply_err("bad port");
                return 1;
            }
        }
        mcfg->mqtt_port = (uint16_t)port;
        if (argc > 4 && strcmp(argv[4], "-") != 0) {
            strncpy(mcfg->mqtt_user, argv[4], sizeof(mcfg->mqtt_user) - 1);
        } else {
            mcfg->mqtt_user[0] = '\0';
        }
        if (argc > 5 && strcmp(argv[5], "-") != 0) {
            strncpy(mcfg->mqtt_pass, argv[5], sizeof(mcfg->mqtt_pass) - 1);
        } else {
            mcfg->mqtt_pass[0] = '\0';
        }
        config_save();
        mqtt_stop();
        if (mcfg->bridge_enabled && wifi_connected()) {
            mqtt_start();
        }
        reply_ok("broker set to %s:%u", mcfg->mqtt_host, mcfg->mqtt_port);
        return 0;
    }

    reply_err("unknown mqtt subcommand \"%s\"", argv[1]);
    return 1;
}

static int cmd_bridge(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: bridge on|off");
        return 1;
    }
    bool enable = strcmp(argv[1], "on") == 0;
    config_get()->bridge_enabled = enable;
    config_save();
    if (enable) {
        if (!wifi_connected()) {
            wifi_start();
        }
        mqtt_start();
    } else {
        mqtt_stop();
    }
    reply_ok("bridge %s", enable ? "on" : "off");
    return 0;
}

static int cmd_log(int argc, char **argv)
{
    if (argc < 2) {
        reply_err("usage: log <0-4>");
        return 1;
    }
    uint32_t level;
    if (!parse_u32(argv[1], &level) || level > 4) {
        reply_err("level must be 0..4");
        return 1;
    }
    static const esp_log_level_t map[] = {ESP_LOG_NONE, ESP_LOG_ERROR, ESP_LOG_WARN,
                                          ESP_LOG_INFO, ESP_LOG_DEBUG};
    esp_log_level_set("*", map[level]);
    reply_ok("log level %u", (unsigned)level);
    return 0;
}

static int cmd_save(int argc, char **argv)
{
    config_save();
    zbdev_save();
    reply_ok("saved");
    return 0;
}

static int cmd_reboot(int argc, char **argv)
{
    console_write_line("OK rebooting");
    vTaskDelay(pdMS_TO_TICKS(200));
    esp_restart();
    return 0;
}

static int cmd_factory(int argc, char **argv)
{
    console_write_line("OK wiping settings and zigbee state");
    zbdev_wipe();
    config_wipe();
    vTaskDelay(pdMS_TO_TICKS(200));
    zbcoord_factory_reset(); /* does not return */
    return 0;
}

/* --- dispatch ------------------------------------------------------------ */

static int tokenize(char *line, char **argv, int max)
{
    int argc = 0;
    char *p = line;
    while (*p && argc < max) {
        while (*p == ' ' || *p == '\t') {
            p++;
        }
        if (!*p) {
            break;
        }
        if (*p == '"') {
            argv[argc++] = ++p;
            while (*p && *p != '"') {
                p++;
            }
            if (*p) {
                *p++ = '\0';
            }
        } else {
            argv[argc++] = p;
            while (*p && *p != ' ' && *p != '\t') {
                p++;
            }
            if (*p) {
                *p++ = '\0';
            }
        }
    }
    return argc;
}

static int dispatch(char *line)
{
    char *argv[CLI_MAX_ARGS];
    int argc = tokenize(line, argv, CLI_MAX_ARGS);
    if (argc == 0) {
        return 0;
    }

    const char *name = argv[0];
    if (strcmp(name, "status") == 0) {
        return cmd_status(argc, argv);
    }
    if (strcmp(name, "net") == 0) {
        return cmd_net(argc, argv);
    }
    if (strcmp(name, "dev") == 0) {
        return cmd_dev(argc, argv);
    }
    if (strcmp(name, "on") == 0 || strcmp(name, "off") == 0 || strcmp(name, "toggle") == 0) {
        return cmd_onoff(argc, argv);
    }
    if (strcmp(name, "level") == 0) {
        return cmd_level(argc, argv);
    }
    if (strcmp(name, "read") == 0) {
        return cmd_read(argc, argv);
    }
    if (strcmp(name, "write") == 0) {
        return cmd_write(argc, argv);
    }
    if (strcmp(name, "report") == 0) {
        return cmd_report(argc, argv);
    }
    if (strcmp(name, "bind") == 0) {
        return cmd_bind(argc, argv);
    }
    if (strcmp(name, "identify") == 0) {
        return cmd_identify(argc, argv);
    }
    if (strcmp(name, "ping") == 0) {
        return cmd_ping(argc, argv);
    }
    if (strcmp(name, "wifi") == 0) {
        return cmd_wifi(argc, argv);
    }
    if (strcmp(name, "mqtt") == 0) {
        return cmd_mqtt(argc, argv);
    }
    if (strcmp(name, "bridge") == 0) {
        return cmd_bridge(argc, argv);
    }
    if (strcmp(name, "log") == 0) {
        return cmd_log(argc, argv);
    }
    if (strcmp(name, "save") == 0) {
        return cmd_save(argc, argv);
    }
    if (strcmp(name, "reboot") == 0) {
        return cmd_reboot(argc, argv);
    }
    if (strcmp(name, "factory") == 0) {
        return cmd_factory(argc, argv);
    }
    if (strcmp(name, "help") == 0) {
        return cmd_help(argc, argv);
    }

    reply_err("unknown command \"%s\" (try help)", name);
    return 1;
}

static void cli_task(void *arg)
{
    char line[CLI_LINE_MAX];

    console_printf("netsocket zigbee coordinator %s", ZBCOORD_VERSION);
    console_write_line("type 'help' for commands");

    for (;;) {
        int n = console_readline(line, sizeof(line));
        if (n < 0) {
            vTaskDelay(pdMS_TO_TICKS(20));
            continue;
        }
        if (n == 0) {
            continue;
        }
        ESP_LOGD(TAG, "cmd: %s", line);
        dispatch(line);
    }
}

void cli_start(void)
{
    xTaskCreate(cli_task, "cli", 6144, NULL, 3, NULL);
}
