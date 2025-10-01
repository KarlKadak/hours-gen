import { RoundMode, RoundInt, TimeEntry, ProjectData } from "../types";
import { roundDuration } from "./duration";

export const groupAndMerge = (
  rows: Record<string, string>[],
  coeff: number,
  roundMode: RoundMode,
  roundInt: RoundInt
): ProjectData => {
  const projects: Record<string, Record<string, string>[]> = {};
  for (const row of rows) {
    const key = row["Project"] || "(No Project)";
    if (!projects[key]) projects[key] = [];
    projects[key].push(row);
  }
  const result: ProjectData = {};
  for (const [project, entries] of Object.entries(projects)) {
    const merged: Record<string, TimeEntry> = {};
    for (const entry of entries) {
      const desc = entry["Description"];
      const date = entry["Start Date"];
      const mergeKey = `${desc}__${date}`;
      let dur = parseFloat(entry["Duration (decimal)"] || "0");
      dur *= coeff;
      let mins = dur * 60;
      mins = roundDuration(mins, roundMode, roundInt);
      if (!merged[mergeKey]) {
        merged[mergeKey] = { ...entry, "Duration (decimal)": mins / 60 } as TimeEntry;
      } else {
        merged[mergeKey]["Duration (decimal)"] =
          (merged[mergeKey]["Duration (decimal)"] as number) + mins / 60;
      }
    }
    result[project] = Object.values(merged).sort((a: TimeEntry, b: TimeEntry) => {
      return (
        new Date(a["Start Date"] as string).getTime() -
        new Date(b["Start Date"] as string).getTime()
      );
    });
  }
  return result;
};