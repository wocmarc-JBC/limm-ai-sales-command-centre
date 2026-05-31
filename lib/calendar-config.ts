export function envFlag(name: string, fallback = false) {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  return value.toLowerCase() === "true";
}

export function getCalendarRuntime() {
  const bookingEnabled = envFlag("CALENDAR_BOOKING_ENABLED", false);
  const bossApprovalRequired = envFlag("CALENDAR_BOSS_APPROVAL_REQUIRED", true);
  const autoBookingEnabled = envFlag("CALENDAR_AUTO_BOOKING_ENABLED", false);
  const googleCalendarConnected = envFlag("GOOGLE_CALENDAR_CONNECTED", false);
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? "";
  const timezone = process.env.GOOGLE_CALENDAR_TIMEZONE || "Asia/Singapore";

  return {
    bookingEnabled,
    bossApprovalRequired,
    autoBookingEnabled,
    googleCalendarConnected,
    calendarIdConfigured: Boolean(calendarId),
    timezone,
    hasCalendarTimezone: Boolean(timezone),
    liveBookingAvailable: bookingEnabled && googleCalendarConnected && Boolean(calendarId),
    status: !bookingEnabled
      ? "disabled" as const
      : !googleCalendarConnected
        ? "connection_missing" as const
        : autoBookingEnabled
          ? "auto_booking_requested" as const
          : "boss_approval_required" as const
  };
}
