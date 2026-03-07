/**
 * Database Export/Import API (used by backup flow)
 * 
 * GET  /api/backup/db → Export all tables as JSON
 * POST /api/backup/db → Import JSON snapshot (overwrite)
 */

import { exportDb, importDb, type DbSnapshot } from '../../lib/backup'
import type { MeasureFn } from 'measure-fn'

/** Export database as JSON */
export async function GET(_req: Request, m: MeasureFn) {
    return m('export-db', () => {
        const snapshot = exportDb()
        return Response.json(snapshot)
    })
}

/** Import database from JSON snapshot */
export async function POST(req: Request, m: MeasureFn) {
    return m('import-db', async () => {
        try {
            const snapshot = await req.json() as DbSnapshot

            if (!snapshot.version || !snapshot.tables) {
                return Response.json({ error: 'Invalid snapshot format' }, { status: 400 })
            }

            const result = importDb(snapshot)
            return Response.json({ success: true, ...result })
        } catch (error) {
            return Response.json({ error: `Import failed: ${error}` }, { status: 500 })
        }
    })
}
