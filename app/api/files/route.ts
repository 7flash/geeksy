// app/api/files/route.ts — Read file contents for the Files tab preview
import { resolve, normalize } from 'path'
import { existsSync, readFileSync, statSync } from 'fs'
import { appHome, appRoot } from '../../lib/paths'

const MAX_SIZE = 256 * 1024 // 256KB preview limit

export async function GET(req: Request) {
    const url = new URL(req.url)
    const filePath = url.searchParams.get('path')
    if (!filePath) return Response.json({ error: 'Missing path' }, { status: 400 })

    // Resolve against appHome (cwd in CLI mode) — same as agent execution cwd
    const resolved = resolve(appHome, filePath)
    const normalized = normalize(resolved)

    // Security: only allow reads under appHome or appRoot
    if (!normalized.startsWith(normalize(appHome)) && !normalized.startsWith(normalize(appRoot))) {
        return Response.json({ error: 'Path outside allowed directories' }, { status: 403 })
    }

    if (!existsSync(normalized)) {
        return Response.json({ error: 'File not found', path: filePath }, { status: 404 })
    }

    try {
        const stat = statSync(normalized)
        if (stat.isDirectory()) {
            return Response.json({ error: 'Path is a directory', path: filePath }, { status: 400 })
        }

        if (stat.size > MAX_SIZE) {
            const preview = readFileSync(normalized, 'utf-8').substring(0, MAX_SIZE)
            return Response.json({
                path: filePath,
                size: stat.size,
                truncated: true,
                content: preview,
                modifiedAt: stat.mtimeMs,
            })
        }

        const content = readFileSync(normalized, 'utf-8')
        return Response.json({
            path: filePath,
            size: stat.size,
            truncated: false,
            content,
            modifiedAt: stat.mtimeMs,
        })
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
