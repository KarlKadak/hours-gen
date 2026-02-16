import { FC } from "react";
import { RoundMode, TargetHoursConfig, ProjectData } from "../types";
import { formatDuration } from "../utils/duration";
import { calculateTargetHours } from "../utils/holidays";

interface SummaryProps {
  totalHours: number;
  roundMode: RoundMode;
  displayMode: "decimal" | "hhmm";
  targetConfig: TargetHoursConfig;
  projects: ProjectData;
  selectedProject: string;
  setSelectedProject: (value: string) => void;
  onExportClick: () => void;
  onJiraExportClick: () => void;
  onConfigureTarget: () => void;
}

function getRollingTargetHours(config: TargetHoursConfig): number {
  const now = new Date();
  const isCurrentMonth =
    now.getFullYear() === config.year && now.getMonth() + 1 === config.month;

  if (!isCurrentMonth) {
    return calculateTargetHours(
      config.workingDays,
      config.workload,
      config.holidays,
      config.shortenedDays
    );
  }

  const today = now.getDate();

  // Count working days up to today
  let workingDaysSoFar = 0;
  for (let d = 1; d <= today; d++) {
    const date = new Date(config.year, config.month - 1, d);
    const day = date.getDay();
    if (day !== 0 && day !== 6) workingDaysSoFar++;
  }

  // Proportional: (working days so far / total working days) * total target
  const totalFullTarget = calculateTargetHours(
    config.workingDays,
    config.workload,
    config.holidays,
    config.shortenedDays
  );

  if (config.workingDays === 0) return 0;
  return (workingDaysSoFar / config.workingDays) * totalFullTarget;
}

export const Summary: FC<SummaryProps> = ({
  totalHours,
  roundMode,
  displayMode,
  targetConfig,
  projects,
  selectedProject,
  setSelectedProject,
  onExportClick,
  onJiraExportClick,
  onConfigureTarget,
}) => {
  const targetHours = calculateTargetHours(
    targetConfig.workingDays,
    targetConfig.workload,
    targetConfig.holidays,
    targetConfig.shortenedDays
  );

  const rollingTarget = getRollingTargetHours(targetConfig);
  const completionPct = targetHours > 0 ? (totalHours / targetHours) * 100 : 0;
  const rollingPct = rollingTarget > 0 ? (totalHours / rollingTarget) * 100 : 0;

  return (
    <div className="flex flex-col gap-2 w-fit">
      <div>
        <b>Total hours{roundMode !== "keep" && " (after rounding)"}:</b>
        <span className="ml-2">{formatDuration(totalHours, displayMode)}</span>
      </div>
      <div>
        <b>Target hours:</b>
        <span className="ml-2">{targetHours.toFixed(1)}h</span>
        <button
          onClick={onConfigureTarget}
          className="ml-2 px-2 py-0.5 text-xs text-white border border-gray-600 rounded cursor-pointer hover:bg-gray-800"
        >
          Configure
        </button>
      </div>
      {targetHours > 0 && (
        <>
          <div>
            <b>Completion:</b>
            <span className="ml-2">
              {formatDuration(totalHours, displayMode)} / {formatDuration(targetHours, displayMode)} ({completionPct.toFixed(1)}%)
            </span>
          </div>
          <div>
            <b>Rolling completion:</b>
            <span className="ml-2">
              {formatDuration(totalHours, displayMode)} / {formatDuration(rollingTarget, displayMode)} ({rollingPct.toFixed(1)}%)
            </span>
          </div>
        </>
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
