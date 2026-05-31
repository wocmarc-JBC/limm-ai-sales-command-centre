import { getCalendarRuntime } from "@/lib/calendar-config";
import { defaultAppointmentSettings, findAppointmentSlots } from "../appointment-engine";
import type { AppointmentSlot, AppointmentType } from "../types";

export interface CalendarEventInput {
  leadId: string;
  title: string;
  startTime: string;
  endTime: string;
  description: string;
  attendeeEmail?: string;
  attendeePhone?: string;
}

export interface CalendarEventResult {
  id: string;
  status: "created" | "disabled" | "failed";
  reason: string;
}

export interface CalendarAdapter {
  findSlots(appointmentType: AppointmentType, startDate: string, days?: number): Promise<AppointmentSlot[]>;
  createHold(slot: AppointmentSlot, leadId: string): Promise<{ id: string; status: "mock_hold_created" }>;
  createEvent(input: CalendarEventInput): Promise<CalendarEventResult>;
}

export class DisabledCalendarAdapter implements CalendarAdapter {
  async findSlots(appointmentType: AppointmentType, startDate: string, days = 7): Promise<AppointmentSlot[]> {
    return findAppointmentSlots(defaultAppointmentSettings, appointmentType, startDate, days);
  }

  async createHold(_slot: AppointmentSlot, _leadId: string): Promise<{ id: string; status: "mock_hold_created" }> {
    return { id: "MOCK-HOLD-001", status: "mock_hold_created" };
  }

  async createEvent(_input: CalendarEventInput): Promise<CalendarEventResult> {
    const calendar = getCalendarRuntime();
    return {
      id: "",
      status: "disabled",
      reason: calendar.bookingEnabled ? "Calendar connection not enabled." : "Calendar booking disabled by default."
    };
  }
}

export const calendarAdapter = new DisabledCalendarAdapter();
