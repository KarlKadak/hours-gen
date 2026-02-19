import { FC, useState, useMemo } from "react";
import { TargetHoursConfig } from "../types";
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
      // Merge fetched holidays with existing vacation dates (don't overwrite vacations)
      const newHolidayDates = result.holidayDates;
      const newShortenedDates = result.shortenedDates;
      // Remove any vacation dates that are now holidays or shortened
      const allSpecial = new Set([...newHolidayDates, ...newShortenedDates]);
      const cleanedVacation = config.vacationDates.filter(d => !allSpecial.has(d));
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

  // Build calendar grid for the selected month
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(config.year, config.month, 0).getDate();
    // Day of week for the 1st (0=Sun, convert to Mon-based: 0=Mon..6=Sun)
    const firstDow = new Date(config.year, config.month - 1, 1).getDay();
    const startOffset = firstDow === 0 ? 6 : firstDow - 1; // Monday-based offset

    const cells: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    // Pad to complete the last week
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

    // Remove from all sets
    const newHolidays = config.holidayDates.filter(d => d !== dateStr);
    const newShortened = config.shortenedDates.filter(d => d !== dateStr);
    const newVacation = config.vacationDates.filter(d => d !== dateStr);

    // Add to the right set
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
      bg = "bg-gray-700 text-gray-500";
    } else {
      const state = getDayState(dateStr);
      switch (state) {
        case "holiday": bg = "bg-red-800 text-white cursor-pointer hover:bg-red-700"; break;
        case "shortened": bg = "bg-yellow-700 text-white cursor-pointer hover:bg-yellow-600"; break;
        case "vacation": bg = "bg-blue-700 text-white cursor-pointer hover:bg-blue-600"; break;
        default: bg = "bg-gray-800 text-gray-300 cursor-pointer hover:bg-gray-700"; break;
      }
    }

    const ring = isToday ? "ring-2 ring-white" : "";
    return `${bg} ${ring} w-8 h-8 flex items-center justify-center rounded text-xs select-none`;
  };

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-black text-white p-6 rounded-lg shadow-lg max-w-lg w-full border border-white max-h-[calc(100vh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">Target Hours Configuration</h3>

        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Month</label>
              <select
                value={config.month}
                onChange={(e) => update({ month: parseInt(e.target.value) })}
                className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
              >
                {MONTHS.map((name, i) => (
                  <option key={i} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="w-24">
              <label className="block text-sm font-medium mb-1">Year</label>
              <input
                type="number"
                value={config.year}
                onChange={(e) => update({ year: parseInt(e.target.value) || config.year })}
                className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Total working days in month
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={config.workingDays}
              onChange={(e) => setConfig({ ...config, workingDays: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Workload
            </label>
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
                className="w-20 px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
              />
              <span className="text-gray-400">% ({(config.workload * 8).toFixed(1)}h/day)</span>
            </div>
          </div>

          {/* Mini Calendar */}
          <div>
            <label className="block text-sm font-medium mb-2">Calendar</label>
            <div className="grid grid-cols-7 gap-1">
              {DAY_HEADERS.map(d => (
                <div key={d} className="w-8 h-6 flex items-center justify-center text-xs text-gray-500 font-medium">
                  {d}
                </div>
              ))}
              {calendarDays.map((day, i) =>
                day === null ? (
                  <div key={`empty-${i}`} className="w-8 h-8" />
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

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-800 inline-block" /> Normal
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-red-800 inline-block" /> Holiday
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-yellow-700 inline-block" /> Shortened
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-blue-700 inline-block" /> Vacation
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded bg-gray-700 inline-block" /> Weekend
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Click a weekday to cycle: normal → vacation → holiday → shortened</p>
          </div>

          <button
            onClick={handleFetchHolidays}
            disabled={fetching}
            className="w-full px-3 py-2 text-white border border-blue-400 rounded cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetching ? "Fetching..." : "Fetch holidays for selected month"}
          </button>

          {fetchError && (
            <p className="text-red-400 text-sm">{fetchError}</p>
          )}

          <div className="border-t border-gray-600 pt-4">
            <div className="text-sm text-gray-400">
              ({config.workingDays} - {config.holidays} - {config.vacationDays}) &times; {(config.workload * 8).toFixed(1)} - {config.shortenedDays} &times; {(config.workload * 3).toFixed(1)} = <b className="text-white">{targetHours.toFixed(1)}h</b>
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
