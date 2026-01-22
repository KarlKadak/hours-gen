import { FC, useState, FormEvent } from "react";

interface PasswordModalProps {
  mode: "create" | "unlock";
  onSubmit: (password: string) => Promise<boolean>;
  onClose: () => void;
  error?: string | null;
}

export const PasswordModal: FC<PasswordModalProps> = ({
  mode,
  onSubmit,
  onClose,
  error,
}) => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (mode === "create" && password !== confirmPassword) {
      setLocalError("Passwords do not match");
      return;
    }

    if (password.length < 4) {
      setLocalError("Password must be at least 4 characters");
      return;
    }

    setIsSubmitting(true);
    const success = await onSubmit(password);
    setIsSubmitting(false);

    if (!success) {
      setPassword("");
      setConfirmPassword("");
    }
  };

  const displayError = localError || error;

  return (
    <div
      className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-black text-white p-6 rounded-lg shadow-lg max-w-sm w-full border border-white"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold mb-4">
          {mode === "create"
            ? "Set Master Password"
            : "Enter Master Password"}
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          {mode === "create"
            ? "Create a master password to encrypt your Jira credentials. You will need this password to access your stored credentials."
            : "Enter your master password to unlock your stored Jira credentials."}
        </p>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Password:
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
                autoFocus
                disabled={isSubmitting}
              />
            </div>
            {mode === "create" && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Confirm Password:
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-800 text-white border border-gray-600 rounded focus:border-white"
                  disabled={isSubmitting}
                />
              </div>
            )}
            {displayError && (
              <p className="text-red-400 text-sm">{displayError}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
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
              {isSubmitting
                ? "..."
                : mode === "create"
                ? "Create"
                : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
