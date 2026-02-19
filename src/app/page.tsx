"use client";

import { useState, useEffect, useRef, FC, ChangeEvent } from "react";
import { RoundMode, RoundInt, DisplayMode, ProjectExportData, ProjectData, TimeEntry, TargetHoursConfig } from "../types";
import { parseCSV } from "../utils/csv";
import { groupAndMerge } from "../utils/data";
import { exportToCSV } from "../utils/export";
import { getWorkingDaysInMonth } from "../utils/holidays";
import { isRoundMode, isRoundInt, isDisplayMode } from "../utils/validators";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useCredentialStore } from "../hooks/useCredentialStore";
import { Controls } from "../components/Controls";
import { Summary } from "../components/Summary";
import { ProjectTable } from "../components/ProjectTable";
import { ExportModal } from "../components/ExportModal";
import { PasswordModal } from "../components/PasswordModal";
import { CredentialModal } from "../components/CredentialModal";
import { JiraExportModal } from "../components/JiraExportModal";
import { TargetHoursModal } from "../components/TargetHoursModal";

type ModalState =
  | { type: "none" }
  | { type: "csvExport" }
  | { type: "password"; mode: "create" | "unlock"; nextModal?: "credentials" | "jiraExport" }
  | { type: "credentials" }
  | { type: "jiraExport" }
  | { type: "targetHours" };

function getDefaultTargetConfig(): TargetHoursConfig {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return {
    workingDays: getWorkingDaysInMonth(year, month),
    workload: 1,
    holidays: 0,
    vacationDays: 0,
    shortenedDays: 0,
    holidayDates: [],
    shortenedDates: [],
    vacationDates: [],
    month,
    year,
  };
}

const isTargetHoursConfig = (value: unknown): value is TargetHoursConfig => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const valid =
    typeof v.workingDays === "number" &&
    typeof v.workload === "number" &&
    typeof v.holidays === "number" &&
    typeof v.shortenedDays === "number" &&
    typeof v.month === "number" &&
    typeof v.year === "number";
  if (!valid) return false;
  if (typeof v.vacationDays !== "number") v.vacationDays = 0;
  if (!Array.isArray(v.holidayDates)) v.holidayDates = [];
  if (!Array.isArray(v.shortenedDates)) v.shortenedDates = [];
  if (!Array.isArray(v.vacationDates)) v.vacationDates = [];
  return true;
};

