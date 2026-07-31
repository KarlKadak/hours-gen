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
    <section>
      <h2 className="text-xl font-bold">{project}</h2>
      <div className="mb-2 text-gray-600 text-sm">
        Total hours:&nbsp;
        {formatDuration(projectTotal, displayMode)}
      </div>
      <table border={1} cellPadding={6} className="w-full">
        <thead>
          <tr>
            <th>Task</th>
            <th>Comment</th>
            <th>Date</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const comment = getEntryComment(row);
            return (
              <tr key={i}>
                <td>{stripAnnotations(row["Description"] as string)}</td>
                <td className="text-gray-600 italic">
                  {comment || <span className="text-gray-400 not-italic">—</span>}
                </td>
                <td className="text-center">{row["Start Date"]}</td>
                <td className="text-center">
                  {formatDuration(row["Duration (decimal)"], displayMode)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
};