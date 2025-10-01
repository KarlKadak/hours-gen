import { FC } from "react";
import { ProjectExportData } from "../types";

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
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-black text-white p-6 rounded-lg shadow-lg max-w-md w-full border border-white max-h-[calc(100vh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">Configure Export</h3>
        <div className="space-y-4">
          {Object.entries(exportData).map(([originalName, data]) => (
            <div
              key={originalName}
              className="border-b border-gray-600 pb-4 last:border-b-0"
            >
              <div className="mb-2">
                <label className="block text-sm font-medium mb-1">
                  Project Name:
                </label>
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
                  className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Client Name:
                </label>
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
                  className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
                  placeholder="Enter client name"
                />
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white border border-gray-600 rounded hover:bg-gray-600 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onExport}
            className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer"
          >
            Export CSV
          </button>
        </div>
      </div>
    </div>
  );
};