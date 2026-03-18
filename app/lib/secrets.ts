import { secretsPath } from './paths'

export interface StoredSecret {
    key: string
    value: string
    description?: string
    updatedAt: number
}

export interface SecretStore {
    secrets: Record<string, StoredSecret>
}

async function loadStore(): Promise<SecretStore> {
    try {
        const file = Bun.file(secretsPath)
        if (await file.exists()) {
            const parsed = JSON.parse(await file.text()) as SecretStore
            if (parsed && parsed.secrets && typeof parsed.secrets === 'object') return parsed
        }
    } catch { }
    return { secrets: {} }
}

async function saveStore(store: SecretStore) {
    await Bun.write(secretsPath, JSON.stringify(store, null, 2))
}

export async function listSecrets(): Promise<Array<{ key: string; description?: string; updatedAt: number; hasValue: boolean }>> {
    const store = await loadStore()
    return Object.values(store.secrets)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((secret) => ({
            key: secret.key,
            description: secret.description,
            updatedAt: secret.updatedAt,
            hasValue: !!secret.value,
        }))
}

export async function getSecret(key: string): Promise<StoredSecret | null> {
    const store = await loadStore()
    return store.secrets[key] || null
}

export async function upsertSecret(key: string, value: string, description?: string) {
    const normalizedKey = key.trim()
    if (!normalizedKey) throw new Error('Missing key')
    const store = await loadStore()
    store.secrets[normalizedKey] = {
        key: normalizedKey,
        value,
        description: description?.trim() || undefined,
        updatedAt: Date.now(),
    }
    await saveStore(store)
    return store.secrets[normalizedKey]
}

export async function deleteSecret(key: string) {
    const normalizedKey = key.trim()
    if (!normalizedKey) throw new Error('Missing key')
    const store = await loadStore()
    delete store.secrets[normalizedKey]
    await saveStore(store)
}

export function createSecretRequestMarker(payload: { key: string; label?: string; description?: string }) {
    return `[[GEEKSY_SECRET_REQUEST]]${JSON.stringify({
        key: payload.key,
        label: payload.label || payload.key,
        description: payload.description || '',
    })}`
}

export function parseSecretRequestMarker(content: string): { key: string; label: string; description?: string } | null {
    const prefix = '[[GEEKSY_SECRET_REQUEST]]'
    if (!content.startsWith(prefix)) return null
    try {
        return JSON.parse(content.slice(prefix.length))
    } catch {
        return null
    }
}
