import { HolidayEntry, TargetHoursConfig } from "../types";
import { proxyFetch } from "./proxy";

const HOLIDAYS_URL = "https://xn--riigiphad-v9a.ee/et/luhendatud-toopaevad?output=json";

export async function fetchHolidays(): Promise<HolidayEntry[]> {
  const response = await proxyFetch(HOLIDAYS_URL);
  if (!response.ok) {
    let message = `Failed to fetch holidays (HTTP ${response.status})`;
    try {
      const data = await response.json();
      if (data?.message) message = data.message;
    } catch {
      // Keep default message
    }
    throw new Error(message);
  }

  try {
    return await response.json();
  } catch {
    throw new Error("Holiday service returned an unexpected response.");
  }
}

export function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function formatDateISO(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getWorkingDaysInMonth(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (isWeekday(new Date(year, month - 1, d))) count++;
  }
  return count;
}

export function filterHolidaysForMonth(
  holidays: HolidayEntry[],
  year: number,
  month: number
): { holidayDates: string[]; shortenedDates: string[] } {
  const holidayDates: string[] = [];
  const shortenedDates: string[] = [];

  for (const entry of holidays) {
    const date = new Date(entry.date);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;
    if (!isWeekday(date)) continue;

    const dateStr = formatDateISO(year, month, date.getDate());
    if (entry.kind_id === "1" || entry.kind_id === "2") {
      holidayDates.push(dateStr);
    } else if (entry.kind_id === "4") {
      shortenedDates.push(dateStr);
    }
  }

  return { holidayDates, shortenedDates };
}

export function calculateTargetHours(
  workingDays: number,
  workload: number,
  holidays: number,
  shortenedDays: number,
  vacationDays: number = 0
): number {
  return (workingDays - holidays - vacationDays) * 8 * workload - shortenedDays * 3 * workload;
}

export function getDayTargetHours(
  dateStr: string,
  config: TargetHoursConfig
): number {
  const date = new Date(dateStr + "T00:00:00");
  if (!isWeekday(date)) return 0;
  if (config.holidayDates.includes(dateStr)) return 0;
  if (config.vacationDates.includes(dateStr)) return 0;
  if (config.shortenedDates.includes(dateStr)) return 5 * config.workload;
  return 8 * config.workload;
}
