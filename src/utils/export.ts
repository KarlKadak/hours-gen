import { ProjectExportData, ProjectData } from "../types";

export const exportToCSV = (
  projects: ProjectData,
  selectedProject: string,
  exportData: Record<string, ProjectExportData>
) => {
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
};