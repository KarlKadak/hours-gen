import { FC } from "react";
import { DisplayMode, TimeEntry } from "../types";
import { formatDuration } from "../utils/duration";
import { getEntryComment } from "../utils/data";

const stripAnnotations = (text: string): string => {
  return text.replace(/\([^)]*\)\s*/g, "").replace(/\[[^\]]*\]\s*/g, "").trim();
};

interface ProjectTableProps {
  project: string;
  rows: TimeEntry[];
  displayMode: DisplayMode;
}

export const ProjectTable: FC<ProjectTableProps> = ({
  project,
  rows,
  displayMode,
}) => {
  const projectTotal = rows.reduce(
    (sum, row) => sum + (row["Duration (decimal)"] || 0),
    0
  );

  return (
    <section className="card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{project}</h2>
        <span className="badge badge-muted num">
          {formatDuration(projectTotal, displayMode)} h
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Task</th>
              <th>Comment</th>
              <th>Date</th>
              <th className="text-right">Duration</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const comment = getEntryComment(row);
              return (
                <tr key={i}>
                  <td>{stripAnnotations(row["Description"] as string)}</td>
                  <td className="italic text-[var(--text-muted)]">
                    {comment || (
                      <span className="not-italic text-[var(--text-faint)]">—</span>
                    )}
                  </td>
                  <td className="num whitespace-nowrap text-[var(--text-muted)]">
                    {row["Start Date"]}
                  </td>
                  <td className="num text-right">
                    {formatDuration(row["Duration (decimal)"], displayMode)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};
