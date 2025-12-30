/**
 * Crypto utilities for secure handshake.
 * Uses AES-GCM 256-bit encryption with PBKDF2 key derivation.
 */

// Configuration constants
const PBKDF2_ITERATIONS = 100000;
const SALT_SIZE_BYTES = 16;
const IV_SIZE_BYTES = 12;
const KEY_SIZE_BITS = 256;



/**
 * Encrypts a plaintext string using a password.
 * Returns a URL-safe Base64 string containing [Salt + IV + Ciphertext].
 */
export async function encryptMessage(plaintext: string, password: string): Promise<string> {
    const enc = new TextEncoder();
    const passwordKey = await importPassword(password);

    // Generate random Salt
    const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE_BYTES));

    // Derive AES-GCM Key
    const aesKey = await deriveKey(passwordKey, salt);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE_BYTES));

    // Encrypt
    const content = enc.encode(plaintext);
    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: iv
        },
        aesKey,
        content
    );

    // Concatenate: Salt + IV + Ciphertext
    const ciphertext = new Uint8Array(encryptedBuffer);
    const packaged = new Uint8Array(salt.length + iv.length + ciphertext.length);
    packaged.set(salt, 0);
    packaged.set(iv, salt.length);
    packaged.set(ciphertext, salt.length + iv.length);

    // Encode to URL-safe Base64
    return arrayBufferToBase64Url(packaged);
}



/**
 * Decrypts a URL-safe Base64 string using a password.
 * Returns the plaintext string.
 * Throws an error if decryption fails (wrong password or tampering).
 */
export async function decryptMessage(encryptedBase64: string, password: string): Promise<string> {
    const packaged = base64UrlToArrayBuffer(encryptedBase64);

    if (packaged.byteLength < SALT_SIZE_BYTES + IV_SIZE_BYTES) {
        throw new Error("Invalid message format: too short");
    }

    // Extract parts
    const salt = packaged.slice(0, SALT_SIZE_BYTES);
    const iv = packaged.slice(SALT_SIZE_BYTES, SALT_SIZE_BYTES + IV_SIZE_BYTES);
    const ciphertext = packaged.slice(SALT_SIZE_BYTES + IV_SIZE_BYTES);

    // Derive Key
    const passwordKey = await importPassword(password);
    const aesKey = await deriveKey(passwordKey, salt);

    // Decrypt
    try {
        const decryptedBuffer = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            aesKey,
            ciphertext
        );

        const dec = new TextDecoder();
        return dec.decode(decryptedBuffer);
    } catch (e) {
        throw new Error("Decryption failed. Wrong password or corrupted data.");
    }
}



// Import the password string as a Key for derivation
async function importPassword(password: string): Promise<CryptoKey> {
    const enc = new TextEncoder();
    return crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
}


// Derive the actual AES key from the password key + salt
async function deriveKey(passwordKey: CryptoKey, salt: Uint8Array): Promise<CryptoKey> {
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        passwordKey,
        { name: "AES-GCM", length: KEY_SIZE_BITS },
        false,
        ["encrypt", "decrypt"]
    );
}


function arrayBufferToBase64Url(buffer: Uint8Array): string {
    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    const b64 = btoa(binary);
    // URL-safe replacements
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}


function base64UrlToArrayBuffer(base64Url: string): Uint8Array {
    let b64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";

    const binary = atob(b64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}
