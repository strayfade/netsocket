/*
 * Serial console for the line protocol.
 *
 * The XIAO ESP32-C6 exposes no UART bridge: the only USB port is the C6's
 * native USB-Serial-JTAG, so `sdkconfig.defaults` selects it as the console.
 * We then talk to it through the VFS layer (stdin/stdout), which is the
 * documented path and keeps ESP_LOG output on the same port.
 */
#pragma once

#include <stddef.h>

void console_init(void);

/*
 * Read one line (without the trailing CR/LF) into `buf`.
 * Returns the length, or -1 when nothing is available yet / on error.
 * Blocking: callers run it from a dedicated low-priority task.
 */
int console_readline(char *buf, size_t len);

/* Thread-safe line output; appends a newline. */
void console_write_line(const char *line);

void console_printf(const char *fmt, ...) __attribute__((format(printf, 1, 2)));
