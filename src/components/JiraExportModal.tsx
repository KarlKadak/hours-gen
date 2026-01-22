import { FC, useState, useCallback, useRef } from "react";
import { JiraCredential, TimeEntry, JiraExportEntry } from "../types";
import { exportWorklog, extractIssueKey } from "../utils/jiraApi";

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
    credentials[0]?.id || ""
  );
  const [isExporting, setIsExporting] = useState(false);
  const [exportEntries, setExportEntries] = useState<JiraExportEntry[]>([]);
  const [currentMessage, setCurrentMessage] = useState<string>("");
  const [stats, setStats] = useState({ success: 0, fail: 0, total: 0 });
  const abortRef = useRef(false);

  const validEntries = entries.filter((e) => extractIssueKey(e["Description"] as string));
  const invalidCount = entries.length - validEntries.length;

  const prepareEntries = useCallback((): JiraExportEntry[] => {
    return validEntries.map((entry) => ({
      date: entry["Start Date"] as string,
      issueKey: extractIssueKey(entry["Description"] as string) || "N/A",
      hours: entry["Duration (decimal)"] as number,
      description: entry["Description"] as string,
      status: "pending" as const,
    }));
  }, [validEntries]);

  const handleExport = async () => {
    const credential = credentials.find((c) => c.id === selectedCredentialId);
    if (!credential) return;

    abortRef.current = false;
    setIsExporting(true);

    const entriesToExport = prepareEntries();
    setExportEntries(entriesToExport);
    setStats({ success: 0, fail: 0, total: entriesToExport.length });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < entriesToExport.length; i++) {
      if (abortRef.current) break;

      setExportEntries((prev) =>
        prev.map((e, idx) =>
          idx === i ? { ...e, status: "in_progress" } : e
        )
      );

      const timeEntry = validEntries[i];

      const result = await exportWorklog({
        credential,
        entry: timeEntry,
        onProgress: setCurrentMessage,
      });

      if (result.success) {
        successCount++;
        setExportEntries((prev) =>
          prev.map((e, idx) =>
            idx === i ? { ...e, status: "success" } : e
          )
        );
      } else {
        failCount++;
        setExportEntries((prev) =>
          prev.map((e, idx) =>
            idx === i ? { ...e, status: "error", error: result.error } : e
          )
        );
      }

      setStats({ success: successCount, fail: failCount, total: entriesToExport.length });

      // Small delay to avoid rate limiting
      if (i < entriesToExport.length - 1 && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
    }

    setCurrentMessage("");
    setIsExporting(false);
  };

  const handleAbort = () => {
    abortRef.current = true;
  };

  const selectedCredential = credentials.find(
    (c) => c.id === selectedCredentialId
  );

  const progressPercent =
    stats.total > 0
      ? Math.round(((stats.success + stats.fail) / stats.total) * 100)
      : 0;

  const isComplete = !isExporting && exportEntries.length > 0;
  const totalHours = validEntries.reduce(
    (sum, e) => sum + (e["Duration (decimal)"] as number),
    0
  );

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={!isExporting ? onClose : undefined}
    >
      <div
        className="bg-black text-white p-6 rounded-lg shadow-lg max-w-2xl w-full border border-white max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">
          Export to Jira/Tempo - {projectName}
        </h3>

        {!isExporting && exportEntries.length === 0 && (
          <>
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-2">
                Export {validEntries.length} entries ({totalHours.toFixed(2)} hours) to Tempo.
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
                      {cred.name} ({cred.jiraDomain})
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
                Success: {stats.success}
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
                        {entry.status === "success" && (
                          <span className="text-green-400">OK</span>
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
