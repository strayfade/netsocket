#include "console.h"

#include <stdarg.h>
#include <stdio.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "sdkconfig.h"

#if CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG
#include "driver/usb_serial_jtag_vfs.h"
#endif

static SemaphoreHandle_t s_tx_lock;

void console_init(void)
{
    if (!s_tx_lock) {
        s_tx_lock = xSemaphoreCreateMutex();
    }

    /* Unbuffered so a command reply is never stuck behind stdio buffering. */
    setvbuf(stdin, NULL, _IONBF, 0);
    setvbuf(stdout, NULL, _IONBF, 0);

#if CONFIG_ESP_CONSOLE_USB_SERIAL_JTAG
    /* The protocol is line based; do not translate CR/LF on either side. */
    usb_serial_jtag_vfs_set_rx_line_endings(ESP_LINE_ENDINGS_LF);
    usb_serial_jtag_vfs_set_tx_line_endings(ESP_LINE_ENDINGS_LF);
#endif
}

int console_readline(char *buf, size_t len)
{
    if (!buf || len == 0) {
        return -1;
    }

    if (!fgets(buf, (int)len, stdin)) {
        return -1;
    }

    size_t n = strlen(buf);
    while (n > 0 && (buf[n - 1] == '\n' || buf[n - 1] == '\r')) {
        buf[--n] = '\0';
    }
    return (int)n;
}

void console_write_line(const char *line)
{
    if (s_tx_lock) {
        xSemaphoreTake(s_tx_lock, portMAX_DELAY);
    }
    fputs(line ? line : "", stdout);
    fputc('\n', stdout);
    if (s_tx_lock) {
        xSemaphoreGive(s_tx_lock);
    }
}

void console_printf(const char *fmt, ...)
{
    char buf[512];
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf), fmt, ap);
    va_end(ap);
    console_write_line(buf);
}
