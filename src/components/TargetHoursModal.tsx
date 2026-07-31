import { FC, useState, useMemo } from "react";
import { TargetHoursConfig } from "../types";
import { Modal } from "./Modal";
import {
  fetchHolidays,
  filterHolidaysForMonth,
  getWorkingDaysInMonth,
  calculateTargetHours,
  isWeekday,
  formatDateISO,
} from "../utils/holidays";

interface TargetHoursModalProps {
  config: TargetHoursConfig;
  setConfig: (config: TargetHoursConfig) => void;
  onClose: () => void;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_HEADERS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

type DayState = "normal" | "vacation" | "holiday" | "shortened";
const CYCLE: DayState[] = ["normal", "vacation", "holiday", "shortened"];

const LEGEND: { label: string; className: string }[] = [
  { label: "Normal", className: "bg-[var(--surface-2)] border border-[var(--border)]" },
  { label: "Holiday", className: "bg-rose-600" },
  { label: "Shortened", className: "bg-amber-500" },
  { label: "Vacation", className: "bg-indigo-500" },
  { label: "Weekend", className: "bg-[var(--surface)] border border-[var(--border)]" },
];

export const TargetHoursModal: FC<TargetHoursModalProps> = ({
  config,
  setConfig,
  onClose,
}) => {
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const targetHours = calculateTargetHours(
    config.workingDays,
    config.workload,
    config.holidays,
    config.shortenedDays,
    config.vacationDays
  );

  const update = (partial: Partial<TargetHoursConfig>) => {
    const next = { ...config, ...partial };
    if ("month" in partial || "year" in partial) {
      next.workingDays = getWorkingDaysInMonth(next.year, next.month);
    }
    setConfig(next);
  };

  const handleFetchHolidays = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const holidays = await fetchHolidays();
      const result = filterHolidaysForMonth(holidays, config.year, config.month);
      const workingDays = getWorkingDaysInMonth(config.year, config.month);
      const newHolidayDates = result.holidayDates;
      const newShortenedDates = result.shortenedDates;
      const allSpecial = new Set([...newHolidayDates, ...newShortenedDates]);
      const cleanedVacation = config.vacationDates.filter((d) => !allSpecial.has(d));
      setConfig({
        ...config,
        workingDays,
        holidayDates: newHolidayDates,
        holidays: newHolidayDates.length,
        shortenedDates: newShortenedDates,
        shortenedDays: newShortenedDates.length,
        vacationDates: cleanedVacation,
        vacationDays: cleanedVacation.length,
      });
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to fetch holidays");
    } finally {
      setFetching(false);
    }
  };

  const todayStr = useMemo(() => {
    const now = new Date();
    return formatDateISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }, []);

  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(config.year, config.month, 0).getDate();
    const firstDow = new Date(config.year, config.month - 1, 1).getDay();
    const startOffset = firstDow === 0 ? 6 : firstDow - 1;

    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [config.year, config.month]);

  const holidaySet = useMemo(() => new Set(config.holidayDates), [config.holidayDates]);
  const shortenedSet = useMemo(() => new Set(config.shortenedDates), [config.shortenedDates]);
  const vacationSet = useMemo(() => new Set(config.vacationDates), [config.vacationDates]);

  const getDayState = (dateStr: string): DayState => {
    if (holidaySet.has(dateStr)) return "holiday";
    if (shortenedSet.has(dateStr)) return "shortened";
    if (vacationSet.has(dateStr)) return "vacation";
    return "normal";
  };

  const handleDayClick = (day: number) => {
    const dateStr = formatDateISO(config.year, config.month, day);
    const date = new Date(config.year, config.month - 1, day);
    if (!isWeekday(date)) return;

    const current = getDayState(dateStr);
    const nextIdx = (CYCLE.indexOf(current) + 1) % CYCLE.length;
    const next = CYCLE[nextIdx];

    const newHolidays = config.holidayDates.filter((d) => d !== dateStr);
    const newShortened = config.shortenedDates.filter((d) => d !== dateStr);
    const newVacation = config.vacationDates.filter((d) => d !== dateStr);

    if (next === "holiday") newHolidays.push(dateStr);
    else if (next === "shortened") newShortened.push(dateStr);
    else if (next === "vacation") newVacation.push(dateStr);

    setConfig({
      ...config,
      holidayDates: newHolidays,
      holidays: newHolidays.length,
      shortenedDates: newShortened,
      shortenedDays: newShortened.length,
      vacationDates: newVacation,
      vacationDays: newVacation.length,
    });
  };

  const getDayCellClasses = (day: number): string => {
    const dateStr = formatDateISO(config.year, config.month, day);
    const date = new Date(config.year, config.month - 1, day);
    const weekend = !isWeekday(date);
    const isToday = dateStr === todayStr;

    let bg: string;
    if (weekend) {
      bg = "bg-[var(--surface)] text-[var(--text-faint)]";
    } else {
      const state = getDayState(dateStr);
      switch (state) {
        case "holiday": bg = "bg-rose-600 text-white cursor-pointer hover:bg-rose-500"; break;
        case "shortened": bg = "bg-amber-500 text-black cursor-pointer hover:bg-amber-400"; break;
        case "vacation": bg = "bg-indigo-500 text-white cursor-pointer hover:bg-indigo-400"; break;
        default: bg = "bg-[var(--surface-2)] text-[var(--text-muted)] cursor-pointer hover:bg-[var(--surface-3)]"; break;
      }
    }

    const ring = isToday ? "ring-2 ring-white/80" : "";
    return `${bg} ${ring} w-9 h-9 flex items-center justify-center rounded-[var(--radius-sm)] text-xs font-medium select-none transition-colors`;
  };

  return (
    <Modal title="Target hours" onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="label">Month</label>
            <select
              value={config.month}
              onChange={(e) => update({ month: parseInt(e.target.value) })}
              className="control w-full"
            >
              {MONTHS.map((name, i) => (
                <option key={i} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="w-28">
            <label className="label">Year</label>
            <input
              type="number"
              value={config.year}
              onChange={(e) => update({ year: parseInt(e.target.value) || config.year })}
              className="control w-full"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Total working days</label>
            <input
              type="number"
              min="0"
              step="1"
              value={config.workingDays}
              onChange={(e) =>
                setConfig({ ...config, workingDays: parseInt(e.target.value) || 0 })
              }
              className="control w-full"
            />
          </div>
          <div>
            <label className="label">Workload</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round(config.workload * 100)}
                onChange={(e) => {
                  const pct = Math.min(100, Math.max(0, parseInt(e.target.value) || 0));
                  setConfig({ ...config, workload: pct / 100 });
                }}
                className="control w-20"
              />
              <span className="text-sm text-[var(--text-muted)]">
                % ({(config.workload * 8).toFixed(1)}h/day)
              </span>
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div>
          <label className="label">Calendar</label>
          <div className="grid grid-cols-7 justify-items-center gap-1">
            {DAY_HEADERS.map((d) => (
              <div
                key={d}
                className="flex h-6 w-9 items-center justify-center text-xs font-medium text-[var(--text-faint)]"
              >
                {d}
              </div>
            ))}
            {calendarDays.map((day, i) =>
              day === null ? (
                <div key={`empty-${i}`} className="h-9 w-9" />
              ) : (
                <div
                  key={day}
                  className={getDayCellClasses(day)}
                  onClick={() => handleDayClick(day)}
                >
                  {day}
                </div>
              )
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-[var(--text-muted)]">
            {LEGEND.map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className={`inline-block h-3 w-3 rounded ${item.className}`} />
                {item.label}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-[var(--text-faint)]">
            Click a weekday to cycle: normal → vacation → holiday → shortened
          </p>
        </div>

        <button
          onClick={handleFetchHolidays}
          disabled={fetching}
          className="btn btn-secondary w-full"
        >
          {fetching ? "Fetching…" : "Fetch holidays for selected month"}
        </button>

        {fetchError && <p className="text-sm text-[var(--danger)]">{fetchError}</p>}

        <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--text-muted)]">
          <span className="num">
            ({config.workingDays} − {config.holidays} − {config.vacationDays}) ×{" "}
            {(config.workload * 8).toFixed(1)} − {config.shortenedDays} ×{" "}
            {(config.workload * 3).toFixed(1)}
          </span>{" "}
          = <b className="num text-[var(--text)]">{targetHours.toFixed(1)}h</b>
        </div>
      </div>
    </Modal>
  );
};
