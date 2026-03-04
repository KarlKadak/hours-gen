import { JiraCredential, TimeEntry } from "../types";

const PROXY_URL = "https://hours-api.karl-ccd.workers.dev/";

// Session-level Azure AD cookie cache (keyed by credential ID)
const azureCookieCache: Record<string, string> = {};

export function hasAzureAdProxy(credential: JiraCredential): boolean {
  return !!credential.azureAdProxy;
}

export function getCachedAzureCookies(credentialId: string): string | null {
  return azureCookieCache[credentialId] || null;
}

export function setAzureCookies(credentialId: string, cookies: string): void {
  azureCookieCache[credentialId] = cookies;
}

function clearAzureCookies(credentialId: string): void {
  delete azureCookieCache[credentialId];
}

function getAppTimeAuthHeaders(credential: JiraCredential): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Atlassian-Token": "no-check",
  };

  if (credential.azureAdProxy) {
    const cookies = azureCookieCache[credential.id];
    if (cookies) {
      headers["x-forward-cookies"] = cookies;
    }
  }

  // Always include Basic auth - Azure AD App Proxy passes it to the backend
  const auth = btoa(`${credential.jiraEmail}:${credential.jiraApiToken}`);
  headers["Authorization"] = `Basic ${auth}`;

  return headers;
}

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

export function extractBracketComment(text: string): string {
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
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return null;
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

interface JiraWorklog {
  id: string;
  author: {
    accountId: string;
    name?: string;
    emailAddress?: string;
  };
  timeSpentSeconds: number;
  started: string;
  comment?: unknown;
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
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) return [];
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
  // Check for existing worklog for this issue+description on this date
  const existingWorklogs = await getExistingWorklogs(credential, date);
  const existingWorklog = existingWorklogs.find(
    (w) => w.issue.id === issueId && (w.description || "") === description
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

// --- AppTime (native Jira worklog) functions ---

function jiraApiVersion(credential: JiraCredential): string {
  return credential.azureAdProxy ? "2" : "3";
}

async function getExistingJiraWorklogs(
  credential: JiraCredential,
  issueKey: string,
  date: string
): Promise<JiraWorklog[]> {
  const authHeaders = getAppTimeAuthHeaders(credential);
  const apiVersion = jiraApiVersion(credential);

  const response = await proxyFetch(
    `https://${credential.jiraDomain}/rest/api/${apiVersion}/issue/${issueKey}/worklog`,
    {
      method: "GET",
      headers: authHeaders,
    }
  );

  if (!response.ok) {
    if (credential.azureAdProxy) clearAzureCookies(credential.id);
    return [];
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    if (credential.azureAdProxy) clearAzureCookies(credential.id);
    return [];
  }

  const data = await response.json();
  const worklogs: JiraWorklog[] = data.worklogs || [];

  // Filter by author and date
  // v2 (Jira Server) uses author.emailAddress, v3 (Jira Cloud) uses author.accountId
  return worklogs.filter((w) => {
    const matchesAuthor = credential.azureAdProxy
      ? w.author.emailAddress === credential.jiraEmail
      : w.author.accountId === credential.atlassianAccountId;
    const worklogDate = w.started.slice(0, 10); // "YYYY-MM-DD"
    return matchesAuthor && worklogDate === date;
  });
}

function extractAdfText(adf: unknown): string {
  if (!adf || typeof adf !== "object") return "";
  const doc = adf as { content?: { content?: { text?: string }[] }[] };
  return (doc.content || [])
    .flatMap((block) => (block.content || []).map((node) => node.text || ""))
    .join("")
    .trim();
}

function makeAdfComment(text: string): object {
  if (!text) {
    return {
      version: 1,
      type: "doc",
      content: [],
    };
  }
  return {
    version: 1,
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text }],
      },
    ],
  };
}

function extractWorklogComment(credential: JiraCredential, comment: unknown): string {
  if (credential.azureAdProxy) {
    // v2: comment is a plain string
    return typeof comment === "string" ? comment : "";
  }
  // v3: comment is ADF
  return extractAdfText(comment);
}

function makeWorklogComment(credential: JiraCredential, text: string): unknown {
  if (credential.azureAdProxy) {
    // v2: plain string
    return text;
  }
  // v3: ADF
  return makeAdfComment(text);
}

async function createJiraWorklog(
  credential: JiraCredential,
  issueKey: string,
  date: string,
  seconds: number,
  comment: string = ""
): Promise<CreateWorklogResult> {
  // Check for existing worklog for this issue+comment on this date
  const existing = await getExistingJiraWorklogs(credential, issueKey, date);
  const matchingWorklog = existing.find(
    (w) => extractWorklogComment(credential, w.comment) === comment
  );

  if (matchingWorklog) {
    return updateJiraWorklog(
      credential,
      issueKey,
      matchingWorklog.id,
      date,
      seconds,
      comment
    );
  }

  const authHeaders = getAppTimeAuthHeaders(credential);
  const apiVersion = jiraApiVersion(credential);
  const payload = {
    timeSpentSeconds: seconds,
    started: `${date}T09:00:00.000+0000`,
    comment: makeWorklogComment(credential, comment),
  };

  const response = await proxyFetch(
    `https://${credential.jiraDomain}/rest/api/${apiVersion}/issue/${issueKey}/worklog`,
    {
      method: "POST",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (response.ok) {
    return { success: true, wasUpdated: false };
  }

  const ct = response.headers.get("content-type") || "";
  if (credential.azureAdProxy && !ct.includes("application/json")) {
    clearAzureCookies(credential.id);
    return { success: false, error: "Azure AD session expired — re-export to re-authenticate" };
  }

  let errorMsg = `HTTP ${response.status}`;
  try {
    const data = await response.json();
    errorMsg =
      data.errorMessages?.[0] || JSON.stringify(data).slice(0, 100);
  } catch {
    // Keep default error message
  }

  return { success: false, error: errorMsg };
}

async function updateJiraWorklog(
  credential: JiraCredential,
  issueKey: string,
  worklogId: string,
  date: string,
  seconds: number,
  comment: string = ""
): Promise<CreateWorklogResult> {
  const authHeaders = getAppTimeAuthHeaders(credential);
  const apiVersion = jiraApiVersion(credential);

  const payload = {
    timeSpentSeconds: seconds,
    started: `${date}T09:00:00.000+0000`,
    comment: makeWorklogComment(credential, comment),
  };

  const response = await proxyFetch(
    `https://${credential.jiraDomain}/rest/api/${apiVersion}/issue/${issueKey}/worklog/${worklogId}`,
    {
      method: "PUT",
      headers: {
        ...authHeaders,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    }
  );

  if (response.ok) {
    return { success: true, wasUpdated: true };
  }

  const ct = response.headers.get("content-type") || "";
  if (credential.azureAdProxy && !ct.includes("application/json")) {
    clearAzureCookies(credential.id);
    return { success: false, error: "Azure AD session expired — re-export to re-authenticate" };
  }

  let errorMsg = `HTTP ${response.status}`;
  try {
    const data = await response.json();
    errorMsg =
      data.errorMessages?.[0] || JSON.stringify(data).slice(0, 100);
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

  const date = toISODate(entry["Start Date"] as string);
  const hours = entry["Duration (decimal)"] as number;
  const seconds = hoursToSeconds(hours);
  const comment = extractBracketComment(description);

  if (credential.type === "apptime") {
    onProgress?.(`Creating worklog for ${issueKey}...`);

    const result = await createJiraWorklog(
      credential,
      issueKey,
      date,
      seconds,
      comment
    );

    return { ...result, issueKey };
  }

  // Default: Tempo flow
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
