import { FC, useState, useCallback, useRef } from "react";
import { JiraCredential, TimeEntry, SubEntry, JiraExportEntry } from "../types";
import { Modal } from "./Modal";
import {
  exportWorklog,
  prepareExportContext,
  extractIssueKey,
  extractBracketComment,
  hasAzureAdProxy,
  getCachedAzureCookies,
  setAzureCookies,
  ExportWorklogResult,
} from "../utils/jiraApi";

const CONCURRENCY = 4;

interface JiraExportModalProps {
  credentials: JiraCredential[];
  entries: TimeEntry[];
  projectName: string;
  onClose: () => void;
  onManageCredentials: () => void;
}

export const JiraExportModal: FC<JiraExportModalProps> = ({
  credentials,
  entries,
  projectName,
  onClose,
  onManageCredentials,
}) => {
  const [selectedCredentialId, setSelectedCredentialId] = useState<string>(
    (credentials.find((c) => c.name.toLowerCase() === projectName.toLowerCase()) || credentials[0])?.id || ""
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportEntries, setExportEntries] = useState<JiraExportEntry[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string>("");
  const [stats, setStats] = useState({ created: 0, updated: 0, skipped: 0, fail: 0, total: 0 });
  const abortRef = useRef(false);

  // Azure AD cookie prompt state
  const [showCookiePrompt, setShowCookiePrompt] = useState(false);
  const [cookieInput, setCookieInput] = useState("");

  const validEntries = entries.filter((e) => extractIssueKey(e["Description"] as string));
  const invalidCount = entries.length - validEntries.length;

  const prepareEntries = useCallback((): JiraExportEntry[] => {
    // First collect all individual entries
    const raw: { date: string; startTime: string; issueKey: string; hours: number; description: string }[] = [];
    for (const entry of validEntries) {
      const subs = entry["_subEntries"] as SubEntry[] | undefined;
      if (subs && subs.length > 0) {
        for (const sub of subs) {
          const issueKey = extractIssueKey(sub.description);
          if (!issueKey) continue;
          raw.push({
            date: entry["Start Date"] as string,
            startTime: sub.startTime || "",
            issueKey,
            hours: sub.duration,
            description: sub.description,
          });
        }
      } else {
        const issueKey = extractIssueKey(entry["Description"] as string);
        if (!issueKey) continue;
        raw.push({
          date: entry["Start Date"] as string,
          startTime: (entry["Start Time"] as string) || "",
          issueKey,
          hours: entry["Duration (decimal)"] as number,
          description: entry["Description"] as string,
        });
      }
    }

    // Sort by ascending start time so concatenated descriptions follow chronological order.
    // Items in the same (issueKey, date) group share a date, so startTime alone orders them.
    raw.sort((a, b) => a.startTime.localeCompare(b.startTime));

    // Group by issueKey + date, sum hours, concatenate descriptions with ";"
    const grouped = new Map<string, { date: string; issueKey: string; hours: number; descriptions: string[]; earliestStartTime: string }>();
    for (const item of raw) {
      const key = `${item.issueKey}::${item.date}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.hours += item.hours;
        const desc = extractBracketComment(item.description);
        if (desc && !existing.descriptions.includes(desc)) {
          existing.descriptions.push(desc);
        }
      } else {
        const desc = extractBracketComment(item.description);
        grouped.set(key, {
          date: item.date,
          issueKey: item.issueKey,
          hours: item.hours,
          descriptions: desc ? [desc] : [],
          earliestStartTime: item.startTime,
        });
      }
    }

    // Sort export rows by date ascending so Jira insertion follows chronological order
    const parseDate = (s: string) => {
      const [d, m, y] = s.split("/").map(Number);
      return new Date(y, m - 1, d).getTime();
    };

    return Array.from(grouped.values())
      .sort((a, b) => {
        const dateDiff = parseDate(a.date) - parseDate(b.date);
        if (dateDiff !== 0) return dateDiff;
        return a.earliestStartTime.localeCompare(b.earliestStartTime);
      })
      .map((g) => ({
        date: g.date,
        issueKey: g.issueKey,
        hours: g.hours,
        description: g.descriptions.join("; "),
        status: "pending" as const,
      }));
  }, [validEntries]);

  const exportEntryCount = prepareEntries().length;

  const runExport = async (credential: JiraCredential) => {
    abortRef.current = false;
    setIsExporting(true);

    const entriesToExport = prepareEntries();
    setExportEntries(entriesToExport);
    setStats({ created: 0, updated: 0, skipped: 0, fail: 0, total: entriesToExport.length });

    const repromptForCookies = () => {
      setCurrentMessage("");
      setExportEntries([]);
      setShowCookiePrompt(true);
    };

    try {
      // Phase 1: fetch existing worklogs (and issue IDs) up front, in parallel
      setCurrentMessage("Fetching existing worklogs...");
      const context = await prepareExportContext(
        credential,
        entriesToExport.map((e) => ({ issueKey: e.issueKey, date: e.date }))
      );

      // Azure AD cookies may have expired during prefetch
      if (hasAzureAdProxy(credential) && !getCachedAzureCookies(credential.id)) {
        repromptForCookies();
        return;
      }

      // Phase 2: export with bounded concurrency
      setCurrentMessage(`Exporting ${entriesToExport.length} worklogs...`);

      let createdCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;
      let failCount = 0;
      let authExpired = false;
      let nextIndex = 0;

      const setRowStatus = (idx: number, patch: Partial<JiraExportEntry>) =>
        setExportEntries((prev) =>
          prev.map((e, i) => (i === idx ? { ...e, ...patch } : e))
        );

      const worker = async () => {
        while (!abortRef.current && !authExpired) {
          const i = nextIndex++;
          if (i >= entriesToExport.length) return;

          const exportEntry = entriesToExport[i];
          setRowStatus(i, { status: "in_progress" });

          // exportWorklog is written to resolve (never throw) on network
          // failure, but guard anyway so one bad entry can't abort the run.
          let result: ExportWorklogResult;
          try {
            result = await exportWorklog({
              credential,
              issueKey: exportEntry.issueKey,
              date: exportEntry.date,
              hours: exportEntry.hours,
              comment: exportEntry.description,
              context,
            });
          } catch (err) {
            result = {
              success: false,
              error: err instanceof Error ? err.message : "Unexpected error",
              issueKey: exportEntry.issueKey,
            };
          }

          if (result.success) {
            if (result.wasSkipped) {
              skippedCount++;
              setRowStatus(i, { status: "skipped" });
            } else if (result.wasUpdated) {
              updatedCount++;
              setRowStatus(i, { status: "updated" });
            } else {
              createdCount++;
              setRowStatus(i, { status: "created" });
            }
          } else {
            failCount++;
            setRowStatus(i, { status: "error", error: result.error });

            // If Azure AD cookies expired, stop launching new work and re-prompt
            if (hasAzureAdProxy(credential) && !getCachedAzureCookies(credential.id)) {
              authExpired = true;
            }
          }

          setStats({
            created: createdCount,
            updated: updatedCount,
            skipped: skippedCount,
            fail: failCount,
            total: entriesToExport.length,
          });
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, entriesToExport.length) }, worker)
      );

      // Azure AD session expired mid-export — re-prompt for cookies
      if (authExpired) {
        repromptForCookies();
        return;
      }

      setCurrentMessage("");
    } catch (err) {
      // Last-resort guard: nothing above should throw, but never leave the
      // modal stuck in the exporting state if something unexpected does.
      setCurrentMessage(
        err instanceof Error ? err.message : "Export failed unexpectedly."
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleExport = async () => {
    const credential = credentials.find((c) => c.id === selectedCredentialId);
    if (!credential) return;

    // If Azure AD proxy is configured and no cached cookies, prompt for cookies
    if (hasAzureAdProxy(credential) && !getCachedAzureCookies(credential.id)) {
      setShowCookiePrompt(true);
      return;
    }

    await runExport(credential);
  };

  const parseCookieInput = (input: string): string => {
    const trimmed = input.trim();
    if (trimmed.startsWith("[")) {
      try {
        const cookies = JSON.parse(trimmed) as { name: string; value: string }[];
        return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      } catch {
        // Fall through to raw string
      }
    }
    return trimmed;
  };

  const handleCookieSubmit = async () => {
    const credential = credentials.find((c) => c.id === selectedCredentialId);
    if (!credential || !cookieInput.trim()) return;

    setAzureCookies(credential.id, parseCookieInput(cookieInput));
    setShowCookiePrompt(false);
    await runExport(credential);
  };

  const handleAbort = () => {
    abortRef.current = true;
  };

  const selectedCredential = credentials.find(
    (c) => c.id === selectedCredentialId
  );

  const progressPercent =
    stats.total > 0
      ? Math.round(
          ((stats.created + stats.updated + stats.skipped + stats.fail) /
            stats.total) *
            100
        )
      : 0;

  const isComplete = !isExporting && exportEntries.length > 0;
  const totalHours = validEntries.reduce(
    (sum, e) => sum + (e["Duration (decimal)"] as number),
    0
  );

  const barColor = isComplete
    ? stats.fail > 0
      ? "var(--warning)"
      : "var(--success)"
    : "var(--accent)";

  const statusBadge = (status: JiraExportEntry["status"], error?: string) => {
    switch (status) {
      case "in_progress":
        return <span className="badge badge-info animate-pulse">RUN</span>;
      case "created":
        return <span className="badge badge-success">NEW</span>;
      case "updated":
        return <span className="badge badge-warning">UPD</span>;
      case "skipped":
        return (
          <span className="badge badge-muted" title="Already up to date">
            SKIP
          </span>
        );
      case "error":
        return (
          <span className="badge badge-danger cursor-help" title={error}>
            ERR
          </span>
        );
      default:
        return <span className="text-[var(--text-faint)]">—</span>;
    }
  };

  return (
    <Modal
      title={`Export to Jira · ${projectName}`}
      onClose={isExporting || showCookiePrompt ? undefined : onClose}
      size="lg"
    >
      {/* Azure AD cookie prompt */}
      {showCookiePrompt && (
        <div>
          <p className="mb-3 text-sm">
            Paste your Azure AD session cookies to authenticate:
          </p>
          <ol className="mb-3 list-inside list-decimal space-y-1 text-xs text-[var(--text-muted)]">
            <li>
              Open{" "}
              <a
                href={`https://${selectedCredential?.jiraDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--info)] underline"
              >
                {selectedCredential?.jiraDomain}
              </a>{" "}
              in your browser and log in
            </li>
            <li>Open DevTools (F12) &gt; Application &gt; Cookies</li>
            <li>Select the domain and copy all cookie values</li>
          </ol>
          <textarea
            value={cookieInput}
            onChange={(e) => setCookieInput(e.target.value)}
            className="control h-24 w-full resize-none font-mono"
            placeholder='Paste JSON array from extension or "name=value; ..." string'
            autoFocus
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setShowCookiePrompt(false)}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleCookieSubmit}
              disabled={!cookieInput.trim()}
              className="btn btn-primary"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {!isExporting && exportEntries.length === 0 && !showCookiePrompt && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--text-muted)]">
            Export <b className="text-[var(--text)]">{exportEntryCount}</b> entries
            ({totalHours.toFixed(2)} hours) to{" "}
            {selectedCredential?.type === "apptime" ? "AppTime" : "Tempo"}.
            {invalidCount > 0 && (
              <span className="text-[var(--warning)]">
                {" "}
                {invalidCount} without issue keys will be skipped.
              </span>
            )}
          </p>

          {credentials.length === 0 ? (
            <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="mb-3 text-sm text-[var(--warning)]">
                No Jira credentials configured.
              </p>
              <button onClick={onManageCredentials} className="btn btn-primary">
                Add credentials
              </button>
            </div>
          ) : (
            <div>
              <label className="label">Jira instance</label>
              <select
                value={selectedCredentialId}
                onChange={(e) => setSelectedCredentialId(e.target.value)}
                className="control w-full"
              >
                {credentials.map((cred) => (
                  <option key={cred.id} value={cred.id}>
                    {cred.name} ({cred.jiraDomain}) [
                    {cred.type === "apptime" ? "AppTime" : "Tempo"}]
                  </option>
                ))}
              </select>
              {selectedCredential && (
                <p className="mt-1.5 text-xs text-[var(--text-faint)]">
                  Exporting as {selectedCredential.jiraEmail}
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <button onClick={onManageCredentials} className="btn btn-ghost">
              Manage connections
            </button>
            <div className="flex gap-2">
              <button onClick={onClose} className="btn btn-secondary">
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={credentials.length === 0 || validEntries.length === 0}
                className="btn btn-primary"
              >
                Start export
              </button>
            </div>
          </div>
        </div>
      )}

      {(isExporting || exportEntries.length > 0) && (
        <div>
          {/* Progress */}
          <div className="mb-4">
            <div className="mb-1.5 flex justify-between text-sm">
              <span>{isExporting ? "Exporting…" : "Export complete"}</span>
              <span className="num text-[var(--text-muted)]">{progressPercent}%</span>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progressPercent}%`, background: barColor }}
              />
            </div>
            {currentMessage && (
              <p className="mt-1.5 text-xs text-[var(--text-faint)]">{currentMessage}</p>
            )}
          </div>

          {/* Stats */}
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <span className="badge badge-success">Created {stats.created}</span>
            <span className="badge badge-warning">Updated {stats.updated}</span>
            <span className="badge badge-muted">Skipped {stats.skipped}</span>
            <span className="badge badge-danger">Failed {stats.fail}</span>
            <span className="badge badge-muted">Total {stats.total}</span>
          </div>

          {/* Entry list */}
          <div className="mb-4 max-h-64 overflow-y-auto rounded-[var(--radius-sm)] border border-[var(--border)]">
            <table className="data-table">
              <thead className="sticky top-0 bg-[var(--surface-2)]">
                <tr>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Issue</th>
                  <th>Description</th>
                  <th className="text-right">Hours</th>
                </tr>
              </thead>
              <tbody>
                {exportEntries.map((entry, idx) => (
                  <tr key={idx}>
                    <td>{statusBadge(entry.status, entry.error)}</td>
                    <td className="num whitespace-nowrap text-[var(--text-muted)]">
                      {entry.date}
                    </td>
                    <td className="whitespace-nowrap">{entry.issueKey}</td>
                    <td className="max-w-48 truncate text-[var(--text-muted)]">
                      {entry.description}
                    </td>
                    <td className="num text-right">{entry.hours.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex justify-end">
            {isExporting ? (
              <button onClick={handleAbort} className="btn btn-danger">
                Abort
              </button>
            ) : (
              <button onClick={onClose} className="btn btn-primary">
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
};
