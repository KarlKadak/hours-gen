import { JiraCredential, TimeEntry } from "../types";

const LOCAL_PROXY_URL = "http://localhost:9876";

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

  return fetch(LOCAL_PROXY_URL, {
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

// Extract plain text from a worklog comment, which may be a plain string
// (Jira v2 / Tempo) or an ADF document object (Jira v3). Used to compare an
// existing worklog's comment against what we would write.
function worklogCommentText(comment: unknown): string {
  if (!comment) return "";
  if (typeof comment === "string") return comment.trim();
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const obj = node as { text?: unknown; content?: unknown };
    if (typeof obj.text === "string") parts.push(obj.text);
    if (Array.isArray(obj.content)) obj.content.forEach(walk);
  };
  walk(comment);
  return parts.join("").trim();
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
  wasSkipped?: boolean;
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

async function deleteTempoWorklog(
  credential: JiraCredential,
  worklogId: number
): Promise<boolean> {
  const response = await proxyFetch(
    `https://api.tempo.io/4/worklogs/${worklogId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${credential.tempoApiToken}`,
      },
    }
  );
  return response.ok;
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

async function applyTempoWorklog(
  credential: JiraCredential,
  issueId: number,
  date: string,
  seconds: number,
  description: string,
  matchingWorklogs: TempoWorklog[]
): Promise<CreateWorklogResult> {
  // Skip when the only existing worklog already holds identical data
  if (
    matchingWorklogs.length === 1 &&
    matchingWorklogs[0].timeSpentSeconds === seconds &&
    (matchingWorklogs[0].description ?? "").trim() === description.trim()
  ) {
    return { success: true, wasSkipped: true };
  }

  if (matchingWorklogs.length > 0) {
    // Keep the first one, delete the rest
    const [toKeep, ...toDelete] = matchingWorklogs;
    for (const wl of toDelete) {
      await deleteTempoWorklog(credential, wl.tempoWorklogId);
    }
    // Update the remaining worklog
    return updateTempoWorklog(
      credential,
      toKeep.tempoWorklogId,
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
  issueKey: string
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

  // Filter by author only; date filtering happens at export-decision time.
  // v2 (Jira Server) uses author.emailAddress, v3 (Jira Cloud) uses author.accountId
  return worklogs.filter((w) =>
    credential.azureAdProxy
      ? w.author.emailAddress === credential.jiraEmail
      : w.author.accountId === credential.atlassianAccountId
  );
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

function makeWorklogComment(credential: JiraCredential, text: string): unknown {
  if (credential.azureAdProxy) {
    // v2: plain string
    return text;
  }
  // v3: ADF
  return makeAdfComment(text);
}

async function applyJiraWorklog(
  credential: JiraCredential,
  issueKey: string,
  date: string,
  seconds: number,
  comment: string,
  existing: JiraWorklog[]
): Promise<CreateWorklogResult> {
  // Skip when the only existing worklog already holds identical data
  if (
    existing.length === 1 &&
    existing[0].timeSpentSeconds === seconds &&
    worklogCommentText(existing[0].comment) === comment.trim()
  ) {
    return { success: true, wasSkipped: true };
  }

  if (existing.length > 0) {
    // Keep the first one, delete the rest
    const [toKeep, ...toDelete] = existing;
    for (const wl of toDelete) {
      await deleteJiraWorklog(credential, issueKey, wl.id);
    }
    // Update the remaining worklog
    return updateJiraWorklog(
      credential,
      issueKey,
      toKeep.id,
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

  const ct = response.headers.get("content-type") || "";
  if (credential.azureAdProxy && !ct.includes("application/json")) {
    clearAzureCookies(credential.id);
    return { success: false, error: "Azure AD session expired — re-export to re-authenticate" };
  }

  if (response.ok) {
    return { success: true, wasUpdated: false };
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

async function deleteJiraWorklog(
  credential: JiraCredential,
  issueKey: string,
  worklogId: string
): Promise<boolean> {
  const authHeaders = getAppTimeAuthHeaders(credential);
  const apiVersion = jiraApiVersion(credential);

  const response = await proxyFetch(
    `https://${credential.jiraDomain}/rest/api/${apiVersion}/issue/${issueKey}/worklog/${worklogId}`,
    {
      method: "DELETE",
      headers: authHeaders,
    }
  );
  return response.ok;
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

  const ct = response.headers.get("content-type") || "";
  if (credential.azureAdProxy && !ct.includes("application/json")) {
    clearAzureCookies(credential.id);
    return { success: false, error: "Azure AD session expired — re-export to re-authenticate" };
  }

  if (response.ok) {
    return { success: true, wasUpdated: true };
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
  issueKey: string;
  date: string;
  hours: number;
  comment: string;
  onProgress?: (message: string) => void;
}

export interface ExportWorklogResult {
  success: boolean;
  error?: string;
  issueKey: string;
  wasUpdated?: boolean;
  wasSkipped?: boolean;
}

// Pre-fetched existing-worklog data, gathered once before the export loop so
// each entry can decide create/update/skip locally without its own GET.
export interface TempoExportContext {
  type: "tempo";
  worklogsByDate: Map<string, TempoWorklog[]>; // keyed by ISO date (YYYY-MM-DD)
  issueIds: Map<string, number>; // issueKey -> Jira issue id (absent if lookup failed)
}

export interface AppTimeExportContext {
  type: "apptime";
  worklogsByIssue: Map<string, JiraWorklog[]>; // author-filtered, all dates
}

export type ExportContext = TempoExportContext | AppTimeExportContext;

const issueIdCache: Record<string, Record<string, number>> = {};

// Fetch everything the export needs up front. Calls run in parallel: one per
// unique date (Tempo) or unique issue (AppTime), plus issue-id resolution.
export async function prepareExportContext(
  credential: JiraCredential,
  entries: { issueKey: string; date: string }[]
): Promise<ExportContext> {
  const issueKeys = [...new Set(entries.map((e) => e.issueKey))];

  if (credential.type === "apptime") {
    const worklogsByIssue = new Map<string, JiraWorklog[]>();
    await Promise.all(
      issueKeys.map(async (key) => {
        worklogsByIssue.set(key, await getExistingJiraWorklogs(credential, key));
      })
    );
    return { type: "apptime", worklogsByIssue };
  }

  // Tempo: fetch user worklogs per unique date and resolve issue ids
  const cacheKey = credential.jiraDomain;
  if (!issueIdCache[cacheKey]) issueIdCache[cacheKey] = {};

  const isoDates = [...new Set(entries.map((e) => toISODate(e.date)))];
  const worklogsByDate = new Map<string, TempoWorklog[]>();
  const issueIds = new Map<string, number>();

  await Promise.all([
    ...isoDates.map(async (isoDate) => {
      worklogsByDate.set(isoDate, await getExistingWorklogs(credential, isoDate));
    }),
    ...issueKeys.map(async (key) => {
      const cached = issueIdCache[cacheKey][key];
      const id = cached ?? (await getJiraIssueId(credential, key));
      if (id) {
        issueIdCache[cacheKey][key] = id;
        issueIds.set(key, id);
      }
    }),
  ]);

  return { type: "tempo", worklogsByDate, issueIds };
}

export interface ExportWorklogParamsWithContext extends ExportWorklogParams {
  context: ExportContext;
}

export async function exportWorklog({
  credential,
  issueKey,
  date,
  hours,
  comment,
  context,
  onProgress,
}: ExportWorklogParamsWithContext): Promise<ExportWorklogResult> {
  const isoDate = toISODate(date);
  const seconds = hoursToSeconds(hours);

  if (context.type === "apptime") {
    onProgress?.(`Exporting worklog for ${issueKey}...`);

    const all = context.worklogsByIssue.get(issueKey) ?? [];
    const matching = all.filter((w) => w.started.slice(0, 10) === isoDate);

    const result = await applyJiraWorklog(
      credential,
      issueKey,
      isoDate,
      seconds,
      comment,
      matching
    );

    return { ...result, issueKey };
  }

  // Tempo flow
  const issueId = context.issueIds.get(issueKey);
  if (!issueId) {
    return {
      success: false,
      error: `Failed to get issue ID for ${issueKey}`,
      issueKey,
    };
  }

  onProgress?.(`Exporting worklog for ${issueKey}...`);

  const matching = (context.worklogsByDate.get(isoDate) ?? []).filter(
    (w) => w.issue.id === issueId
  );

  const result = await applyTempoWorklog(
    credential,
    issueId,
    isoDate,
    seconds,
    comment,
    matching
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
