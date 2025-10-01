export type RoundMode = "keep" | "standard" | "down" | "up";
export type RoundInt = 5 | 10 | 15 | 30 | 60;
export type DisplayMode = "decimal" | "hhmm";

export interface ProjectExportData {
  projectName: string;
  clientName: string;
}

export interface TimeEntry {
  [key: string]: string | number;
  "Project": string;
  "Description": string;
  "Start Date": string;
  "Duration (decimal)": number;
}

export type ProjectData = Record<string, TimeEntry[]>;