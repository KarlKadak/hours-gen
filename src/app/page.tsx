"use client";

import { useState, useEffect, FC, ChangeEvent } from "react";
import { RoundMode, RoundInt, DisplayMode, ProjectExportData, ProjectData } from "../types";
import { parseCSV } from "../utils/csv";
import { groupAndMerge } from "../utils/data";
import { exportToCSV } from "../utils/export";
import { isRoundMode, isRoundInt, isDisplayMode } from "../utils/validators";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { Controls } from "../components/Controls";
import { Summary } from "../components/Summary";
import { ProjectTable } from "../components/ProjectTable";
import { ExportModal } from "../components/ExportModal";

const CsvTablePage: FC = () => {
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [projects, setProjects] = useState<ProjectData>({});
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [exportData, setExportData] = useState<
    Record<string, ProjectExportData>
  >({});

  const [coeff, setCoeff] = useLocalStorage("durationCoeff", 1);
  const [roundMode, setRoundMode] = useLocalStorage<RoundMode>(
    "roundMode",
    "keep",
    isRoundMode
  );
  const [roundInt, setRoundInt] = useLocalStorage<RoundInt>(
    "roundInt",
    5,
    isRoundInt
  );
  const [displayMode, setDisplayMode] = useLocalStorage<DisplayMode>(
    "displayMode",
    "decimal",
    isDisplayMode
  );
  const [targetHours, setTargetHours] = useLocalStorage("targetHours", 0);

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

  const handleExportCSV = () => {
    exportToCSV(projects, selectedProject, exportData);
    setShowExportModal(false);
  };

  const totalHours = Object.values(projects)
    .flat()
    .reduce((sum, row) => sum + (row["Duration (decimal)"] || 0), 0);

  return (
    <main className="max-w-[1000px] mx-auto my-[2rem]">
      <div className="flex flex-row justify-between">
        <Controls
          coeff={coeff}
          setCoeff={setCoeff}
          roundMode={roundMode}
          setRoundMode={setRoundMode}
          roundInt={roundInt}
          setRoundInt={setRoundInt}
          displayMode={displayMode}
          setDisplayMode={setDisplayMode}
          onFileChange={handleFile}
        />

        <Summary
          totalHours={totalHours}
          roundMode={roundMode}
          displayMode={displayMode}
          targetHours={targetHours}
          setTargetHours={setTargetHours}
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          onExportClick={openExportModal}
        />
      </div>

      <hr className="my-4" />

      {Object.keys(projects).length === 0 && <p>No data loaded.</p>}
      {Object.entries(projects).map(([project, rows], index) => (
        <div key={project}>
          <ProjectTable
            project={project}
            rows={rows}
            displayMode={displayMode}
          />
          {index < Object.entries(projects).length - 1 && (
            <hr className="my-4" />
          )}
        </div>
      ))}

      {showExportModal && (
        <ExportModal
          exportData={exportData}
          setExportData={setExportData}
          onClose={() => setShowExportModal(false)}
          onExport={handleExportCSV}
        />
      )}
    </main>
  );
};

export default CsvTablePage;