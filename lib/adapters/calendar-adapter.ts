import { defaultAppointmentSettings, findAppointmentSlots } from "../appointment-engine";
import type { AppointmentSlot, AppointmentType } from "../types";

export interface CalendarAdapter {
  findSlots(appointmentType: AppointmentType, startDate: string, days?: number): Promise<AppointmentSlot[]>;
  createHold(slot: AppointmentSlot, leadId: string): Promise<{ id: string; status: "mock_hold_created" }>;
}

export class MockCalendarAdapter implements CalendarAdapter {
  async findSlots(appointmentType: AppointmentType, startDate: string, days = 7): Promise<AppointmentSlot[]> {
    return findAppointmentSlots(defaultAppointmentSettings, appointmentType, startDate, days);
  }

  async createHold(_slot: AppointmentSlot, _leadId: string): Promise<{ id: string; status: "mock_hold_created" }> {
    return { id: "MOCK-HOLD-001", status: "mock_hold_created" };
  }
}
