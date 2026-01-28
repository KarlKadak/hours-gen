import { RoundMode, RoundInt, TimeEntry, ProjectData } from "../types";
import { roundDuration } from "./duration";

// Parse DD/MM/YYYY date string to Date object
function parseDDMMYYYY(dateStr: string): Date {
  const [day, month, year] = dateStr.split("/").map(Number);
  return new Date(year, month - 1, day);
}

// Strip "* " prefix used to indicate non-coefficient entries
function normalizeDescription(desc: string): string {
  return desc?.startsWith("* ") ? desc.slice(2) : desc;
}

export const groupAndMerge = (
  rows: Record<string, string>[],
  coeff: number,
  roundMode: RoundMode,
  roundInt: RoundInt,
  skipCoeffOnStar: boolean = false
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
      const normalizedDesc = normalizeDescription(desc);
      const date = entry["Start Date"];
      // Use normalized description for merge key so "* ABC-123" and "ABC-123" merge together
      const mergeKey = `${normalizedDesc}__${date}`;
      let dur = parseFloat(entry["Duration (decimal)"] || "0");
      const shouldSkipCoeff = skipCoeffOnStar && desc?.startsWith("* ");
      if (!shouldSkipCoeff) {
        dur *= coeff;
      }
      let mins = dur * 60;
      mins = roundDuration(mins, roundMode, roundInt);
      if (!merged[mergeKey]) {
        // Store with normalized description (star prefix stripped)
        merged[mergeKey] = { ...entry, "Description": normalizedDesc, "Duration (decimal)": mins / 60 } as TimeEntry;
      } else {
        merged[mergeKey]["Duration (decimal)"] =
          (merged[mergeKey]["Duration (decimal)"] as number) + mins / 60;
      }
    }
    result[project] = Object.values(merged).sort((a: TimeEntry, b: TimeEntry) => {
      return (
        parseDDMMYYYY(a["Start Date"] as string).getTime() -
        parseDDMMYYYY(b["Start Date"] as string).getTime()
      );
    });
  }
  return result;
};