import { FC } from "react";
import { RoundMode, TargetHoursMode, ProjectData } from "../types";
import { formatDuration } from "../utils/duration";
import { isTargetHoursMode } from "../utils/validators";

interface SummaryProps {
  totalHours: number;
  roundMode: RoundMode;
  displayMode: "decimal" | "hhmm";
  targetHours: number;
  setTargetHours: (value: number) => void;
  targetHoursMode: TargetHoursMode;
  setTargetHoursMode: (value: TargetHoursMode) => void;
  workingDays: number;
  setWorkingDays: (value: number) => void;
  hoursPerDay: number;
  setHoursPerDay: (value: number) => void;
  projects: ProjectData;
  selectedProject: string;
  setSelectedProject: (value: string) => void;
  onExportClick: () => void;
  onJiraExportClick: () => void;
}

export const Summary: FC<SummaryProps> = ({
  totalHours,
  roundMode,
  displayMode,
  targetHours,
  setTargetHours,
  targetHoursMode,
  setTargetHoursMode,
  workingDays,
  setWorkingDays,
  hoursPerDay,
  setHoursPerDay,
  projects,
  selectedProject,
  setSelectedProject,
  onExportClick,
  onJiraExportClick,
}) => {
  const effectiveTargetHours =
    targetHoursMode === "total" ? targetHours : workingDays * hoursPerDay;
  return (
    <div className="flex flex-col gap-2 w-fit">
      <div>
        <b>Total hours{roundMode !== "keep" && " (after rounding)"}:</b>
        <span className="ml-2">{formatDuration(totalHours, displayMode)}</span>
      </div>
      <div>
        <b>Target hours:</b>
        <select
          value={targetHoursMode}
          onChange={(e) =>
            isTargetHoursMode(e.target.value) && setTargetHoursMode(e.target.value)
          }
          className="ml-2"
        >
          <option value="total">Total</option>
          <option value="workingDays">Working days</option>
        </select>
        {targetHoursMode === "total" ? (
          <input
            type="number"
            step="0.01"
            min="0"
            value={targetHours || ""}
            onChange={(e) => setTargetHours(parseFloat(e.target.value) || 0)}
            className="w-20 ml-2"
          />
        ) : (
          <>
            <input
              type="number"
              step="1"
              min="0"
              value={workingDays || ""}
              onChange={(e) => setWorkingDays(parseInt(e.target.value) || 0)}
              className="w-16 ml-2"
              placeholder="days"
            />
            <span className="mx-1">×</span>
            <input
              type="number"
              step="0.5"
              min="0"
              value={hoursPerDay || ""}
              onChange={(e) => setHoursPerDay(parseFloat(e.target.value) || 0)}
              className="w-16"
              placeholder="h/day"
            />
            <span className="ml-2 text-gray-400">
              = {(workingDays * hoursPerDay).toFixed(1)}h
            </span>
          </>
        )}
      </div>
      {effectiveTargetHours > 0 && (
        <div>
          <b>Completion:</b>
          <span className="ml-2">
            {((totalHours / effectiveTargetHours) * 100).toFixed(1)}%
          </span>
        </div>
      )}
      <div>
        <label>
          <b>Export project:</b>
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="ml-2"
          >
            <option value="all">All projects</option>
            {Object.keys(projects).map((projectName) => (
              <option key={projectName} value={projectName}>
                {projectName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onExportClick}
          disabled={Object.keys(projects).length === 0}
          className="px-3 py-1 text-white border border-white rounded text-sm cursor-pointer disabled:bg-gray-600 disabled:cursor-not-allowed disabled:border-gray-400"
        >
          Export to CSV
        </button>
        <button
          onClick={onJiraExportClick}
          disabled={Object.keys(projects).length === 0}
          className="px-3 py-1 text-white border border-blue-400 rounded text-sm cursor-pointer disabled:bg-gray-600 disabled:cursor-not-allowed disabled:border-gray-400"
        >
          Export to Jira
        </button>
      </div>
    </div>
  );
};