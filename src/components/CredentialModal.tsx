import { FC, useState, FormEvent } from "react";
import { JiraCredential } from "../types";

interface CredentialModalProps {
  credentials: JiraCredential[];
  onAdd: (credential: Omit<JiraCredential, "id">) => Promise<void>;
  onUpdate: (credential: JiraCredential) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
  onLock: () => void;
}

interface CredentialFormData {
  name: string;
  type: "tempo" | "apptime";
  jiraDomain: string;
  jiraEmail: string;
  jiraApiToken: string;
  tempoApiToken: string;
  atlassianAccountId: string;
  azureTenantId: string;
  azureAppId: string;
  azurePassword: string;
}

const emptyForm: CredentialFormData = {
  name: "",
  type: "tempo",
  jiraDomain: "",
  jiraEmail: "",
  jiraApiToken: "",
  tempoApiToken: "",
  atlassianAccountId: "",
  azureTenantId: "",
  azureAppId: "",
  azurePassword: "",
};

export const CredentialModal: FC<CredentialModalProps> = ({
  credentials,
  onAdd,
  onUpdate,
  onDelete,
  onClose,
  onLock,
}) => {
  const [view, setView] = useState<"list" | "add" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CredentialFormData>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const handleAdd = () => {
    setFormData(emptyForm);
    setView("add");
  };

  const handleEdit = (credential: JiraCredential) => {
    setEditingId(credential.id);
    setFormData({
      name: credential.name,
      type: credential.type,
      jiraDomain: credential.jiraDomain,
      jiraEmail: credential.jiraEmail,
      jiraApiToken: credential.jiraApiToken,
      tempoApiToken: credential.tempoApiToken,
      atlassianAccountId: credential.atlassianAccountId,
      azureTenantId: credential.azureTenantId || "",
      azureAppId: credential.azureAppId || "",
      azurePassword: credential.azurePassword || "",
    });
    setView("edit");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (view === "add") {
        await onAdd(formData);
      } else if (view === "edit" && editingId) {
        await onUpdate({ ...formData, id: editingId });
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

  const renderForm = () => (
    <form onSubmit={handleSubmit}>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Name:</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
            placeholder="e.g., Work Jira"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Type:</label>
          <div className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="credentialType"
                value="tempo"
                checked={formData.type === "tempo"}
                onChange={() => setFormData({ ...formData, type: "tempo" })}
              />
              Tempo
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="credentialType"
                value="apptime"
                checked={formData.type === "apptime"}
                onChange={() => setFormData({ ...formData, type: "apptime", tempoApiToken: "" })}
              />
              AppTime
            </label>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Jira Domain:</label>
          <input
            type="text"
            value={formData.jiraDomain}
            onChange={(e) =>
              setFormData({ ...formData, jiraDomain: e.target.value })
            }
            className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
            placeholder="e.g., company.atlassian.net"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Jira Email:</label>
          <input
            type="email"
            value={formData.jiraEmail}
            onChange={(e) =>
              setFormData({ ...formData, jiraEmail: e.target.value })
            }
            className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
            placeholder="your@email.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Jira API Token:
          </label>
          <input
            type="password"
            value={formData.jiraApiToken}
            onChange={(e) =>
              setFormData({ ...formData, jiraApiToken: e.target.value })
            }
            className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
            placeholder="Create at id.atlassian.com"
            required
          />
        </div>
        {formData.type === "tempo" && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Tempo API Token:
            </label>
            <input
              type="password"
              value={formData.tempoApiToken}
              onChange={(e) =>
                setFormData({ ...formData, tempoApiToken: e.target.value })
              }
              className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
              placeholder="Create in Tempo Settings"
              required
            />
          </div>
        )}
        {formData.type === "apptime" && (
          <>
            <div className="border-t border-gray-700 pt-3 mt-1">
              <p className="text-xs text-gray-400 mb-2">
                Azure AD (optional, for Jira behind Azure AD App Proxy)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Azure Tenant ID:</label>
              <input
                type="text"
                value={formData.azureTenantId}
                onChange={(e) => setFormData({ ...formData, azureTenantId: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
                placeholder="e.g., 86359415-f0d5-4ea5-..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Azure App Proxy ID:</label>
              <input
                type="text"
                value={formData.azureAppId}
                onChange={(e) => setFormData({ ...formData, azureAppId: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
                placeholder="e.g., b682f95e-314f-4361-..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Azure AD Password:</label>
              <input
                type="password"
                value={formData.azurePassword}
                onChange={(e) => setFormData({ ...formData, azurePassword: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
                placeholder="Your Azure AD password"
              />
            </div>
          </>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">
            Atlassian Account ID:
          </label>
          <input
            type="text"
            value={formData.atlassianAccountId}
            onChange={(e) =>
              setFormData({ ...formData, atlassianAccountId: e.target.value })
            }
            className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white text-sm"
            placeholder="From your Jira profile URL"
            required
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <button
          type="button"
          onClick={handleCancel}
          className="px-4 py-2 text-white border border-gray-600 rounded hover:bg-gray-600 cursor-pointer"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer disabled:opacity-50"
          disabled={isSubmitting}
        >
          {isSubmitting ? "..." : view === "add" ? "Add" : "Save"}
        </button>
      </div>
    </form>
  );

  const renderList = () => (
    <>
      {credentials.length === 0 ? (
        <p className="text-gray-400 text-sm mb-4">
          No credentials stored. Add your first Jira credential to get started.
        </p>
      ) : (
        <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between p-3 bg-gray-800 rounded border border-gray-700"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {cred.name}
                  <span className="ml-2 text-xs text-gray-500 font-normal">
                    {cred.type === "apptime" ? "AppTime" : "Tempo"}
                  </span>
                </p>
                <p className="text-sm text-gray-400 truncate">
                  {cred.jiraDomain}
                </p>
              </div>
              <div className="flex gap-2 ml-2">
                <button
                  onClick={() => handleEdit(cred)}
                  className="px-2 py-1 text-xs text-white border border-gray-600 rounded hover:bg-gray-600 cursor-pointer"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(cred.id)}
                  className={`px-2 py-1 text-xs border rounded cursor-pointer ${
                    deleteConfirm === cred.id
                      ? "text-red-400 border-red-400 hover:bg-red-900"
                      : "text-white border-gray-600 hover:bg-gray-600"
                  }`}
                >
                  {deleteConfirm === cred.id ? "Confirm?" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-between gap-2">
        <button
          onClick={onLock}
          className="px-4 py-2 text-yellow-400 border border-yellow-400 rounded hover:bg-yellow-900 cursor-pointer"
        >
          Lock
        </button>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white border border-gray-600 rounded hover:bg-gray-600 cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handleAdd}
            className="px-4 py-2 text-white border border-white rounded hover:bg-gray-800 cursor-pointer"
          >
            Add Credential
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-black text-white p-6 rounded-lg shadow-lg max-w-md w-full border border-white max-h-[calc(100vh-2rem)] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">
          {view === "list"
            ? "Manage Jira Credentials"
            : view === "add"
            ? "Add Credential"
            : "Edit Credential"}
        </h3>
        {view === "list" ? renderList() : renderForm()}
      </div>
    </div>
  );
};
