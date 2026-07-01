import { JiraCredential, EncryptedCredentialStore, VaultData } from "../types";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const ITERATIONS = 100000;

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveKey(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVault(
  vault: VaultData,
  password: string
): Promise<EncryptedCredentialStore> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);

  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(vault));

  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  return {
    salt: arrayBufferToBase64(salt.buffer),
    iv: arrayBufferToBase64(iv.buffer),
    data: arrayBufferToBase64(encrypted),
  };
}

export async function decryptVault(
  store: EncryptedCredentialStore,
  password: string
): Promise<VaultData> {
  const salt = new Uint8Array(base64ToArrayBuffer(store.salt));
  const iv = new Uint8Array(base64ToArrayBuffer(store.iv));
  const data = base64ToArrayBuffer(store.data);
  const key = await deriveKey(password, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );

  const decoder = new TextDecoder();
  const parsed = JSON.parse(decoder.decode(decrypted));

  // Backward compatibility: older stores held a bare JiraCredential[] array.
  if (Array.isArray(parsed)) {
    return { credentials: parsed as JiraCredential[] };
  }
  return parsed as VaultData;
}

export function generateCredentialId(): string {
  return crypto.randomUUID();
}
