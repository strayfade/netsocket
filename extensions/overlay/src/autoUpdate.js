// Quiet-hours scheduling for silent overlay self-updates.
//
// The Rust side (`updater_check_now`) does the check → download → install;
// this module only decides *when* it may run: between 01:00 and 05:00
// local time, while the overlay is fully hidden and no response is
// pending, so an install/restart is never noticed.

export const QUIET_HOUR_START = 1;
export const QUIET_HOUR_END = 5;

export const AUTO_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

export const isQuietHour = (date = new Date()) => {
  const hour = date.getHours();
  return hour >= QUIET_HOUR_START && hour < QUIET_HOUR_END;
};

/**
 * @param {{ enabled: boolean, phase: string, awaitingResponse: boolean, date?: Date }} args
 */
export const shouldAutoUpdateNow = ({ enabled, phase, awaitingResponse, date }) => {
  if (!enabled) return false;
  if (phase !== "hidden") return false;
  if (awaitingResponse) return false;
  return isQuietHour(date ?? new Date());
};
