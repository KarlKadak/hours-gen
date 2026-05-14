import { RoundMode, RoundInt, TimeEntry, SubEntry, ProjectData } from "../types";
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

// Strip bracket [comments] and parenthetical (comments) from description
function stripAnnotations(text: string): string {
  return text.replace(/\([^)]*\)\s*/g, "").replace(/\[[^\]]*\]\s*/g, "").trim();
}

// Find the start-time value tolerating header case/whitespace variants
function getStartTime(entry: Record<string, string>): string {
  if (entry["Start Time"]) return entry["Start Time"];
  for (const key of Object.keys(entry)) {
    if (key.trim().toLowerCase() === "start time") return entry[key];
  }
  return "";
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
      const strippedDesc = stripAnnotations(normalizedDesc);
      const date = entry["Start Date"];
      const startTime = getStartTime(entry);
      // Use stripped description for merge key so entries differing only in comments merge together
      const mergeKey = `${strippedDesc}__${date}`;
      let dur = parseFloat(entry["Duration (decimal)"] || "0");
      const shouldSkipCoeff = skipCoeffOnStar && desc?.startsWith("* ");
      if (!shouldSkipCoeff) {
        dur *= coeff;
      }
      let mins = dur * 60;
      mins = roundDuration(mins, roundMode, roundInt);
      const roundedHours = mins / 60;
      if (!merged[mergeKey]) {
        // Store with stripped description (no comments) for display/CSV
        merged[mergeKey] = { ...entry, "Description": strippedDesc, "Duration (decimal)": roundedHours } as TimeEntry;
        merged[mergeKey]["_subEntries"] = [{ description: normalizedDesc, duration: roundedHours, startTime }] as SubEntry[];
      } else {
        merged[mergeKey]["Duration (decimal)"] =
          (merged[mergeKey]["Duration (decimal)"] as number) + roundedHours;
        // Accumulate sub-entries, merging duplicates
        const subs = merged[mergeKey]["_subEntries"] as SubEntry[];
        const existing = subs.find((s) => s.description === normalizedDesc);
        if (existing) {
          existing.duration += roundedHours;
          // Keep earliest start time so chronological ordering uses the first occurrence
          if (startTime && (!existing.startTime || startTime < existing.startTime)) {
            existing.startTime = startTime;
          }
        } else {
          subs.push({ description: normalizedDesc, duration: roundedHours, startTime });
        }
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