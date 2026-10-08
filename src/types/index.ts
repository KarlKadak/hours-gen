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
  holidayDates: string[];    // "YYYY-MM-DD"
  shortenedDates: string[];  // "YYYY-MM-DD"
  vacationDates: string[];   // "YYYY-MM-DD"
  month: number; // 1-12
  year: number;
}

export interface ProjectExportData {
  projectName: string;
  clientName: string;
}

export interface StoredProjectMapping {
  projectName: string;
  clientName: string;
  lastExported: string; // ISO 8601 datetime
}

export interface SubEntry {
  description: string;
  duration: number;
  startTime?: string;
}

export interface TimeEntry {
  [key: string]: string | number | SubEntry[];
  "Project": string;
  "Description": string;
  "Start Date": string;
  "Duration (decimal)": number;
}

export type ProjectData = Record<string, TimeEntry[]>;

// "cloud" is Atlassian-hosted Jira (v3 API, account IDs, ADF comments).
// "server" is self-hosted Jira Server / Data Center (v2 API, plain-string
// comments, authors matched by email). Missing means cloud.
export type JiraHosting = "cloud" | "server";

// How the Jira API token field is sent. "basic" puts it in a Basic auth
// header as the password. "pat" sends it as a Bearer token, which is what
// Jira Server / Data Center personal access tokens require.
export type JiraAuthMode = "basic" | "pat";

export interface JiraCredential {
  id: string;
  name: string;
  type: "tempo" | "apptime";
  hosting?: JiraHosting;
  authMode?: JiraAuthMode;
  jiraDomain: string;
  jiraEmail: string;
  // Basic auth username when it differs from the email (Server / DC only).
  jiraUsername?: string;
  jiraApiToken: string;
  tempoApiToken: string;
  // Required for cloud, unused for server.
  atlassianAccountId: string;
  azureAdProxy?: boolean;
}

export interface EncryptedCredentialStore {
  salt: string;
  iv: string;
  data: string;
}

// The full decrypted contents of the master-password vault: Jira credentials
// plus an optional Clockify API key used to pull time entries.
export interface VaultData {
  credentials: JiraCredential[];
  clockifyApiKey?: string;
}

export interface JiraExportEntry {
  date: string;
  issueKey: string;
  hours: number;
  description: string;
  status: "pending" | "in_progress" | "created" | "updated" | "skipped" | "error";
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