const CsvTablePage: FC = () => {
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [projects, setProjects] = useState<ProjectData>({});
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [modal, setModal] = useState<ModalState>({ type: "none" });
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
  const [targetConfig, setTargetConfig] = useLocalStorage<TargetHoursConfig>(
    "targetHoursConfig",
    getDefaultTargetConfig(),
    isTargetHoursConfig
  );
  const [skipCoeffOnStar, setSkipCoeffOnStar] = useLocalStorage("skipCoeffOnStar", false);
  const [vacationDatesByMonth, setVacationDatesByMonth] = useLocalStorage<Record<string, string[]>>(
    "vacationDatesByMonth",
    {}
  );
  const [holidayDatesByMonth, setHolidayDatesByMonth] = useLocalStorage<Record<string, string[]>>(
    "holidayDatesByMonth",
    {}
  );
  const [shortenedDatesByMonth, setShortenedDatesByMonth] = useLocalStorage<Record<string, string[]>>(
    "shortenedDatesByMonth",
    {}
  );

  const prevMonthKey = useRef<string>("");

  // Sync date arrays from per-month maps when month/year changes
  useEffect(() => {
    const key = `${targetConfig.year}-${String(targetConfig.month).padStart(2, "0")}`;
    if (key !== prevMonthKey.current) {
      prevMonthKey.current = key;
      const savedVacation = vacationDatesByMonth[key] ?? [];
      const savedHolidays = holidayDatesByMonth[key] ?? [];
      const savedShortened = shortenedDatesByMonth[key] ?? [];
      setTargetConfig({
        ...targetConfig,
        vacationDates: savedVacation,
        vacationDays: savedVacation.length,
        holidayDates: savedHolidays,
        holidays: savedHolidays.length,
        shortenedDates: savedShortened,
        shortenedDays: savedShortened.length,
      });
    }
  }, [targetConfig.month, targetConfig.year]);

  // Write date arrays back to per-month maps when they change
  useEffect(() => {
    const key = `${targetConfig.year}-${String(targetConfig.month).padStart(2, "0")}`;
    if (key === prevMonthKey.current) {
      const vChanged = JSON.stringify(vacationDatesByMonth[key] ?? []) !== JSON.stringify(targetConfig.vacationDates);
      const hChanged = JSON.stringify(holidayDatesByMonth[key] ?? []) !== JSON.stringify(targetConfig.holidayDates);
      const sChanged = JSON.stringify(shortenedDatesByMonth[key] ?? []) !== JSON.stringify(targetConfig.shortenedDates);
      if (vChanged) setVacationDatesByMonth({ ...vacationDatesByMonth, [key]: targetConfig.vacationDates });
      if (hChanged) setHolidayDatesByMonth({ ...holidayDatesByMonth, [key]: targetConfig.holidayDates });
      if (sChanged) setShortenedDatesByMonth({ ...shortenedDatesByMonth, [key]: targetConfig.shortenedDates });
    }
  }, [targetConfig.vacationDates, targetConfig.holidayDates, targetConfig.shortenedDates]);

  const [credentialState, credentialActions] = useCredentialStore();

  useEffect(() => {
    if (csvRows.length > 0) {
      setProjects(groupAndMerge(csvRows, coeff, roundMode, roundInt, skipCoeffOnStar));
    }
  }, [csvRows, coeff, roundMode, roundInt, skipCoeffOnStar]);

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
    setModal({ type: "csvExport" });
  };

  const handleExportCSV = () => {
    exportToCSV(projects, selectedProject, exportData);
    setModal({ type: "none" });
  };

  const openJiraExportModal = () => {
    if (!credentialState.isInitialized) return;

    if (!credentialState.hasStore) {
      setModal({ type: "password", mode: "create", nextModal: "jiraExport" });
    } else if (!credentialState.isUnlocked) {
      setModal({ type: "password", mode: "unlock", nextModal: "jiraExport" });
    } else {
      setModal({ type: "jiraExport" });
    }
  };

  const openCredentialsModal = () => {
    if (!credentialState.isInitialized) return;

    if (!credentialState.hasStore) {
      setModal({ type: "password", mode: "create", nextModal: "credentials" });
    } else if (!credentialState.isUnlocked) {
      setModal({ type: "password", mode: "unlock", nextModal: "credentials" });
    } else {
      setModal({ type: "credentials" });
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (modal.type !== "password") return false;

    let success: boolean;
    if (modal.mode === "create") {
      success = await credentialActions.initializeStore(password);
    } else {
      success = await credentialActions.unlock(password);
    }

    if (success && modal.nextModal) {
      setModal({ type: modal.nextModal });
    } else if (success) {
      setModal({ type: "none" });
    }

    return success;
  };

  const totalHours = Object.values(projects)
    .flat()
    .reduce((sum, row) => sum + (row["Duration (decimal)"] || 0), 0);

  const getEntriesForExport = (): TimeEntry[] => {
    if (selectedProject === "all") {
      return Object.values(projects).flat();
    }
    return projects[selectedProject] || [];
  };

  const getProjectNameForExport = (): string => {
    if (selectedProject === "all") {
      return "All Projects";
    }
    return selectedProject;
  };

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
          skipCoeffOnStar={skipCoeffOnStar}
          setSkipCoeffOnStar={setSkipCoeffOnStar}
          onFileChange={handleFile}
        />

        <Summary
          totalHours={totalHours}
          roundMode={roundMode}
          displayMode={displayMode}
          targetConfig={targetConfig}
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          onExportClick={openExportModal}
          onJiraExportClick={openJiraExportModal}
          onConfigureTarget={() => setModal({ type: "targetHours" })}
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

      {modal.type === "csvExport" && (
        <ExportModal
          exportData={exportData}
          setExportData={setExportData}
          onClose={() => setModal({ type: "none" })}
          onExport={handleExportCSV}
        />
      )}

      {modal.type === "password" && (
        <PasswordModal
          mode={modal.mode}
          onSubmit={handlePasswordSubmit}
          onClose={() => setModal({ type: "none" })}
          error={credentialState.error}
        />
      )}

      {modal.type === "credentials" && (
        <CredentialModal
          credentials={credentialState.credentials}
          onAdd={async (cred) => {
            await credentialActions.addCredential(cred);
          }}
          onUpdate={credentialActions.updateCredential}
          onDelete={credentialActions.deleteCredential}
          onClose={() => setModal({ type: "none" })}
          onLock={() => {
            credentialActions.lock();
            setModal({ type: "none" });
          }}
        />
      )}

      {modal.type === "jiraExport" && (
        <JiraExportModal
          credentials={credentialState.credentials}
          entries={getEntriesForExport()}
          projectName={getProjectNameForExport()}
          onClose={() => setModal({ type: "none" })}
          onManageCredentials={openCredentialsModal}
        />
      )}

      {modal.type === "targetHours" && (
        <TargetHoursModal
          config={targetConfig}
          setConfig={setTargetConfig}
          onClose={() => setModal({ type: "none" })}
        />
      )}
    </main>
  );
};

export default CsvTablePage;
