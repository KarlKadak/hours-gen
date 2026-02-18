export type RoundMode = "keep" | "standard" | "down" | "up";
export type RoundInt = 5 | 10 | 15 | 30 | 60;
export type DisplayMode = "decimal" | "hhmm";

export interface HolidayEntry {
  date: string;
  end_date: string | null;
  title: string;
  notes: string | null;
  kind: string;
  kind_id: string;
}

export interface TargetHoursConfig {
  workingDays: number;
  workload: number; // 0-1, where 1 = 100% = 8h/day
  holidays: number;
  vacationDays: number;
  shortenedDays: number;
  month: number; // 1-12
  year: number;
}

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

export interface JiraCredential {
  id: string;
  name: string;
  jiraDomain: string;
  jiraEmail: string;
  jiraApiToken: string;
  tempoApiToken: string;
  atlassianAccountId: string;
}

export interface EncryptedCredentialStore {
  salt: string;
  iv: string;
  data: string;
}

export interface JiraExportEntry {
  date: string;
  issueKey: string;
  hours: number;
  description: string;
  status: "pending" | "in_progress" | "created" | "updated" | "error";
  error?: string;
}

export interface JiraExportState {
  isExporting: boolean;
  currentIndex: number;
  totalEntries: number;
  entries: JiraExportEntry[];
  successCount: number;
  failCount: number;
}