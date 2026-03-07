/**
 * Database export/import for cloud backup.
 * Exports all tables as JSON, imports with conflict resolution.
 */

import { db } from './db'

const TABLES = ['agents', 'messages', 'objectives', 'files', 'schedules', 'agentState', 'plugins'] as const

export interface DbSnapshot {
    version: 1
    timestamp: number
    tables: Record<string, any[]>
}

/** Export entire database as a JSON-serializable snapshot */
export function exportDb(): DbSnapshot {
    const tables: Record<string, any[]> = {}

    for (const table of TABLES) {
        try {
            tables[table] = (db as any)[table]?.all?.() ?? []
        } catch {
            tables[table] = []
        }
    }

    return {
        version: 1,
        timestamp: Date.now(),
        tables,
    }
}

/** Import a snapshot into the database. Overwrites existing data. */
export function importDb(snapshot: DbSnapshot): { imported: Record<string, number> } {
    const imported: Record<string, number> = {}

    // Clear existing data (in reverse dependency order)
    const clearOrder = ['agentState', 'files', 'objectives', 'messages', 'schedules', 'plugins', 'agents'] as const
    for (const table of clearOrder) {
        try {
            const all = (db as any)[table]?.all?.() ?? []
            for (const row of all) {
                (db as any)[table]?.delete?.(row.id)
            }
        } catch { /* table might not exist */ }
    }

    // Insert in dependency order (agents first, then children)
    const insertOrder = ['agents', 'plugins', 'schedules', 'messages', 'objectives', 'files', 'agentState'] as const
    for (const table of insertOrder) {
        const rows = snapshot.tables[table] ?? []
        let count = 0
        for (const row of rows) {
            try {
                // Strip auto-generated fields, let ORM assign new IDs if needed
                const { id, createdAt, updatedAt, ...data } = row
                    ; (db as any)[table]?.create?.(data)
                count++
            } catch {
                // Skip rows that fail (e.g. FK constraint)
            }
        }
        imported[table] = count
    }

    return { imported }
}
