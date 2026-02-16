import { HolidayEntry } from "../types";

const PROXY_URL = "https://hours-api.karl-ccd.workers.dev/";
const HOLIDAYS_URL = "https://xn--riigiphad-v9a.ee/et/luhendatud-toopaevad?output=json";

export async function fetchHolidays(): Promise<HolidayEntry[]> {
  const headers = new Headers();
  headers.set("x-target-url", HOLIDAYS_URL);

  const response = await fetch(PROXY_URL, { headers });
  if (!response.ok) {
    throw new Error(`Failed to fetch holidays: HTTP ${response.status}`);
  }
  return response.json();
}

function isWeekday(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
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
): { holidays: number; shortenedDays: number } {
  let holidayCount = 0;
  let shortenedCount = 0;

  for (const entry of holidays) {
    const date = new Date(entry.date);
    if (date.getFullYear() !== year || date.getMonth() + 1 !== month) continue;
    if (!isWeekday(date)) continue;

    if (entry.kind_id === "1" || entry.kind_id === "2") {
      holidayCount++;
    } else if (entry.kind_id === "4") {
      shortenedCount++;
    }
  }

  return { holidays: holidayCount, shortenedDays: shortenedCount };
}

export function calculateTargetHours(
  workingDays: number,
  workload: number,
  holidays: number,
  shortenedDays: number
): number {
  return (workingDays - holidays) * 8 * workload - shortenedDays * 3 * workload;
}
