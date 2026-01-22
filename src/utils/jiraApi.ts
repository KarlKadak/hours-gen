import { JiraCredential, TimeEntry } from "../types";

export function extractIssueKey(description: string): string | null {
  const match = description.match(/^([A-Z]+-\d+)/);
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

  const response = await fetch(
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
}

export async function createTempoWorklog(
  credential: JiraCredential,
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

  const response = await fetch("https://api.tempo.io/4/worklogs", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential.tempoApiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (response.ok) {
    return { success: true };
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

  const date = entry["Start Date"] as string;
  const hours = entry["Duration (decimal)"] as number;
  const seconds = hoursToSeconds(hours);

  const result = await createTempoWorklog(
    credential,
    issueId,
    date,
    seconds,
    description
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
