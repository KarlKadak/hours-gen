import { FC, useState, FormEvent } from "react";
import { JiraAuthMode, JiraCredential, JiraHosting } from "../types";
import { Modal } from "./Modal";

interface CredentialModalProps {
  credentials: JiraCredential[];
  clockifyApiKey: string | null;
  onAdd: (credential: Omit<JiraCredential, "id">) => Promise<void>;
  onUpdate: (credential: JiraCredential) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSaveClockifyApiKey: (key: string) => Promise<void>;
  onClose: () => void;
  onLock: () => void;
}

interface CredentialFormData {
  name: string;
  type: "tempo" | "apptime";
  hosting: JiraHosting;
  authMode: JiraAuthMode;
  jiraDomain: string;
  jiraEmail: string;
  jiraUsername: string;
  jiraApiToken: string;
  tempoApiToken: string;
  atlassianAccountId: string;
  azureAdProxy: boolean;
}

const emptyForm: CredentialFormData = {
  name: "",
  type: "tempo",
  hosting: "cloud",
  authMode: "basic",
  jiraDomain: "",
  jiraEmail: "",
  jiraUsername: "",
  jiraApiToken: "",
  tempoApiToken: "",
  atlassianAccountId: "",
  azureAdProxy: false,
};

export const CredentialModal: FC<CredentialModalProps> = ({
  credentials,
  clockifyApiKey,
  onAdd,
  onUpdate,
  onDelete,
  onSaveClockifyApiKey,
  onClose,
  onLock,
}) => {
  const [view, setView] = useState<"list" | "add" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CredentialFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [clockifyKeyInput, setClockifyKeyInput] = useState("");
  const [savingClockify, setSavingClockify] = useState(false);
  const [clockifySaved, setClockifySaved] = useState(false);

  const handleSaveClockify = async () => {
    setSavingClockify(true);
    setClockifySaved(false);
    try {
      await onSaveClockifyApiKey(clockifyKeyInput);
      setClockifyKeyInput("");
      setClockifySaved(true);
    } finally {
      setSavingClockify(false);
    }
  };

  const handleAdd = () => {
    setFormData(emptyForm);
    setView("add");
  };

  const handleEdit = (credential: JiraCredential) => {
    setEditingId(credential.id);
    setFormData({
      name: credential.name,
      type: credential.type,
      hosting: credential.hosting || (credential.azureAdProxy ? "server" : "cloud"),
      authMode: credential.authMode || "basic",
      jiraDomain: credential.jiraDomain,
      jiraEmail: credential.jiraEmail,
      jiraUsername: credential.jiraUsername || "",
      jiraApiToken: credential.jiraApiToken,
      tempoApiToken: credential.tempoApiToken,
      atlassianAccountId: credential.atlassianAccountId,
      azureAdProxy: credential.azureAdProxy || false,
    });
    setView("edit");
  };

  // Drop fields that do not apply to the chosen hosting so stale values from
  // a previous selection are not persisted.
  const toCredential = (data: CredentialFormData): Omit<JiraCredential, "id"> => {
    const isServer = data.hosting === "server";
    return {
      ...data,
      jiraUsername:
        isServer && data.authMode === "basic" && data.jiraUsername.trim()
          ? data.jiraUsername.trim()
          : undefined,
      atlassianAccountId: isServer ? "" : data.atlassianAccountId,
      azureAdProxy: isServer ? data.azureAdProxy : false,
    };
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (view === "add") {
        await onAdd(toCredential(formData));
      } else if (view === "edit" && editingId) {
        await onUpdate({ ...toCredential(formData), id: editingId });
      }
      setView("list");
      setFormData(emptyForm);
      setEditingId(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deleteConfirm !== id) {
      setDeleteConfirm(id);
      return;
    }
    await onDelete(id);
    setDeleteConfirm(null);
  };

  const handleCancel = () => {
    setView("list");
    setFormData(emptyForm);
    setEditingId(null);
  };

  const isServer = formData.type === "apptime" && formData.hosting === "server";

  const renderForm = () => (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="label">Name</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="control w-full"
          placeholder="e.g., Work Jira"
          required
        />
      </div>
      <div>
        <label className="label">Type</label>
        <div className="flex gap-3">
          {(["tempo", "apptime"] as const).map((t) => (
            <label
              key={t}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
            >
              <input
                type="radio"
                name="credentialType"
                value={t}
                checked={formData.type === t}
                onChange={() =>
                  setFormData({
                    ...formData,
                    type: t,
                    // Tempo mode only talks to Tempo Cloud, so force cloud hosting
                    ...(t === "tempo"
                      ? {
                          hosting: "cloud" as const,
                          authMode: "basic" as const,
                          azureAdProxy: false,
                        }
                      : { tempoApiToken: "" }),
                  })
                }
              />
              {t === "tempo" ? "Tempo" : "AppTime"}
            </label>
          ))}
        </div>
        {formData.type === "apptime" && (
          <p className="mt-1.5 text-xs text-[var(--text-faint)]">
            AppTime mode writes native Jira worklogs. Any tool that reads them,
            including AppTime and Tempo Server, picks them up.
          </p>
        )}
      </div>
      {formData.type === "apptime" && (
        <div>
          <label className="label">Jira hosting</label>
          <div className="flex gap-3">
            {(["cloud", "server"] as const).map((h) => (
              <label
                key={h}
                className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="jiraHosting"
                  value={h}
                  checked={formData.hosting === h}
                  onChange={() =>
                    setFormData({
                      ...formData,
                      hosting: h,
                      ...(h === "cloud"
                        ? {
                            authMode: "basic" as const,
                            azureAdProxy: false,
                            jiraUsername: "",
                          }
                        : {}),
                    })
                  }
                />
                {h === "cloud" ? "Cloud" : "Server / Data Center"}
              </label>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="label">Jira domain</label>
        <input
          type="text"
          value={formData.jiraDomain}
          onChange={(e) => setFormData({ ...formData, jiraDomain: e.target.value })}
          className="control w-full"
          placeholder={isServer ? "e.g., jira.company.com" : "e.g., company.atlassian.net"}
          required
        />
      </div>
      {isServer && (
        <div>
          <label className="label">Authentication</label>
          <div className="flex gap-3">
            {(["basic", "pat"] as const).map((m) => (
              <label
                key={m}
                className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm"
              >
                <input
                  type="radio"
                  name="jiraAuthMode"
                  value={m}
                  checked={formData.authMode === m}
                  onChange={() =>
                    setFormData({
                      ...formData,
                      authMode: m,
                      ...(m === "pat" ? { jiraUsername: "" } : {}),
                    })
                  }
                />
                {m === "basic" ? "Username and password" : "Personal access token"}
              </label>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="label">Jira email</label>
        <input
          type="email"
          value={formData.jiraEmail}
          onChange={(e) => setFormData({ ...formData, jiraEmail: e.target.value })}
          className="control w-full"
          placeholder="your@email.com"
          required
        />
        {isServer && (
          <p className="mt-1.5 text-xs text-[var(--text-faint)]">
            Must match the email on your Jira profile. It is used to find your
            existing worklogs so re-exports update instead of duplicating.
          </p>
        )}
      </div>
      {isServer && formData.authMode === "basic" && (
        <div>
          <label className="label">Jira username</label>
          <input
            type="text"
            value={formData.jiraUsername}
            onChange={(e) =>
              setFormData({ ...formData, jiraUsername: e.target.value })
            }
            className="control w-full"
            placeholder="Leave empty to sign in with the email above"
          />
        </div>
      )}
      <div>
        <label className="label">
          {!isServer
            ? "Jira API token"
            : formData.authMode === "pat"
            ? "Personal access token"
            : "Jira password"}
        </label>
        <input
          type="password"
          value={formData.jiraApiToken}
          onChange={(e) =>
            setFormData({ ...formData, jiraApiToken: e.target.value })
          }
          className="control w-full"
          placeholder={
            !isServer
              ? "Create at id.atlassian.com"
              : formData.authMode === "pat"
              ? "Jira profile → Personal Access Tokens"
              : "Your Jira login password"
          }
          required
        />
      </div>
      {formData.type === "tempo" && (
        <div>
          <label className="label">Tempo API token</label>
          <input
            type="password"
            value={formData.tempoApiToken}
            onChange={(e) =>
              setFormData({ ...formData, tempoApiToken: e.target.value })
            }
            className="control w-full"
            placeholder="Create in Tempo Settings"
            required
          />
        </div>
      )}
      {isServer && (
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={formData.azureAdProxy}
            onChange={(e) =>
              setFormData({ ...formData, azureAdProxy: e.target.checked })
            }
          />
          Jira behind Azure AD App Proxy
        </label>
      )}
      {!isServer && (
        <div>
          <label className="label">Atlassian account ID</label>
          <input
            type="text"
            value={formData.atlassianAccountId}
            onChange={(e) =>
              setFormData({ ...formData, atlassianAccountId: e.target.value })
            }
            className="control w-full"
            placeholder="From your Jira profile URL"
            required
          />
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={handleCancel}
          className="btn btn-secondary"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting ? "…" : view === "add" ? "Add" : "Save"}
        </button>
      </div>
    </form>
  );

  const renderList = () => (
    <div className="space-y-5">
      {/* Clockify key */}
      <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3">
        <label className="label flex items-center gap-2" htmlFor="clockify-key">
          Clockify API key
          {clockifyApiKey && <span className="badge badge-success">saved</span>}
        </label>
        <div className="flex gap-2">
          <input
            id="clockify-key"
            type="password"
            value={clockifyKeyInput}
            onChange={(e) => {
              setClockifyKeyInput(e.target.value);
              setClockifySaved(false);
            }}
            className="control min-w-0 flex-1"
            placeholder={clockifyApiKey ? "•••••••• (enter to replace)" : "Paste Clockify API key"}
          />
          <button
            onClick={handleSaveClockify}
            disabled={savingClockify || !clockifyKeyInput.trim()}
            className="btn btn-primary"
          >
            {savingClockify ? "…" : "Save"}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-[var(--text-faint)]">
          {clockifySaved
            ? "Clockify API key saved."
            : "Used to pull time entries. Clockify → Preferences → Advanced → API."}
        </p>
      </div>

      {/* Jira credentials */}
      <div>
        <div className="card-title mb-2">Jira credentials</div>
        {credentials.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            No credentials stored yet.
          </p>
        ) : (
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {credentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface-2)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {cred.name}
                    <span className="badge badge-muted">
                      {cred.type === "apptime" ? "AppTime" : "Tempo"}
                      {cred.type === "apptime" && cred.hosting === "server"
                        ? " · Server"
                        : ""}
                    </span>
                  </p>
                  <p className="truncate text-sm text-[var(--text-muted)]">
                    {cred.jiraDomain}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleEdit(cred)}
                    className="btn btn-secondary btn-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(cred.id)}
                    className={`btn btn-sm ${
                      deleteConfirm === cred.id ? "btn-danger" : "btn-secondary"
                    }`}
                  >
                    {deleteConfirm === cred.id ? "Confirm?" : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const listFooter = (
    <div className="flex w-full items-center justify-between">
      <button onClick={onLock} className="btn btn-danger btn-sm">
        Lock vault
      </button>
      <button onClick={handleAdd} className="btn btn-primary">
        Add credential
      </button>
    </div>
  );

  return (
    <Modal
      title={
        view === "list"
          ? "Connections"
          : view === "add"
          ? "Add credential"
          : "Edit credential"
      }
      onClose={onClose}
      size="md"
      footer={view === "list" ? listFooter : undefined}
    >
      {view === "list" ? renderList() : renderForm()}
    </Modal>
  );
};
