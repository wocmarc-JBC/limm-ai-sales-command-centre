import type { OwnerCommand, TimeRange } from "./types";

const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const weekdayPattern = "(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)";
const dayPattern = new RegExp(`\\b(?:\\d{4}-\\d{2}-\\d{2}|today|tomorrow|tmr|tonight|(?:(?:next|this)\\s+)?${weekdayPattern})\\b`, "gi");
const clockPattern = /\b(\d{1,2})(?::([0-5]\d))?\s*(am|pm)\b|\b([01]\d|2[0-3]):([0-5]\d)\b/gi;

export function singaporeDate(now: Date) { return new Date(now.getTime() + OFFSET).toISOString().slice(0, 10); }
export function atSingaporeMinute(date: string, minute: number) {
  return new Date(`${date}T00:00:00+08:00`).getTime() + minute * 60_000;
}
export function minuteInSingapore(time: string) {
  const date = new Date(new Date(time).getTime() + OFFSET);
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}
function iso(time: number) { return new Date(time).toISOString(); }
function range(date: string, start = 0, end = 1440): TimeRange {
  return { start: iso(atSingaporeMinute(date, start)), end: iso(atSingaporeMinute(date, end)) };
}
function clarify(reply: string): OwnerCommand { return { kind: "clarify", reply }; }

