import { FC } from "react";
import { DisplayMode, TimeEntry, SubEntry } from "../types";
import { formatDuration } from "../utils/duration";
import { extractBracketComment } from "../utils/jiraApi";

const stripAnnotations = (text: string): string => {
  return text.replace(/\([^)]*\)\s*/g, "").replace(/\[[^\]]*\]\s*/g, "").trim();
};

// Reconstruct the comment that would be written to the timelog entry for this
// row. Mirrors JiraExportModal.prepareEntries: bracket comments from each
// sub-entry, taken in start-time order and de-duplicated, joined with "; ".
const getInsertedComment = (row: TimeEntry): string => {
  const subs = row["_subEntries"] as SubEntry[] | undefined;
  const sources =
    subs && subs.length > 0
      ? [...subs]
          .sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""))
          .map((s) => s.description)
      : [row["Description"] as string];

  const parts: string[] = [];
  for (const source of sources) {
    const comment = extractBracketComment(source);
    if (comment && !parts.includes(comment)) parts.push(comment);
  }
  return parts.join("; ");
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
            <th>Inserted?</th>
            <th>Task</th>
            <th>Comment</th>
            <th>Date</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const comment = getInsertedComment(row);
            return (
              <tr key={i}>
                <td className="text-center">
                  <input type="checkbox" />
                </td>
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