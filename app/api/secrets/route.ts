import { deleteSecret, getSecret, listSecrets, upsertSecret } from '../../lib/secrets'

export async function GET(req: Request) {
    const url = new URL(req.url)
    const key = url.searchParams.get('key')?.trim()
    if (key) {
        const secret = await getSecret(key)
        return Response.json({
            key,
            exists: !!secret,
            description: secret?.description || '',
            updatedAt: secret?.updatedAt || null,
            hasValue: !!secret?.value,
        })
    }

    const secrets = await listSecrets()
    return Response.json(secrets)
}

export async function POST(req: Request) {
    const body = await req.json() as { key?: string; value?: string; description?: string }
    const key = body.key?.trim()
    if (!key) return Response.json({ error: 'Missing key' }, { status: 400 })

    const saved = await upsertSecret(key, body.value || '', body.description)
    return Response.json({ ok: true, key: saved.key, updatedAt: saved.updatedAt })
}

export async function DELETE(req: Request) {
    const url = new URL(req.url)
    const key = url.searchParams.get('key')?.trim()
    if (!key) return Response.json({ error: 'Missing key' }, { status: 400 })

    await deleteSecret(key)
    return Response.json({ ok: true })
}
