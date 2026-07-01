import { proxyFetch } from "./proxy";

const CLOCKIFY_BASE = "https://api.clockify.me/api/v1";
const PAGE_SIZE = 1000;

interface ClockifyUser {
  id: string;
  activeWorkspace: string;
  defaultWorkspace: string;
  settings?: { timeZone?: string };
}

interface ClockifyProject {
  name?: string;
  clientName?: string;
}

interface ClockifyTimeEntry {
  id: string;
  description: string;
  timeInterval: {
    start: string | null;
    end: string | null;
    duration: string | null;
  };
  project?: ClockifyProject | null;
}

async function clockifyGet<T>(apiKey: string, path: string): Promise<T> {
  const response = await proxyFetch(`${CLOCKIFY_BASE}${path}`, {
    method: "GET",
    headers: {
      "X-Api-Key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    let message = `Clockify API error (HTTP ${response.status})`;
    if (response.status === 401) {
      message = "Clockify rejected the API key (401). Check the stored key.";
    } else {
      try {
        const data = await response.json();
        if (data?.message) message = `Clockify: ${data.message}`;
      } catch {
        // Keep default message
      }
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Unexpected response from Clockify (is the proxy running?)");
  }

  return response.json() as Promise<T>;
}

// Parse an ISO-8601 duration (e.g. "PT1H30M", "PT45M", "P1DT2H") into decimal hours.
function parseISODurationToHours(iso: string | null): number {
  if (!iso) return 0;
  const match = iso.match(
    /^P(?:(\d+(?:\.\d+)?)D)?T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/
  );
  if (!match) return 0;
  const days = parseFloat(match[1] || "0");
  const hours = parseFloat(match[2] || "0");
  const minutes = parseFloat(match[3] || "0");
  const seconds = parseFloat(match[4] || "0");
  return days * 24 + hours + minutes / 60 + seconds / 3600;
}

// Format an instant into DD/MM/YYYY and HH:MM:SS as seen in the given timezone,
// matching the columns Clockify uses in its detailed CSV report.
function formatInTimeZone(
  iso: string,
  timeZone: string
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));

  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value || "";

  // Intl can emit "24" for midnight with hour12:false — normalize to "00".
  let hour = get("hour");
  if (hour === "24") hour = "00";

  return {
    date: `${get("day")}/${get("month")}/${get("year")}`,
    time: `${hour}:${get("minute")}:${get("second")}`,
  };
}

// Fetch the current user's completed time entries for the given month and map
// them to the same row shape produced by the CSV parser, so the rest of the
// pipeline (groupAndMerge etc.) is unchanged. month is 1-12.
export async function fetchClockifyRows(
  apiKey: string,
  year: number,
  month: number
): Promise<Record<string, string>[]> {
  const user = await clockifyGet<ClockifyUser>(apiKey, "/user");
  const workspaceId = user.activeWorkspace || user.defaultWorkspace;
  if (!workspaceId || !user.id) {
    throw new Error("Could not determine Clockify workspace or user.");
  }
  const timeZone = user.settings?.timeZone || "UTC";

  // Query a UTC window one day wider than the month on each side so timezone
  // offsets near month boundaries don't drop entries; the exact month filter
  // (in the workspace timezone) is applied below.
  const rangeStart = new Date(Date.UTC(year, month - 1, 1));
  rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  const rangeEnd = new Date(Date.UTC(year, month, 1));
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const start = rangeStart.toISOString().replace(/\.\d{3}Z$/, "Z");
  const end = rangeEnd.toISOString().replace(/\.\d{3}Z$/, "Z");

  const entries: ClockifyTimeEntry[] = [];
  for (let page = 1; ; page++) {
    const path =
      `/workspaces/${workspaceId}/user/${user.id}/time-entries` +
      `?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` +
      `&hydrated=true&page-size=${PAGE_SIZE}&page=${page}`;
    const batch = await clockifyGet<ClockifyTimeEntry[]>(apiKey, path);
    entries.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const rows: Record<string, string>[] = [];
  for (const entry of entries) {
    const interval = entry.timeInterval;
    // Skip running timers (no end/duration) — they have no countable hours.
    if (!interval?.start || !interval.end) continue;

    const { date, time } = formatInTimeZone(interval.start, timeZone);
    const [, mm, yyyy] = date.split("/");
    if (parseInt(yyyy, 10) !== year || parseInt(mm, 10) !== month) continue;

    rows.push({
      Project: entry.project?.name || "",
      Client: entry.project?.clientName || "",
      Description: entry.description || "",
      "Start Date": date,
      "Start Time": time,
      "Duration (decimal)": parseISODurationToHours(interval.duration).toFixed(4),
    });
  }

  return rows;
}
