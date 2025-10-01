import { FC } from "react";
import { RoundMode } from "../types";
import { formatDuration } from "../utils/duration";

import { ProjectData } from "../types";

interface SummaryProps {
  totalHours: number;
  roundMode: RoundMode;
  displayMode: "decimal" | "hhmm";
  targetHours: number;
  setTargetHours: (value: number) => void;
  projects: ProjectData;
  selectedProject: string;
  setSelectedProject: (value: string) => void;
  onExportClick: () => void;
}

export const Summary: FC<SummaryProps> = ({
  totalHours,
  roundMode,
  displayMode,
  targetHours,
  setTargetHours,
  projects,
  selectedProject,
  setSelectedProject,
  onExportClick,
}) => {
  return (
    <div className="flex flex-col gap-2 w-fit">
      <div>
        <b>Total hours{roundMode !== "keep" && " (after rounding)"}:</b>
        <span className="ml-2">{formatDuration(totalHours, displayMode)}</span>
      </div>
      <div>
        <b>Target hours:</b>
        <input
          type="number"
          step="0.01"
          min="0"
          value={targetHours || ""}
          onChange={(e) => setTargetHours(parseFloat(e.target.value) || 0)}
          className="w-20 ml-2"
        />
      </div>
      {targetHours > 0 && (
        <div>
          <b>Completion:</b>
          <span className="ml-2">
            {((totalHours / targetHours) * 100).toFixed(1)}%
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
      <button
        onClick={onExportClick}
        disabled={Object.keys(projects).length === 0}
        className="px-3 py-1 text-white border border-white rounded text-sm cursor-pointer disabled:bg-gray-600 disabled:cursor-not-allowed disabled:border-gray-400"
      >
        Export to CSV
      </button>
    </div>
  );
};