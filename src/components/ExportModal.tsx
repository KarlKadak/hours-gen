import { FC } from "react";
import { ProjectExportData } from "../types";
import { Modal } from "./Modal";

interface ExportModalProps {
  exportData: Record<string, ProjectExportData>;
  setExportData: (
    data:
      | Record<string, ProjectExportData>
      | ((prev: Record<string, ProjectExportData>) => Record<string, ProjectExportData>)
  ) => void;
  onClose: () => void;
  onExport: () => void;
}

export const ExportModal: FC<ExportModalProps> = ({
  exportData,
  setExportData,
  onClose,
  onExport,
}) => {
  return (
    <Modal
      title="Configure CSV export"
      onClose={onClose}
      size="md"
      footer={
        <div className="flex w-full justify-end gap-2">
          <button onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>
          <button onClick={onExport} className="btn btn-primary">
            Export CSV
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {Object.entries(exportData).map(([originalName, data]) => (
          <div
            key={originalName}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
          >
            <p className="mb-3 text-xs text-[var(--text-faint)]">
              Source: <span className="text-[var(--text-muted)]">{originalName}</span>
            </p>
            <div className="mb-3">
              <label className="label">Project name</label>
              <input
                type="text"
                value={data.projectName}
                onChange={(e) =>
                  setExportData((prev) => ({
                    ...prev,
                    [originalName]: {
                      ...prev[originalName],
                      projectName: e.target.value,
                    },
                  }))
                }
                className="control w-full"
              />
            </div>
            <div>
              <label className="label">Client name</label>
              <input
                type="text"
                value={data.clientName}
                onChange={(e) =>
                  setExportData((prev) => ({
                    ...prev,
                    [originalName]: {
                      ...prev[originalName],
                      clientName: e.target.value,
                    },
                  }))
                }
                className="control w-full"
                placeholder="Enter client name"
              />
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};
