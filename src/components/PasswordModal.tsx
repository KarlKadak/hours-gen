import { FC, useState, FormEvent } from "react";
import { Modal } from "./Modal";

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
    <Modal
      title={mode === "create" ? "Set master password" : "Unlock vault"}
      onClose={onClose}
      size="sm"
    >
      <p className="mb-4 text-sm text-[var(--text-muted)]">
        {mode === "create"
          ? "Create a master password to encrypt your Jira credentials and Clockify key. You'll need it to access them again."
          : "Enter your master password to unlock your stored credentials."}
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label" htmlFor="master-password">
            Password
          </label>
          <input
            id="master-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="control w-full"
            autoFocus
            disabled={isSubmitting}
          />
        </div>
        {mode === "create" && (
          <div>
            <label className="label" htmlFor="confirm-password">
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="control w-full"
              disabled={isSubmitting}
            />
          </div>
        )}
        {displayError && (
          <p className="text-sm text-[var(--danger)]">{displayError}</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "…" : mode === "create" ? "Create" : "Unlock"}
          </button>
        </div>
      </form>
    </Modal>
  );
};
