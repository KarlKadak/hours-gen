import { FC, useState } from "react";
import { TargetHoursConfig } from "../types";
import {
  fetchHolidays,
  filterHolidaysForMonth,
  getWorkingDaysInMonth,
  calculateTargetHours,
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
    config.shortenedDays
  );

  const update = (partial: Partial<TargetHoursConfig>) => {
    const next = { ...config, ...partial };
    // Recalculate working days when month/year changes
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
      setConfig({
        ...config,
        workingDays,
        holidays: result.holidays,
        shortenedDays: result.shortenedDays,
      });
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : "Failed to fetch holidays");
    } finally {
      setFetching(false);
    }
  };

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-black text-white p-6 rounded-lg shadow-lg max-w-md w-full border border-white max-h-[calc(100vh-2rem)] overflow-y-auto"
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

          <div>
            <label className="block text-sm font-medium mb-1">
              Holidays on working days
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={config.holidays}
              onChange={(e) => setConfig({ ...config, holidays: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Shortened working days
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={config.shortenedDays}
              onChange={(e) => setConfig({ ...config, shortenedDays: parseInt(e.target.value) || 0 })}
              className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
            />
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
              ({config.workingDays} - {config.holidays}) &times; {(config.workload * 8).toFixed(1)} - {config.shortenedDays} &times; {(config.workload * 3).toFixed(1)} = <b className="text-white">{targetHours.toFixed(1)}h</b>
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
