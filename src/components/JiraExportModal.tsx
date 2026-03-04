import { FC, useState, useCallback, useRef } from "react";
import { JiraCredential, TimeEntry, SubEntry, JiraExportEntry } from "../types";
import {
  exportWorklog,
  extractIssueKey,
  extractBracketComment,
  hasAzureAdProxy,
  getCachedAzureCookies,
  setAzureCookies,
} from "../utils/jiraApi";

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
  const [stats, setStats] = useState({ created: 0, updated: 0, fail: 0, total: 0 });
  const abortRef = useRef(false);

  // Azure AD cookie prompt state
  const [showCookiePrompt, setShowCookiePrompt] = useState(false);
  const [cookieInput, setCookieInput] = useState("");

  const validEntries = entries.filter((e) => extractIssueKey(e["Description"] as string));
  const invalidCount = entries.length - validEntries.length;

  const exportEntryCount = validEntries.reduce((count, entry) => {
    const subs = entry["_subEntries"] as SubEntry[] | undefined;
    if (subs && subs.length > 0) {
      return count + subs.filter((s) => extractIssueKey(s.description)).length;
    }
    return count + 1;
  }, 0);

  const prepareEntries = useCallback((): JiraExportEntry[] => {
    const result: JiraExportEntry[] = [];
    for (const entry of validEntries) {
      const subs = entry["_subEntries"] as SubEntry[] | undefined;
      if (subs && subs.length > 0) {
        for (const sub of subs) {
          const issueKey = extractIssueKey(sub.description);
          if (!issueKey) continue;
          result.push({
            date: entry["Start Date"] as string,
            issueKey,
            hours: sub.duration,
            description: sub.description,
            status: "pending" as const,
          });
        }
      } else {
        result.push({
          date: entry["Start Date"] as string,
          issueKey: extractIssueKey(entry["Description"] as string) || "N/A",
          hours: entry["Duration (decimal)"] as number,
          description: entry["Description"] as string,
          status: "pending" as const,
        });
      }
    }
    return result;
  }, [validEntries]);

  const runExport = async (credential: JiraCredential) => {
    abortRef.current = false;
    setIsExporting(true);

    const entriesToExport = prepareEntries();
    setExportEntries(entriesToExport);
    setStats({ created: 0, updated: 0, fail: 0, total: entriesToExport.length });

    let createdCount = 0;
    let updatedCount = 0;
    let failCount = 0;

    for (let i = 0; i < entriesToExport.length; i++) {
      if (abortRef.current) break;

      setExportEntries((prev) =>
        prev.map((e, idx) =>
          idx === i ? { ...e, status: "in_progress" } : e
        )
      );

      const exportEntry = entriesToExport[i];
      const timeEntry: TimeEntry = {
        "Project": projectName,
        "Description": exportEntry.description,
        "Start Date": exportEntry.date,
        "Duration (decimal)": exportEntry.hours,
      };

      const result = await exportWorklog({
        credential,
        entry: timeEntry,
        onProgress: setCurrentMessage,
      });

      if (result.success) {
        if (result.wasUpdated) {
          updatedCount++;
        } else {
          createdCount++;
        }
        setExportEntries((prev) =>
          prev.map((e, idx) =>
            idx === i ? { ...e, status: result.wasUpdated ? "updated" : "created" } : e
          )
        );
      } else {
        failCount++;
        setExportEntries((prev) =>
          prev.map((e, idx) =>
            idx === i ? { ...e, status: "error", error: result.error } : e
          )
        );

        // If Azure AD cookies expired, abort and re-prompt
        if (hasAzureAdProxy(credential) && !getCachedAzureCookies(credential.id)) {
          setCurrentMessage("");
          setIsExporting(false);
          setExportEntries([]);
          setShowCookiePrompt(true);
          return;
        }
      }

      setStats({ created: createdCount, updated: updatedCount, fail: failCount, total: entriesToExport.length });

      // Small delay to avoid rate limiting
      if (i < entriesToExport.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setCurrentMessage("");
    setIsExporting(false);
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
      ? Math.round(((stats.created + stats.updated + stats.fail) / stats.total) * 100)
      : 0;

  const isComplete = !isExporting && exportEntries.length > 0;
  const totalHours = validEntries.reduce(
    (sum, e) => sum + (e["Duration (decimal)"] as number),
    0
  );

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={!isExporting && !showCookiePrompt ? onClose : undefined}
    >
      <div
        className="bg-black text-white p-6 rounded-lg shadow-lg max-w-2xl w-full border border-white max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">
          Export to Jira/Tempo - {projectName}
        </h3>

        {/* Azure AD cookie prompt */}
        {showCookiePrompt && (
          <div className="mb-4">
            <p className="text-sm mb-3">
              Paste your Azure AD session cookies to authenticate:
            </p>
            <ol className="text-xs text-gray-400 mb-3 list-decimal list-inside space-y-1">
              <li>Open <a href={`https://${selectedCredential?.jiraDomain}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">{selectedCredential?.jiraDomain}</a> in your browser and log in</li>
              <li>Open DevTools (F12) &gt; Application &gt; Cookies</li>
              <li>Select the domain and copy all cookie values</li>
            </ol>
            <textarea
              value={cookieInput}
              onChange={(e) => setCookieInput(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 text-white border border-gray-600 rounded focus:border-white text-sm font-mono h-24 resize-none"
              placeholder='Paste JSON array from extension or "name=value; ..." string'
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setShowCookiePrompt(false)}
                className="px-4 py-2 text-white border border-gray-600 rounded hover:bg-gray-600 cursor-pointer text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCookieSubmit}
                disabled={!cookieInput.trim()}
                className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {!isExporting && exportEntries.length === 0 && !showCookiePrompt && (
          <>
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">
                Export {exportEntryCount} entries ({totalHours.toFixed(2)} hours) to{" "}
                {selectedCredential?.type === "apptime" ? "AppTime" : "Tempo"}.
                {invalidCount > 0 && (
                  <span className="text-yellow-400">
                    {" "}({invalidCount} entries without issue keys will be skipped)
                  </span>
                )}
              </p>
            </div>

            {credentials.length === 0 ? (
              <div className="mb-4">
                <p className="text-yellow-400 mb-2">
                  No Jira credentials configured.
                </p>
                <button
                  onClick={onManageCredentials}
                  className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer"
                >
                  Add Credentials
                </button>
              </div>
            ) : (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">
                  Select Jira Instance:
                </label>
                <select
                  value={selectedCredentialId}
                  onChange={(e) => setSelectedCredentialId(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
                >
                  {credentials.map((cred) => (
                    <option key={cred.id} value={cred.id}>
                      {cred.name} ({cred.jiraDomain}) [{cred.type === "apptime" ? "AppTime" : "Tempo"}]
                    </option>
                  ))}
                </select>
                {selectedCredential && (
                  <p className="text-xs text-gray-500 mt-1">
                    Exporting as {selectedCredential.jiraEmail}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-between gap-2">
              <button
                onClick={onManageCredentials}
                className="px-4 py-2 text-gray-400 border border-gray-600 rounded hover:bg-gray-800 cursor-pointer"
              >
                Manage Credentials
              </button>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-white border border-gray-600 rounded hover:bg-gray-600 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExport}
                  disabled={credentials.length === 0 || validEntries.length === 0}
                  className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Export
                </button>
              </div>
            </div>
          </>
        )}

        {(isExporting || exportEntries.length > 0) && (
          <>
            {/* Progress bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>
                  {isExporting ? "Exporting..." : "Export Complete"}
                </span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${
                    isComplete && stats.fail > 0
                      ? "bg-yellow-500"
                      : isComplete
                      ? "bg-green-500"
                      : "bg-blue-500"
                  }`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              {currentMessage && (
                <p className="text-xs text-gray-400 mt-1">{currentMessage}</p>
              )}
            </div>

            {/* Stats */}
            <div className="flex gap-4 mb-4 text-sm">
              <span className="text-green-400">
                Created: {stats.created}
              </span>
              <span className="text-yellow-400">
                Updated: {stats.updated}
              </span>
              <span className="text-red-400">
                Failed: {stats.fail}
              </span>
              <span className="text-gray-400">
                Total: {stats.total}
              </span>
            </div>

            {/* Entry list */}
            <div className="flex-1 overflow-y-auto mb-4 max-h-64 border border-gray-700 rounded">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-gray-900">
                  <tr className="text-left">
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Date</th>
                    <th className="p-2 font-medium">Issue</th>
                    <th className="p-2 font-medium">Description</th>
                    <th className="p-2 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {exportEntries.map((entry, idx) => (
                    <tr
                      key={idx}
                      className={`border-t border-gray-800 ${
                        entry.status === "error" ? "bg-red-900/20" : ""
                      }`}
                    >
                      <td className="p-2">
                        {entry.status === "pending" && (
                          <span className="text-gray-500">-</span>
                        )}
                        {entry.status === "in_progress" && (
                          <span className="text-blue-400 animate-pulse">...</span>
                        )}
                        {entry.status === "created" && (
                          <span className="text-green-400">NEW</span>
                        )}
                        {entry.status === "updated" && (
                          <span className="text-yellow-400">UPD</span>
                        )}
                        {entry.status === "error" && (
                          <span
                            className="text-red-400 cursor-help"
                            title={entry.error}
                          >
                            ERR
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-gray-400">{entry.date}</td>
                      <td className="p-2">{entry.issueKey}</td>
                      <td className="p-2 text-gray-400 truncate max-w-48">{extractBracketComment(entry.description)}</td>
                      <td className="p-2">{entry.hours.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              {isExporting ? (
                <button
                  onClick={handleAbort}
                  className="px-4 py-2 text-red-400 border border-red-400 rounded hover:bg-red-900 cursor-pointer"
                >
                  Abort
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
