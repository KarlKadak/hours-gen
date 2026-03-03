import { JiraCredential, TimeEntry } from "../types";

const PROXY_URL = "https://hours-api.karl-ccd.workers.dev/";

async function proxyFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("x-target-url", url);

  return fetch(PROXY_URL, {
    ...options,
    headers,
  });
}

// Convert DD/MM/YYYY to YYYY-MM-DD format for Tempo API
function toISODate(dateStr: string): string {
  const [day, month, year] = dateStr.split("/");
  return `${year}-${month}-${day}`;
}

function stripAnnotations(text: string): string {
  return text.replace(/\([^)]*\)\s*/g, "").replace(/\[[^\]]*\]\s*/g, "").trim();
}

function extractBracketComment(text: string): string {
  const matches = text.match(/\[([^\]]*)\]/g);
  if (!matches) return "";
  return matches.map((m) => m.slice(1, -1)).join("; ");
}

export function extractIssueKey(description: string): string | null {
  const cleaned = stripAnnotations(description);
  const match = cleaned.match(/^([A-Z]+-\d+)/);
  return match ? match[1] : null;
}

export function hoursToSeconds(hours: number): number {
  return Math.round(hours * 3600);
}

export async function getJiraIssueId(
  credential: JiraCredential,
  issueKey: string
): Promise<number | null> {
  const auth = btoa(`${credential.jiraEmail}:${credential.jiraApiToken}`);

  const response = await proxyFetch(
    `https://${credential.jiraDomain}/rest/api/3/issue/${issueKey}?fields=id`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    }
  );

  if (response.ok) {
    const data = await response.json();
    return parseInt(data.id, 10);
  }

  return null;
}

export interface CreateWorklogResult {
  success: boolean;
  error?: string;
  wasUpdated?: boolean;
}

interface TempoWorklog {
  tempoWorklogId: number;
  issue: {
    id: number;
  };
  timeSpentSeconds: number;
  startDate: string;
  description?: string;
}

async function getExistingWorklogs(
  credential: JiraCredential,
  date: string
): Promise<TempoWorklog[]> {
  const response = await proxyFetch(
    `https://api.tempo.io/4/worklogs/user/${credential.atlassianAccountId}?from=${date}&to=${date}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${credential.tempoApiToken}`,
        Accept: "application/json",
      },
    }
  );

  if (response.ok) {
    const data = await response.json();
    return data.results || [];
  }

  return [];
}

async function updateTempoWorklog(
  credential: JiraCredential,
  worklogId: number,
  issueId: number,
  date: string,
  seconds: number,
  description: string = ""
): Promise<CreateWorklogResult> {
  const payload = {
    issueId,
    timeSpentSeconds: seconds,
    startDate: date,
    startTime: "09:00:00",
    authorAccountId: credential.atlassianAccountId,
    description,
  };

  const response = await proxyFetch(
    `https://api.tempo.io/4/worklogs/${worklogId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${credential.tempoApiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (response.ok) {
    return { success: true, wasUpdated: true };
  }

  let errorMsg = `HTTP ${response.status}`;
  try {
    const data = await response.json();
    errorMsg = data.errors?.[0]?.message || JSON.stringify(data).slice(0, 100);
  } catch {
    // Keep default error message
  }

  return { success: false, error: errorMsg };
}

export async function createTempoWorklog(
  credential: JiraCredential,
  issueId: number,
  date: string,
  seconds: number,
  description: string = ""
): Promise<CreateWorklogResult> {
  // Check for existing worklog for this issue on this date
  const existingWorklogs = await getExistingWorklogs(credential, date);
  const existingWorklog = existingWorklogs.find(
    (w) => w.issue.id === issueId
  );

  if (existingWorklog) {
    // Update existing worklog instead of creating a new one
    return updateTempoWorklog(
      credential,
      existingWorklog.tempoWorklogId,
      issueId,
      date,
      seconds,
      description
    );
  }

  // No existing worklog, create a new one
  const payload = {
    issueId,
    timeSpentSeconds: seconds,
    startDate: date,
    startTime: "09:00:00",
    authorAccountId: credential.atlassianAccountId,
    description,
  };

  const response = await proxyFetch("https://api.tempo.io/4/worklogs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential.tempoApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return { success: true, wasUpdated: false };
  }

  let errorMsg = `HTTP ${response.status}`;
  try {
    const data = await response.json();
    errorMsg = data.errors?.[0]?.message || JSON.stringify(data).slice(0, 100);
  } catch {
    // Keep default error message
  }

  return { success: false, error: errorMsg };
}

export interface ExportWorklogParams {
  credential: JiraCredential;
  entry: TimeEntry;
  onProgress?: (message: string) => void;
}

export interface ExportWorklogResult {
  success: boolean;
  error?: string;
  issueKey: string;
  wasUpdated?: boolean;
}

const issueIdCache: Record<string, Record<string, number>> = {};

export async function exportWorklog({
  credential,
  entry,
  onProgress,
}: ExportWorklogParams): Promise<ExportWorklogResult> {
  const description = entry["Description"] as string;
  const issueKey = extractIssueKey(description);

  if (!issueKey) {
    return {
      success: false,
      error: "No issue key found in description",
      issueKey: "N/A",
    };
  }

  const cacheKey = credential.jiraDomain;
  if (!issueIdCache[cacheKey]) {
    issueIdCache[cacheKey] = {};
  }

  let issueId = issueIdCache[cacheKey][issueKey];

  if (!issueId) {
    onProgress?.(`Fetching issue ID for ${issueKey}...`);
    const fetchedId = await getJiraIssueId(credential, issueKey);
    if (!fetchedId) {
      return {
        success: false,
        error: `Failed to get issue ID for ${issueKey}`,
        issueKey,
      };
    }
    issueIdCache[cacheKey][issueKey] = fetchedId;
    issueId = fetchedId;
  }

  onProgress?.(`Creating worklog for ${issueKey}...`);

  const date = toISODate(entry["Start Date"] as string);
  const hours = entry["Duration (decimal)"] as number;
  const seconds = hoursToSeconds(hours);
  const comment = extractBracketComment(description);

  const result = await createTempoWorklog(
    credential,
    issueId,
    date,
    seconds,
    comment
  );

  return {
    ...result,
    issueKey,
  };
}

export function prepareEntriesForExport(
  entries: TimeEntry[]
): { date: string; issueKey: string; hours: number; description: string }[] {
  return entries
    .map((entry) => {
      const description = entry["Description"] as string;
      const issueKey = extractIssueKey(description);
      return {
        date: entry["Start Date"] as string,
        issueKey: issueKey || "N/A",
        hours: entry["Duration (decimal)"] as number,
        description,
      };
    })
    .filter((e) => e.issueKey !== "N/A");
}
