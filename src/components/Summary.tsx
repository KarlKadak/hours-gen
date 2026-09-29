import { FC, MouseEvent, useState } from "react";
import { TargetHoursConfig, ProjectData, DisplayMode } from "../types";
import { formatDuration } from "../utils/duration";
import { calculateTargetHours, getDayTargetHours, formatDateISO } from "../utils/holidays";

interface SummaryProps {
  totalHours: number;
  displayMode: DisplayMode;
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
      config.shortenedDays,
      config.vacationDays
    );
  }

  const today = now.getDate();
  let expectedHours = 0;
  for (let d = 1; d <= today; d++) {
    const dateStr = formatDateISO(config.year, config.month, d);
    expectedHours += getDayTargetHours(dateStr, config);
  }
  return expectedHours;
}

interface ProgressRowProps {
  label: string;
  value: number;
  target: number;
  displayMode: DisplayMode;
  behindTone?: boolean;
}

const ProgressRow: FC<ProgressRowProps> = ({ label, value, target, displayMode, behindTone }) => {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const done = pct >= 99.95;
  const color = done
    ? "var(--success)"
    : behindTone
    ? "var(--warning)"
    : "var(--accent)";

  // Hovered position along the bar, snapped to whole percents. Null when not hovering.
  const [hoverPct, setHoverPct] = useState<number | null>(null);

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    setHoverPct(Math.min(100, Math.max(0, Math.round(ratio * 100))));
  };

  const hoverHours = hoverPct !== null ? (target * hoverPct) / 100 : null;
  const remaining = hoverHours !== null ? hoverHours - value : null;
  const fmt = (h: number) =>
    displayMode === "decimal" ? `${formatDuration(h, displayMode)}h` : formatDuration(h, displayMode);

  // Keep the label inside the bar near the edges instead of centering it on the line.
  const labelAlign =
    hoverPct === null ? "center" : hoverPct < 12 ? "start" : hoverPct > 88 ? "end" : "center";

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="num">
          {formatDuration(value, displayMode)} / {formatDuration(target, displayMode)}
          <span className="ml-1.5 text-[var(--text-faint)]">{pct.toFixed(0)}%</span>
        </span>
      </div>
      <div
        className="progress-hover"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverPct(null)}
      >
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
          />
        </div>
        {hoverPct !== null && (
          <div className="progress-marker" style={{ left: `${hoverPct}%` }} />
        )}
      </div>
      <div className="progress-hint num">
        {hoverPct !== null && hoverHours !== null && remaining !== null && (
          <span
            className={`progress-hint-label progress-hint-${labelAlign}`}
            style={{ left: `${hoverPct}%` }}
          >
            <span className="text-[var(--text)]">{hoverPct}%</span>
            {" = "}
            {fmt(hoverHours)}
            <span className="ml-1.5 text-[var(--text-faint)]">
              {remaining >= 0 ? `${fmt(remaining)} to go` : `${fmt(-remaining)} over`}
            </span>
          </span>
        )}
      </div>
    </div>
  );
};

export const Summary: FC<SummaryProps> = ({
  totalHours,
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
    targetConfig.shortenedDays,
    targetConfig.vacationDays
  );

  const rollingTarget = getRollingTargetHours(targetConfig);
  const hasProjects = Object.keys(projects).length > 0;

  return (
    <div className="card flex flex-col">
      <div className="flex items-center justify-between">
        <div className="card-title mb-0">Target</div>
        <button className="btn btn-ghost btn-sm" onClick={onConfigureTarget}>
          Configure
        </button>
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="num text-3xl font-semibold">{targetHours.toFixed(1)}h</span>
        <span className="text-sm text-[var(--text-muted)]">
          for this month
        </span>
      </div>

      {targetHours > 0 && (
        <div className="mt-4 space-y-3">
          <ProgressRow
            label="Completion"
            value={totalHours}
            target={targetHours}
            displayMode={displayMode}
          />
          <ProgressRow
            label="On track (to date)"
            value={totalHours}
            target={rollingTarget}
            displayMode={displayMode}
            behindTone
          />
        </div>
      )}

      <hr className="divider my-5" />

      <div className="card-title">Export</div>
      <div className="flex flex-col gap-3">
        <div>
          <label className="label" htmlFor="exportProject">
            Project
          </label>
          <select
            id="exportProject"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="control w-full"
          >
            <option value="all">All projects</option>
            {Object.keys(projects).map((projectName) => (
              <option key={projectName} value={projectName}>
                {projectName}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExportClick}
            disabled={!hasProjects}
            className="btn btn-secondary flex-1"
          >
            Export to CSV
          </button>
          <button
            onClick={onJiraExportClick}
            disabled={!hasProjects || selectedProject === "all"}
            className="btn btn-primary flex-1"
            title={
              selectedProject === "all"
                ? "Select a single project to export to Jira"
                : undefined
            }
          >
            Export to Jira
          </button>
        </div>
      </div>
    </div>
  );
};
