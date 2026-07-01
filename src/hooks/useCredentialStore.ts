import { useState, useEffect, useCallback } from "react";
import { JiraCredential, EncryptedCredentialStore } from "../types";
import {
  encryptVault,
  decryptVault,
  generateCredentialId,
} from "../utils/crypto";

const STORAGE_KEY = "jiraCredentialStore";

export interface CredentialStoreState {
  isInitialized: boolean;
  hasStore: boolean;
  isUnlocked: boolean;
  credentials: JiraCredential[];
  clockifyApiKey: string | null;
  error: string | null;
}

export interface CredentialStoreActions {
  initializeStore: (password: string) => Promise<boolean>;
  unlock: (password: string) => Promise<boolean>;
  lock: () => void;
  addCredential: (
    credential: Omit<JiraCredential, "id">
  ) => Promise<JiraCredential>;
  updateCredential: (credential: JiraCredential) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
  setClockifyApiKey: (key: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<boolean>;
}

export function useCredentialStore(): [
  CredentialStoreState,
  CredentialStoreActions
] {
  const [state, setState] = useState<CredentialStoreState>({
    isInitialized: false,
    hasStore: false,
    isUnlocked: false,
    credentials: [],
    clockifyApiKey: null,
    error: null,
  });

  const [masterPassword, setMasterPassword] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setState((prev) => ({
      ...prev,
      isInitialized: true,
      hasStore: stored !== null,
    }));
  }, []);

  const saveVault = useCallback(
    async (
      credentials: JiraCredential[],
      clockifyApiKey: string | undefined,
      password: string
    ) => {
      const encrypted = await encryptVault({ credentials, clockifyApiKey }, password);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
    },
    []
  );

  const initializeStore = useCallback(async (password: string) => {
    try {
      const encrypted = await encryptVault({ credentials: [] }, password);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted));
      setMasterPassword(password);
      setState((prev) => ({
        ...prev,
        hasStore: true,
        isUnlocked: true,
        credentials: [],
        clockifyApiKey: null,
        error: null,
      }));
      return true;
    } catch {
      setState((prev) => ({
        ...prev,
        error: "Failed to initialize credential store",
      }));
      return false;
    }
  }, []);

  const unlock = useCallback(async (password: string) => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        setState((prev) => ({ ...prev, error: "No credential store found" }));
        return false;
      }

      const encryptedStore: EncryptedCredentialStore = JSON.parse(stored);
      const vault = await decryptVault(encryptedStore, password);
      const credentials = vault.credentials.map(
        (c) => ({ ...c, type: c.type || "tempo" }) as JiraCredential
      );

      setMasterPassword(password);
      setState((prev) => ({
        ...prev,
        isUnlocked: true,
        credentials,
        clockifyApiKey: vault.clockifyApiKey ?? null,
        error: null,
      }));
      return true;
    } catch {
      setState((prev) => ({ ...prev, error: "Invalid password" }));
      return false;
    }
  }, []);

  const lock = useCallback(() => {
    setMasterPassword(null);
    setState((prev) => ({
      ...prev,
      isUnlocked: false,
      credentials: [],
      clockifyApiKey: null,
      error: null,
    }));
  }, []);

  const addCredential = useCallback(
    async (credential: Omit<JiraCredential, "id">) => {
      if (!masterPassword) throw new Error("Store is locked");

      const newCredential: JiraCredential = {
        ...credential,
        id: generateCredentialId(),
      };

      const updatedCredentials = [...state.credentials, newCredential];
      await saveVault(updatedCredentials, state.clockifyApiKey ?? undefined, masterPassword);

      setState((prev) => ({
        ...prev,
        credentials: updatedCredentials,
      }));

      return newCredential;
    },
    [masterPassword, state.credentials, state.clockifyApiKey, saveVault]
  );

  const updateCredential = useCallback(
    async (credential: JiraCredential) => {
      if (!masterPassword) throw new Error("Store is locked");

      const updatedCredentials = state.credentials.map((c) =>
        c.id === credential.id ? credential : c
      );
      await saveVault(updatedCredentials, state.clockifyApiKey ?? undefined, masterPassword);

      setState((prev) => ({
        ...prev,
        credentials: updatedCredentials,
      }));
    },
    [masterPassword, state.credentials, state.clockifyApiKey, saveVault]
  );

  const deleteCredential = useCallback(
    async (id: string) => {
      if (!masterPassword) throw new Error("Store is locked");

      const updatedCredentials = state.credentials.filter((c) => c.id !== id);
      await saveVault(updatedCredentials, state.clockifyApiKey ?? undefined, masterPassword);

      setState((prev) => ({
        ...prev,
        credentials: updatedCredentials,
      }));
    },
    [masterPassword, state.credentials, state.clockifyApiKey, saveVault]
  );

  const setClockifyApiKey = useCallback(
    async (key: string) => {
      if (!masterPassword) throw new Error("Store is locked");

      const trimmed = key.trim();
      await saveVault(state.credentials, trimmed || undefined, masterPassword);

      setState((prev) => ({
        ...prev,
        clockifyApiKey: trimmed || null,
      }));
    },
    [masterPassword, state.credentials, saveVault]
  );

  const changePassword = useCallback(
    async (oldPassword: string, newPassword: string) => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return false;

        const encryptedStore: EncryptedCredentialStore = JSON.parse(stored);
        const vault = await decryptVault(encryptedStore, oldPassword);
        await saveVault(vault.credentials, vault.clockifyApiKey, newPassword);

        setMasterPassword(newPassword);
        return true;
      } catch {
        setState((prev) => ({ ...prev, error: "Invalid current password" }));
        return false;
      }
    },
    [saveVault]
  );

  return [
    state,
    {
      initializeStore,
      unlock,
      lock,
      addCredential,
      updateCredential,
      deleteCredential,
      setClockifyApiKey,
      changePassword,
    },
  ];
}
