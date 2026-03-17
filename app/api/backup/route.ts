/**
 * Cloud Backup API
 * 
 * POST /api/backup       → Create encrypted backup (upload)
 * GET  /api/backup       → List backups for authenticated user
 * GET  /api/backup?id=X  → Download specific backup
 * DELETE /api/backup     → Delete backup by id
 * 
 * All endpoints require GitHub token in Authorization header.
 * Backups are stored as encrypted blobs — server cannot read them.
 */

import { db } from '../../lib/db'
import type { MeasureFn } from 'measure-fn'
import { join } from 'path'
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, readFileSync } from 'fs'
import { backupsDir } from '../../lib/paths'

const BACKUPS_DIR = backupsDir
const MAX_BACKUPS = 5
const MAX_SIZE_BYTES = 50 * 1024 * 1024 // 50MB

/** Validate GitHub token and return user ID */
async function validateAuth(req: Request): Promise<{ id: number; login: string } | null> {
    const auth = req.headers.get('Authorization')
    if (!auth?.startsWith('Bearer ')) return null

    try {
        const res = await fetch('https://api.github.com/user', {
            headers: { Authorization: auth },
        })
        if (!res.ok) return null
        const user = await res.json() as { id: number; login: string }
        return { id: user.id, login: user.login }
    } catch {
        return null
    }
}

/** Ensure user backup directory exists */
function ensureUserDir(userId: number): string {
    const dir = join(BACKUPS_DIR, String(userId))
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    return dir
}

/** Create a backup */
export async function POST(req: Request, m: MeasureFn) {
    const user = await validateAuth(req)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    return m('create-backup', async () => {
        const body = await req.json() as {
            data: string   // base64 encrypted blob
            salt: string   // base64 salt
            iv: string     // base64 iv
        }

        if (!body.data || !body.salt || !body.iv) {
            return Response.json({ error: 'Missing data, salt, or iv' }, { status: 400 })
        }

        // Size check (base64 is ~33% larger than raw)
        const estimatedSize = body.data.length * 0.75
        if (estimatedSize > MAX_SIZE_BYTES) {
            return Response.json({ error: `Backup too large (${Math.round(estimatedSize / 1024 / 1024)}MB, max ${MAX_SIZE_BYTES / 1024 / 1024}MB)` }, { status: 413 })
        }

        const userDir = ensureUserDir(user.id)
        const timestamp = Date.now()
        const backupFile = join(userDir, `${timestamp}.json`)

        // Export DB table counts for metadata (not the data itself — that's encrypted on client)
        const tables = ['agents', 'messages', 'objectives', 'files', 'schedules', 'agentState', 'plugins'] as const
        const counts: Record<string, number> = {}
        for (const table of tables) {
            try {
                counts[table] = (db as any)[table]?.all?.()?.length ?? 0
            } catch { counts[table] = 0 }
        }

        const backup = {
            version: 1,
            timestamp,
            userId: user.id,
            userLogin: user.login,
            data: body.data,
            salt: body.salt,
            iv: body.iv,
            meta: { counts },
        }

        writeFileSync(backupFile, JSON.stringify(backup))

        // Prune old backups (keep last MAX_BACKUPS)
        const files = readdirSync(userDir)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse()

        for (let i = MAX_BACKUPS; i < files.length; i++) {
            unlinkSync(join(userDir, files[i]))
        }

        return Response.json({
            id: timestamp,
            timestamp,
            size: body.data.length,
            counts,
        })
    })
}

/** List or download backups */
export async function GET(req: Request, m: MeasureFn) {
    const user = await validateAuth(req)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const id = url.searchParams.get('id')

    // Download specific backup
    if (id) {
        return m('download-backup', async () => {
            const userDir = ensureUserDir(user.id)
            const backupFile = join(userDir, `${id}.json`)

            if (!existsSync(backupFile)) {
                return Response.json({ error: 'Backup not found' }, { status: 404 })
            }

            const raw = readFileSync(backupFile, 'utf-8')
            const backup = JSON.parse(raw)

            return Response.json({
                data: backup.data,
                salt: backup.salt,
                iv: backup.iv,
                timestamp: backup.timestamp,
                meta: backup.meta,
            })
        })
    }

    // List all backups
    return m('list-backups', async () => {
        const userDir = ensureUserDir(user.id)
        const files = readdirSync(userDir)
            .filter(f => f.endsWith('.json'))
            .sort()
            .reverse()

        const backups = files.map(f => {
            try {
                const raw = readFileSync(join(userDir, f), 'utf-8')
                const backup = JSON.parse(raw)
                return {
                    id: backup.timestamp,
                    timestamp: backup.timestamp,
                    size: backup.data?.length ?? 0,
                    counts: backup.meta?.counts ?? {},
                }
            } catch {
                return null
            }
        }).filter(Boolean)

        return Response.json({ backups })
    })
}

/** Delete a backup */
export async function DELETE(req: Request, m: MeasureFn) {
    const user = await validateAuth(req)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) return Response.json({ error: 'Missing id parameter' }, { status: 400 })

    const userDir = ensureUserDir(user.id)
    const backupFile = join(userDir, `${id}.json`)

    if (!existsSync(backupFile)) {
        return Response.json({ error: 'Backup not found' }, { status: 404 })
    }

    unlinkSync(backupFile)
    return Response.json({ deleted: true, id })
}
