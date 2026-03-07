/**
 * GitHub OAuth for Geeksy Cloud Backup
 * 
 * GET  /api/auth/github           → Returns OAuth URL
 * GET  /api/auth/github?code=...  → Exchange code for token
 * GET  /api/auth/me               → Validate token, return profile
 * POST /api/auth/logout           → Clear session
 */

import type { MeasureFn } from 'measure-fn'

// GitHub OAuth App credentials — set in .config.toml or env
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || ''
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || ''

/** Initiate OAuth or exchange code */
export async function GET(req: Request, m: MeasureFn) {
    const url = new URL(req.url)

    // --- Exchange code for token ---
    const code = url.searchParams.get('code')
    if (code) {
        return m('exchange-code', async () => {
            const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    client_id: GITHUB_CLIENT_ID,
                    client_secret: GITHUB_CLIENT_SECRET,
                    code,
                }),
            })
            const tokenData = await tokenRes.json() as { access_token?: string; error?: string }

            if (!tokenData.access_token) {
                return Response.json({ error: tokenData.error || 'Failed to get token' }, { status: 400 })
            }

            // Fetch user profile
            const userRes = await fetch('https://api.github.com/user', {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
            })
            const user = await userRes.json() as { id: number; login: string; avatar_url: string }

            return Response.json({
                token: tokenData.access_token,
                user: {
                    id: user.id,
                    login: user.login,
                    avatar: user.avatar_url,
                },
            })
        })
    }

    // --- Check if we have client ID configured ---
    if (!GITHUB_CLIENT_ID) {
        return Response.json({
            error: 'GitHub OAuth not configured. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .config.toml or env.',
            configured: false,
        }, { status: 503 })
    }

    // --- Return OAuth URL ---
    const redirectUri = `${url.origin}/api/auth/github`
    const scope = 'read:user'
    const state = crypto.randomUUID()

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=${state}`

    return Response.json({ url: authUrl, state })
}