export function parseOwnerCommand(raw: string, now: Date, defaultDurationMinutes: number): OwnerCommand {
  const text = raw.trim().replace(/^cc\s*[,.:!-]?\s*/i, "").replace(/\s+/g, " ");
  if (!text || /^(?:help|hi|hello|commands)$/i.test(text)) return { kind: "help", reply: "You can ask me to add an appointment, show your agenda, find a free slot, move or cancel an event, or arrange a meeting with a client. Include the day and a time such as 3pm." };
  if (text.length > 1200) return clarify("Please send one calendar request at a time, with the day and time.");
  if (!Number.isInteger(defaultDurationMinutes) || defaultDurationMinutes < 5 || defaultDurationMinutes > 480) return clarify("Your default appointment duration needs to be configured.");
  if (/\b(?:every|weekly|monthly|repeat|recurring|daily)\b/i.test(text)) return clarify("Recurring appointments need an explicit recurrence setup. What single date and time should I add first?");
  if (/\b(?:UTC|GMT|EST|PST|Zurich|London|New York|timezone|time zone)\b|[+-]\d{2}:\d{2}/i.test(text)) return clarify("What date and time should I use in Singapore time?");
  if (/\b(?:and|then)\s+(?:book|create|add|move|cancel|delete|remind)\b/i.test(text)) return clarify("Please send one calendar action at a time.");
  if ([...text.matchAll(/\b(?:morning|afternoon|evening|tonight)\b/gi)].length > 1) return clarify("Which time window should I use: morning, afternoon or evening?");

  const isMove = /^(?:move|reschedule|change)\b/i.test(text);
  const isCancel = /^(?:cancel|delete|remove)\b/i.test(text);
  const isAgenda = /^(?:what|show|list|check|do i have|my agenda|agenda)\b/i.test(text) && !/\b(?:free|available)\b/i.test(text);
  const isFind = /^(?:find|when|am i free|check.*(?:free|available))\b/i.test(text);
  const isCreate = /^(?:book|add|create|schedule|put|remind)\b/i.test(text);
  if (!(isMove || isCancel || isAgenda || isFind || isCreate)) return clarify("What would you like me to do with your calendar? For example: “Book site meeting with Dini tomorrow 3pm for 1 hour.”");

  const dateMatches = [...text.matchAll(dayPattern)];
  if (dateMatches.length > 1) return clarify("Please specify one date for this request.");
  const today = singaporeDate(now);
  let date: string | undefined;
  if (dateMatches.length) {
    const value = dateMatches[0][0].toLowerCase();
    if (/^\d{4}/.test(value)) {
      if (Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) return clarify("That date is invalid. Please use a date such as 2026-10-06.");
      date = value;
    } else if (/^(today|tonight)$/.test(value)) date = today;
    else if (/^(tomorrow|tmr)$/.test(value)) date = iso(new Date(`${today}T00:00:00Z`).getTime() + DAY).slice(0, 10);
    else {
      const current = new Date(`${today}T00:00:00Z`).getUTCDay();
      const target = weekdays.indexOf(value.split(" ").at(-1)!.slice(0, 3));
      const delta = (target - current + 7) % 7;
      if (value.startsWith("next ") && delta > 0 && target !== 0 && (current === 0 || target > current)) {
        const first = iso(new Date(`${today}T00:00:00Z`).getTime() + delta * DAY).slice(0, 10);
        const second = iso(new Date(`${today}T00:00:00Z`).getTime() + (delta + 7) * DAY).slice(0, 10);
        return clarify(`Do you mean ${first} or ${second}?`);
      }
      const days = value.startsWith("this ") ? target - current : delta || 7;
      date = iso(new Date(`${today}T00:00:00Z`).getTime() + days * DAY).slice(0, 10);
    }
  }
  // Numeric/month-name dates must not accidentally fall back to a relative/default date.
  if (/\b\d{1,2}[/-]\d{1,2}\b|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d|\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i.test(text.replace(/\d{4}-\d{2}-\d{2}/g, ""))) return clarify("Please write the date as YYYY-MM-DD, or use today, tomorrow or a weekday.");

  const clocks = [...text.matchAll(clockPattern)];
  if (clocks.length > (isMove ? 2 : 1)) return clarify("Please specify one start time for this request.");
  const minutes = clocks.map((match) => {
    if (match[4] !== undefined) return Number(match[4]) * 60 + Number(match[5]);
    const hour = Number(match[1]);
    if (hour < 1 || hour > 12) return -1;
    return hour % 12 * 60 + Number(match[2] || 0) + (match[3].toLowerCase() === "pm" ? 720 : 0);
  });
  if (minutes.includes(-1)) return clarify("Please use a valid time, such as 3pm or 15:00.");
  const durationMatches = [...text.matchAll(/\b(?:for\s+)?(\d+(?:\.\d+)?)[\s-]*(hours?|hrs?|minutes?|mins?)\b/gi)];
  if (!durationMatches.length && /\b(?:half|quarter|one|two|three|four|five|six|seven|eight|an?|\d+)\s*(?:-\s*)?(?:hours?|hrs?|minutes?|mins?)\b/i.test(text)) return clarify("Please write the duration as a number, such as 30 minutes or 2 hours.");
  if (durationMatches.length > 1) return clarify("What single duration should I use?");
  const suppliedDuration = durationMatches.length ? Number(durationMatches[0][1]) * (/^h/i.test(durationMatches[0][2]) ? 60 : 1) : undefined;
  const duration = suppliedDuration ?? defaultDurationMinutes;
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) return clarify("Please choose a duration between 5 minutes and 8 hours.");
  const dayRange = date ? range(date) : { start: now.toISOString(), end: iso(now.getTime() + 30 * DAY) };

  const timePart = /\bmorning\b/i.test(text) ? [8 * 60, 12 * 60] : /\bafternoon\b/i.test(text) ? [12 * 60, 18 * 60] : /\bevening\b|\btonight\b/i.test(text) ? [18 * 60, 22 * 60] : [0, 1440];
  const requestedRange = date ? range(date, timePart[0], timePart[1]) : dayRange;
  if (isAgenda) {
    if (!date) return clarify("Which day should I show your appointments for?");
    return { kind: "agenda", range: requestedRange };
  }
  if (isFind) {
    if (!date) return clarify("Which day should I find a free slot on?");
    return { kind: "find", range: requestedRange, durationMinutes: duration };
  }

  const clean = (value: string) => value.replace(dayPattern, "").replace(clockPattern, "").replace(/\b(?:for\s+)?\d+(?:\.\d+)?[\s-]*(hours?|hrs?|minutes?|mins?)\b/gi, "").replace(/\b(?:my|the|on|at|from|to)\b/gi, " ").replace(/\s+/g, " ").trim().replace(/[,.]+$/, "");
  if (isMove || isCancel) {
    if (isMove && minutes.length === 0) return clarify("What new time should I use? Please include am or pm.");
    const body = text.replace(/^(?:move|reschedule|change|cancel|delete|remove)\s+/i, "");
    const selector = clean(body.split(/\b(?:from|to)\b/i)[0]);
    if (/\b\d{1,2}\b/.test(selector)) return clarify("Please include am or pm for the appointment time.");
    if (!selector && !minutes.length) return clarify("Which appointment should I change? Please include its title or start time.");
    if (isCancel) return { kind: "cancel", selector, sourceMinute: minutes[0], range: dayRange };
    return { kind: "move", selector, sourceMinute: minutes.length === 2 ? minutes[0] : undefined, range: { start: now.toISOString(), end: iso(now.getTime() + 30 * DAY) }, targetDate: date, targetMinute: minutes.at(-1)!, durationMinutes: suppliedDuration };
  }

  const reminder = /^remind\b/i.test(text);
  const notify = /\b(?:whatsapp|message|text|send)\b/i.test(text);
  const negotiate = notify && (/\b(?:find|free slot|free time|available slot|afternoon|morning|evening)\b/i.test(text) || minutes.length === 0);
  const withoutSuffix = text.replace(/\b(?:and|then)\s+(?:send|whatsapp|message|text|find)\b.*$/i, "").replace(/\b(?:find (?:a )?free.*|whatsapp (?:him|her|them).*)$/i, "");
  const body = withoutSuffix.replace(/^(?:book|add|create|schedule|put|remind(?:\s+me\s+to)?)\s+/i, "");
  const temporalIndex = body.search(new RegExp(`\\b(?:today|tomorrow|tmr|tonight|next|this|${weekdayPattern}|\\d{4}-\\d{2}-\\d{2})\\b`, "i"));
  const title = (temporalIndex >= 0 ? body.slice(0, temporalIndex) : clean(body)).replace(/\s+on$/i, "").trim();
  if (!title || title.length > 160) return clarify("What title should I use for the calendar entry?");
  if (!date) return clarify("Which day should I add this to your calendar?");
  const withContact = title.match(/\bwith\s+(.+)$/i)?.[1]?.trim();
  const contact = withContact || (notify && !/^(?:site|meeting|appointment|review|call|dentist|doctor)\b/i.test(title) ? title : undefined);
  if (notify && !contact) return clarify("Who should I WhatsApp? Please give their full name or phone number.");
  if (negotiate && contact) return { kind: "invite", title, range: requestedRange, durationMinutes: duration, contact };
  if (minutes.length !== 1) return clarify("What exact start time should I use? Please include am or pm.");
  const start = atSingaporeMinute(date, minutes[0]);
  const location = body.match(/\b(?:at|location)\s+(.+)$/i)?.[1]?.trim();
  return { kind: "create", title: location && !/^\d{1,2}(?::\d{2})?\s*(am|pm)\b/i.test(location) ? `${title} at ${location}` : title, slot: { start: iso(start), end: iso(start + duration * 60_000) }, reminder, notify, contact };
}
