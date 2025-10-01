"use client";

import { useState, useEffect, FC, ChangeEvent } from "react";

const parseCSV = (csv: string) => {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = headerLine
    .replace(/^"|"$/g, "")
    .split(/","/)
    .map((h) => h.trim());
  return lines.map((line) => {
    const cols = line.replace(/^"|"$/g, "").split(/","/);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => (obj[h] = cols[i] || ""));
    return obj;
  });
};

const roundDuration = (mins: number, mode: RoundMode, interval: RoundInt) => {
  if (mode === "keep") return mins;
  if (mode === "down") return Math.floor(mins / interval) * interval;
  if (mode === "up") return Math.ceil(mins / interval) * interval;
  return Math.round(mins / interval) * interval;
};

const groupAndMerge = (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  coeff: number,
  roundMode: RoundMode,
  roundInt: RoundInt
) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects: Record<string, any[]> = {};
  for (const row of rows) {
    const key = row["Project"] || "(No Project)";
    if (!projects[key]) projects[key] = [];
    projects[key].push(row);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any[]> = {};
  for (const [project, entries] of Object.entries(projects)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged: Record<string, any> = {};
    for (const entry of entries) {
      const desc = entry["Description"];
      const date = entry["Start Date"];
      const mergeKey = `${desc}__${date}`;
      let dur = parseFloat(entry["Duration (decimal)"] || "0");
      dur *= coeff;
      let mins = dur * 60;
      mins = roundDuration(mins, roundMode, roundInt);
      if (!merged[mergeKey]) {
        merged[mergeKey] = { ...entry, "Duration (decimal)": mins / 60 };
      } else {
        merged[mergeKey]["Duration (decimal)"] += mins / 60;
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result[project] = Object.values(merged).sort((a: any, b: any) => {
      return (
        new Date(a["Start Date"]).getTime() -
        new Date(b["Start Date"]).getTime()
      );
    });
  }
  return result;
};

const ROUND_INTERVALS = [5, 10, 15, 30, 60];

export type RoundMode = "keep" | "standard" | "down" | "up";
export type RoundInt = 5 | 10 | 15 | 30 | 60;
export type DisplayMode = "decimal" | "hhmm";

interface ProjectExportData {
  projectName: string;
  clientName: string;
}

const isRoundMode = (value: unknown): value is RoundMode =>
  typeof value === "string" &&
  ["keep", "standard", "down", "up"].includes(value);

const isRoundInt = (value: unknown): value is RoundInt =>
  typeof value === "number" && [5, 10, 15, 30, 60].includes(value);

const isDisplayMode = (value: unknown): value is DisplayMode =>
  typeof value === "string" && ["decimal", "hhmm"].includes(value);

const CsvTablePage: FC = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [csvRows, setCsvRows] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [projects, setProjects] = useState<Record<string, any[]>>({});
  const [coeff, setCoeff] = useState<number>(1);
  const [roundMode, setRoundMode] = useState<RoundMode>("keep");
  const [roundInt, setRoundInt] = useState<RoundInt>(5);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("decimal");
  const [targetHours, setTargetHours] = useState<number>(0);
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportData, setExportData] = useState<
    Record<string, ProjectExportData>
  >({});

  // On mount load preferences from localStorage
  useEffect(() => {
    const storedCoeff =
      parseFloat(localStorage.getItem("durationCoeff") || "1") || 1;
    const storedRoundMode = localStorage.getItem("roundMode") || "keep";
    const storedRoundInt =
      parseInt(localStorage.getItem("roundInt") || "5") || 5;
    const storedDisplayMode = localStorage.getItem("displayMode") || "decimal";
    const storedTargetHours =
      parseFloat(localStorage.getItem("targetHours") || "0") || 0;
    setCoeff(storedCoeff);
    if (isRoundMode(storedRoundMode)) setRoundMode(storedRoundMode);
    if (isRoundInt(storedRoundInt)) setRoundInt(storedRoundInt);
    if (isDisplayMode(storedDisplayMode)) setDisplayMode(storedDisplayMode);
    setTargetHours(storedTargetHours);
  }, []);

  useEffect(() => {
    localStorage.setItem("durationCoeff", String(coeff));
  }, [coeff]);
  useEffect(() => {
    localStorage.setItem("roundMode", roundMode);
  }, [roundMode]);
  useEffect(() => {
    localStorage.setItem("roundInt", String(roundInt));
  }, [roundInt]);
  useEffect(() => {
    localStorage.setItem("displayMode", displayMode);
  }, [displayMode]);
  useEffect(() => {
    localStorage.setItem("targetHours", String(targetHours));
  }, [targetHours]);

  useEffect(() => {
    if (csvRows.length > 0) {
      setProjects(groupAndMerge(csvRows, coeff, roundMode, roundInt));
    }
  }, [csvRows, coeff, roundMode, roundInt]);

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const rows = parseCSV(text);
      setCsvRows(rows);
    };
    reader.readAsText(file);
  };

  const formatDuration = (value: number) => {
    if (displayMode === "decimal") return value.toFixed(2);
    const totalMins = Math.round(value * 60);
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    return `${hours}:${mins.toString().padStart(2, "0")}`;
  };

  const openExportModal = () => {
    const projectsToExport =
      selectedProject === "all" ? Object.keys(projects) : [selectedProject];

    const initialData: Record<string, ProjectExportData> = {};
    projectsToExport.forEach((projectName) => {
      initialData[projectName] = {
        projectName,
        clientName: "",
      };
    });

    setExportData(initialData);
    setShowExportModal(true);
  };

  const exportToCSV = () => {
    const projectsToExport =
      selectedProject === "all"
        ? projects
        : { [selectedProject]: projects[selectedProject] || [] };

    const csvRows: string[] = [];
    csvRows.push("Kuupäev,Klient,Projekt,Ülesanne,Tunnid");

    Object.entries(projectsToExport).forEach(
      ([originalProjectName, entries]) => {
        const projectData = exportData[originalProjectName];
        const clientName = projectData?.clientName || "";
        const projectName = projectData?.projectName || originalProjectName;

        entries.forEach((entry) => {
          const date = entry["Start Date"] || "";
          const task = entry["Description"] || "";
          const hours = entry["Duration (decimal)"] || 0;

          csvRows.push(
            `"${date}","${clientName}","${projectName}","${task}","${hours.toFixed(
              2
            )}"`
          );
        });
      }
    );

    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      selectedProject === "all"
        ? "all_projects_hours.csv"
        : `${selectedProject}_hours.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportModal(false);
  };

  const totalHours = Object.values(projects)
    .flat()
    .reduce((sum, row) => sum + (row["Duration (decimal)"] || 0), 0);

  return (
    <main className="max-w-[1000px] mx-auto my-[2rem]">
      <div className="flex flex-row justify-between">
        <div className="flex flex-col gap-2 w-fit">
          <label>
            <b>Upload CSV:</b>&nbsp;
            <input type="file" accept=".csv" onChange={handleFile} />
          </label>
          <label>
            <b>Duration coefficient:</b>
            <input
              type="number"
              step="0.00001"
              min="0"
              value={coeff}
              onChange={(e) => setCoeff(parseFloat(e.target.value) || 1)}
              className="w-20 ml-2"
            />
          </label>
          <label>
            <b>Rounding:</b>
            <select
              value={roundMode}
              onChange={(e) =>
                isRoundMode(e.target.value) && setRoundMode(e.target.value)
              }
              className="ml-2"
            >
              <option value="keep">Do not round</option>
              <option value="standard">Round (standard)</option>
              <option value="down">Round down</option>
              <option value="up">Round up</option>
            </select>
            {roundMode !== "keep" && (
              <select
                value={roundInt}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (isRoundInt(value)) setRoundInt(value);
                }}
                className="ml-2"
              >
                {ROUND_INTERVALS.map((intv) => (
                  <option key={intv} value={intv}>
                    {intv} min
                  </option>
                ))}
              </select>
            )}
          </label>
          <label>
            <b>Display as:</b>
            <select
              value={displayMode}
              onChange={(e) =>
                isDisplayMode(e.target.value) && setDisplayMode(e.target.value)
              }
              className="ml-2"
            >
              <option value="decimal">Decimal</option>
              <option value="hhmm">HH:MM</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-2 w-fit">
          <div>
            <b>Total hours{roundMode !== "keep" && " (after rounding)"}:</b>
            <span className="ml-2">{formatDuration(totalHours)}</span>
          </div>
          <div>
            <b>Target hours:</b>
            <input
              type="number"
              step="0.01"
              min="0"
              value={targetHours || ""}
              onChange={(e) => setTargetHours(parseFloat(e.target.value) || 0)}
              className="w-20 ml-2"
            />
          </div>
          {targetHours > 0 && (
            <div>
              <b>Completion:</b>
              <span className="ml-2">
                {((totalHours / targetHours) * 100).toFixed(1)}%
              </span>
            </div>
          )}
          <div>
            <label>
              <b>Export project:</b>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="ml-2"
              >
                <option value="all">All projects</option>
                {Object.keys(projects).map((projectName) => (
                  <option key={projectName} value={projectName}>
                    {projectName}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            onClick={openExportModal}
            disabled={Object.keys(projects).length === 0}
            className="px-3 py-1 text-white border border-white rounded text-sm cursor-pointer disabled:bg-gray-600 disabled:cursor-not-allowed disabled:border-gray-400"
          >
            Export to CSV
          </button>
        </div>
      </div>
      <hr className="my-4" />
      {Object.keys(projects).length === 0 && <p>No data loaded.</p>}
      {Object.entries(projects).map(([project, rows], index) => (
        <div key={project}>
          <section key={project}>
            <h2 className="text-xl font-bold">{project}</h2>
            <div className="mb-2 text-gray-600 text-sm">
              Total hours:&nbsp;
              {formatDuration(
                rows.reduce(
                  (sum, row) => sum + (row["Duration (decimal)"] || 0),
                  0
                )
              )}
            </div>
            <table border={1} cellPadding={6} className="w-full">
              <thead>
                <tr>
                  <th>Inserted?</th>
                  <th>Task</th>
                  <th>Date</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i}>
                    <td className="text-center">
                      <input type="checkbox" />
                    </td>
                    <td>{row["Description"]}</td>
                    <td className="text-center">{row["Start Date"]}</td>
                    <td className="text-center">
                      {formatDuration(row["Duration (decimal)"])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          {index < Object.entries(projects).length - 1 && (
            <hr className="my-4" />
          )}
        </div>
      ))}

      {showExportModal && (
        <div
          className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowExportModal(false)}
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
                onClick={() => setShowExportModal(false)}
                className="px-4 py-2 text-white border border-gray-600 rounded hover:bg-gray-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={exportToCSV}
                className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer"
              >
                Export CSV
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
};

export default CsvTablePage;
