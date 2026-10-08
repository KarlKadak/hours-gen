"use client";

import { useState, useEffect, useCallback, FC, ChangeEvent } from "react";
import { RoundMode, RoundInt, DisplayMode, ProjectExportData, ProjectData, TimeEntry, TargetHoursConfig, StoredProjectMapping, ProgressTargets } from "../types";
import { parseCSV } from "../utils/csv";
import { groupAndMerge } from "../utils/data";
import { fetchClockifyRows } from "../utils/clockify";
import { formatDuration } from "../utils/duration";
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

const DEFAULT_PROGRESS_TARGETS: ProgressTargets = { completion: 95, onTrack: 95 };

const isProgressTargets = (value: unknown): value is ProgressTargets => {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  const isPct = (n: unknown) => typeof n === "number" && n >= 0 && n <= 100;
  return isPct(v.completion) && isPct(v.onTrack);
};

const CsvTablePage: FC = () => {
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [projects, setProjects] = useState<ProjectData>({});
  const [selectedProject, setSelectedProject] = useState<string>("all");
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  const [clockifyLoading, setClockifyLoading] = useState(false);
  const [clockifyError, setClockifyError] = useState<string | null>(null);
  const [pendingClockifyPull, setPendingClockifyPull] = useState(false);
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
  const [activeConfig, setActiveConfig] = useLocalStorage<TargetHoursConfig>(
    "targetHoursConfig",
    getDefaultTargetConfig(),
    isTargetHoursConfig
  );
  const [skipCoeffOnStar, setSkipCoeffOnStar] = useLocalStorage("skipCoeffOnStar", false);
  const [configByMonth, setConfigByMonth] = useLocalStorage<Record<string, TargetHoursConfig>>(
    "configByMonth",
    {}
  );
  const [projectMappings, setProjectMappings] = useLocalStorage<Record<string, StoredProjectMapping>>(
    "projectNameMappings",
    {}
  );
  const [progressTargets, setProgressTargets] = useLocalStorage<ProgressTargets>(
    "progressTargets",
    DEFAULT_PROGRESS_TARGETS,
    isProgressTargets
  );

  const targetConfig = activeConfig;

  const setTargetConfig = (config: TargetHoursConfig) => {
    const oldKey = `${activeConfig.year}-${String(activeConfig.month).padStart(2, "0")}`;
    const newKey = `${config.year}-${String(config.month).padStart(2, "0")}`;

    if (oldKey !== newKey) {
      // Month/year changed — save current config, load or create config for new month
      const updatedMap = { ...configByMonth, [oldKey]: activeConfig };
      const saved = updatedMap[newKey];
      if (saved) {
        setActiveConfig(saved);
      } else {
        const defaultConfig: TargetHoursConfig = {
          workingDays: getWorkingDaysInMonth(config.year, config.month),
          workload: activeConfig.workload,
          holidays: 0,
          vacationDays: 0,
          shortenedDays: 0,
          holidayDates: [],
          shortenedDates: [],
          vacationDates: [],
          month: config.month,
          year: config.year,
        };
        setActiveConfig(defaultConfig);
        updatedMap[newKey] = defaultConfig;
      }
      setConfigByMonth(updatedMap);
    } else {
      // Same month — update config and persist
      setActiveConfig(config);
      setConfigByMonth({ ...configByMonth, [newKey]: config });
    }
  };

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

  // Pull the selected month's time entries from Clockify via the local proxy
  // and feed them through the same pipeline as an uploaded CSV.
  const runClockifyPull = useCallback(async () => {
    if (!credentialState.clockifyApiKey) {
      // No key stored yet — send the user to the credentials modal to add one.
      setModal({ type: "credentials" });
      return;
    }

    setClockifyLoading(true);
    setClockifyError(null);
    try {
      const rows = await fetchClockifyRows(
        credentialState.clockifyApiKey,
        activeConfig.year,
        activeConfig.month
      );
      setCsvRows(rows);
      setProjects({});
      if (rows.length === 0) {
        setClockifyError("No Clockify time entries found for the selected month.");
      }
    } catch (err) {
      setClockifyError(
        err instanceof Error ? err.message : "Failed to pull from Clockify."
      );
    } finally {
      setClockifyLoading(false);
    }
  }, [credentialState.clockifyApiKey, activeConfig.year, activeConfig.month]);

  const handleClockifyPull = () => {
    if (!credentialState.isInitialized) return;
    setClockifyError(null);

    if (!credentialState.hasStore) {
      setPendingClockifyPull(true);
      setModal({ type: "password", mode: "create" });
    } else if (!credentialState.isUnlocked) {
      setPendingClockifyPull(true);
      setModal({ type: "password", mode: "unlock" });
    } else {
      runClockifyPull();
    }
  };

  // Once the vault is unlocked, run any pull that was waiting on the password.
  useEffect(() => {
    if (pendingClockifyPull && credentialState.isUnlocked) {
      setPendingClockifyPull(false);
      runClockifyPull();
    }
  }, [pendingClockifyPull, credentialState.isUnlocked, runClockifyPull]);

  const openExportModal = () => {
    const projectsToExport =
      selectedProject === "all" ? Object.keys(projects) : [selectedProject];

    const initialData: Record<string, ProjectExportData> = {};
    projectsToExport.forEach((projectName) => {
      const stored = projectMappings[projectName];
      initialData[projectName] = {
        projectName: stored?.projectName ?? projectName,
        clientName: stored?.clientName ?? "",
      };
    });

    setExportData(initialData);
    setModal({ type: "csvExport" });
  };

  const handleExportCSV = () => {
    exportToCSV(projects, selectedProject, exportData);

    const now = new Date().toISOString();
    const twoMonthsAgo = new Date(Date.now() - 2 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const updated = { ...projectMappings };
    for (const [sourceProject, data] of Object.entries(exportData)) {
      updated[sourceProject] = {
        projectName: data.projectName,
        clientName: data.clientName,
        lastExported: now,
      };
    }
    for (const [key, mapping] of Object.entries(updated)) {
      if (mapping.lastExported < twoMonthsAgo) {
        delete updated[key];
      }
    }
    setProjectMappings(updated);

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

  const monthLabel = new Date(activeConfig.year, activeConfig.month - 1, 1)
    .toLocaleString("en-US", { month: "long" });
  const hasData = Object.keys(projects).length > 0;

  return (
    <main className="mx-auto max-w-[1080px] px-4 py-8 sm:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Working Hours Report
          </h1>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {monthLabel} {activeConfig.year}
          </p>
        </div>
        {hasData && (
          <div className="text-right">
            <div className="num text-3xl font-semibold leading-none">
              {formatDuration(totalHours, displayMode)}
            </div>
            <div className="mt-1 text-xs uppercase tracking-wide text-[var(--text-faint)]">
              total logged{roundMode !== "keep" && " · rounded"}
            </div>
          </div>
        )}
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-2">
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
          onClockifyPull={handleClockifyPull}
          clockifyLoading={clockifyLoading}
          clockifyError={clockifyError}
        />

        <Summary
          totalHours={totalHours}
          displayMode={displayMode}
          targetConfig={targetConfig}
          progressTargets={progressTargets}
          setProgressTargets={setProgressTargets}
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          onExportClick={openExportModal}
          onJiraExportClick={openJiraExportModal}
          onConfigureTarget={() => setModal({ type: "targetHours" })}
        />
      </div>

      <div className="mt-8 space-y-4">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center rounded-[var(--radius)] border border-dashed border-[var(--border)] px-6 py-16 text-center">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="8" y1="13" x2="16" y2="13" />
              <line x1="8" y1="17" x2="16" y2="17" />
            </svg>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              No time entries loaded yet.
            </p>
            <p className="mt-1 text-xs text-[var(--text-faint)]">
              Upload a Clockify CSV or pull directly from Clockify to get started.
            </p>
          </div>
        ) : (
          Object.entries(projects).map(([project, rows]) => (
            <ProjectTable
              key={project}
              project={project}
              rows={rows}
              displayMode={displayMode}
            />
          ))
        )}
      </div>

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
          onClose={() => {
            setPendingClockifyPull(false);
            setModal({ type: "none" });
          }}
          error={credentialState.error}
        />
      )}

      {modal.type === "credentials" && (
        <CredentialModal
          credentials={credentialState.credentials}
          clockifyApiKey={credentialState.clockifyApiKey}
          onAdd={async (cred) => {
            await credentialActions.addCredential(cred);
          }}
          onUpdate={credentialActions.updateCredential}
          onDelete={credentialActions.deleteCredential}
          onSaveClockifyApiKey={credentialActions.setClockifyApiKey}
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
