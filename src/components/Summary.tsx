import { FC, PointerEvent, useRef } from "react";
import { TargetHoursConfig, ProjectData, DisplayMode, ProgressTargets } from "../types";
import { formatDuration } from "../utils/duration";
import { calculateTargetHours, getDayTargetHours, formatDateISO } from "../utils/holidays";

interface SummaryProps {
  totalHours: number;
  displayMode: DisplayMode;
  targetConfig: TargetHoursConfig;
  progressTargets: ProgressTargets;
  setProgressTargets: (value: ProgressTargets) => void;
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
  // Marker position along the bar in whole percents, owned by the parent so it persists.
  targetPct: number;
  onTargetChange: (pct: number) => void;
}

const ProgressRow: FC<ProgressRowProps> = ({
  label,
  value,
  target,
  displayMode,
  behindTone,
  targetPct,
  onTargetChange,
}) => {
  const pct = target > 0 ? (value / target) * 100 : 0;
  const done = pct >= 99.95;
  const color = done
    ? "var(--success)"
    : behindTone
    ? "var(--warning)"
    : "var(--accent)";

  // The marker only follows the pointer while the button is held down on the bar,
  // so plain hovering leaves it where it was.
  const dragging = useRef(false);

  const moveTo = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const next = Math.min(100, Math.max(0, Math.round(ratio * 100)));
    if (next !== targetPct) onTargetChange(next);
  };

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    moveTo(e);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) moveTo(e);
  };

  const handlePointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const targetHours = (target * targetPct) / 100;
  const remaining = targetHours - value;
  const fmt = (h: number) =>
    displayMode === "decimal" ? `${formatDuration(h, displayMode)}h` : formatDuration(h, displayMode);

  // Keep the label inside the bar near the edges instead of centering it on the line.
  const labelAlign = targetPct < 12 ? "start" : targetPct > 88 ? "end" : "center";

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
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <div className="progress-track">
          <div
            className="progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
          />
        </div>
        <div className="progress-marker" style={{ left: `${targetPct}%` }} />
      </div>
      <div className="progress-hint num">
        <span
          className={`progress-hint-label progress-hint-${labelAlign}`}
          style={{ left: `${targetPct}%` }}
        >
          <span className="text-[var(--text)]">{targetPct}%</span>
          {" = "}
          {fmt(targetHours)}
          <span className="ml-1.5 text-[var(--text-faint)]">
            {remaining >= 0 ? `${fmt(remaining)} to go` : `${fmt(-remaining)} over`}
          </span>
        </span>
      </div>
    </div>
  );
};

export const Summary: FC<SummaryProps> = ({
  totalHours,
  displayMode,
  targetConfig,
  progressTargets,
  setProgressTargets,
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
            targetPct={progressTargets.completion}
            onTargetChange={(pct) => setProgressTargets({ ...progressTargets, completion: pct })}
          />
          <ProgressRow
            label="On track (to date)"
            value={totalHours}
            target={rollingTarget}
            displayMode={displayMode}
            behindTone
            targetPct={progressTargets.onTrack}
            onTargetChange={(pct) => setProgressTargets({ ...progressTargets, onTrack: pct })}
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
