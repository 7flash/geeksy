/**
 * Client-side AES-256-GCM encryption for cloud backups.
 * Uses Web Crypto API — zero dependencies.
 * 
 * Flow: passphrase → PBKDF2 → AES-256-GCM key → encrypt/decrypt
 * Salt and IV are random per backup, stored alongside ciphertext.
 */

const PBKDF2_ITERATIONS = 100_000

/** Derive an AES-256-GCM key from a user passphrase + salt */
async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder()
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(passphrase),
        'PBKDF2',
        false,
        ['deriveKey']
    )
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt as BufferSource,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    )
}

/** Encrypt plaintext with AES-256-GCM using a passphrase. Returns { ciphertext, salt, iv } as base64. */
export async function encrypt(plaintext: string, passphrase: string): Promise<{
    data: string   // base64 ciphertext
    salt: string   // base64 salt
    iv: string     // base64 iv
}> {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveKey(passphrase, salt)

    const enc = new TextEncoder()
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        enc.encode(plaintext)
    )

    return {
        data: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
        salt: btoa(String.fromCharCode(...salt)),
        iv: btoa(String.fromCharCode(...iv)),
    }
}

/** Decrypt base64 ciphertext with AES-256-GCM using a passphrase + salt + iv. */
export async function decrypt(data: string, salt: string, iv: string, passphrase: string): Promise<string> {
    const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0))
    const ivBytes = Uint8Array.from(atob(iv), c => c.charCodeAt(0))
    const ciphertext = Uint8Array.from(atob(data), c => c.charCodeAt(0))

    const key = await deriveKey(passphrase, saltBytes)

    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes },
        key,
        ciphertext
    )

    return new TextDecoder().decode(plaintext)
}
