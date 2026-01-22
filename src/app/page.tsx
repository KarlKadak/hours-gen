"use client";

import { useState, useEffect, FC, ChangeEvent } from "react";
import { RoundMode, RoundInt, DisplayMode, ProjectExportData, ProjectData, TimeEntry } from "../types";
import { parseCSV } from "../utils/csv";
import { groupAndMerge } from "../utils/data";
import { exportToCSV } from "../utils/export";
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

type ModalState =
  | { type: "none" }
  | { type: "csvExport" }
  | { type: "password"; mode: "create" | "unlock"; nextModal?: "credentials" | "jiraExport" }
  | { type: "credentials" }
  | { type: "jiraExport" };

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
  const [targetHours, setTargetHours] = useLocalStorage("targetHours", 0);
  const [skipCoeffOnStar, setSkipCoeffOnStar] = useLocalStorage("skipCoeffOnStar", false);

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
          targetHours={targetHours}
          setTargetHours={setTargetHours}
          projects={projects}
          selectedProject={selectedProject}
          setSelectedProject={setSelectedProject}
          onExportClick={openExportModal}
          onJiraExportClick={openJiraExportModal}
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
    </main>
  );
};

export default CsvTablePage;
