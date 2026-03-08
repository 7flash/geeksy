// app/api/plugins/registry/route.ts — Discovers plugins from npm community
export const dynamic = 'force-dynamic'

export async function GET() {
    try {
        // Query npm for packages tagged with geeksy-plugin
        const res = await fetch('https://registry.npmjs.org/-/v1/search?text=keywords:geeksy-plugin&size=50', {
            headers: { Accept: 'application/json' },
            // timeout
            signal: AbortSignal.timeout(5000),
        })

        if (!res.ok) {
            throw new Error(`npm registry error: ${res.status}`)
        }

        const data = await res.json()
        const packages = data.objects.map((obj: any) => ({
            name: obj.package.name.replace(/^geeksy-|-plugin$/g, '').replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            packageName: obj.package.name,
            description: obj.package.description,
            version: obj.package.version,
            author: obj.package.publisher?.username || obj.package.author?.name || 'community',
            icon: obj.package.name.includes('telegram') ? '📱' :
                obj.package.name.includes('discord') ? '💬' :
                    obj.package.name.includes('github') ? '🐙' :
                        obj.package.name.includes('pumpfun') ? '💊' : '🧩',
            date: obj.package.date,
            links: obj.package.links
        }))

        // Curated fallbacks/officials if NPM is empty or missing them
        const curated = [
            {
                name: "Telegram",
                packageName: "geeksy-telegram-plugin",
                description: "Connect your Telegram account. Agents read & send messages via MTProto.",
                version: "1.0.0",
                author: "galaxydo",
                icon: "📱"
            },
            {
                name: "Discord",
                packageName: "geeksy-discord-plugin",
                description: "Bot & user account integration for Discord servers.",
                version: "1.0.0",
                author: "galaxydo",
                icon: "💬"
            },
            {
                name: "GitHub",
                packageName: "geeksy-github-plugin",
                description: "PR reviews, issue management, and CI/CD monitoring.",
                version: "1.0.0",
                author: "galaxydo",
                icon: "🐙"
            },
            {
                name: "PumpFun",
                packageName: "geeksy-pumpfun-plugin",
                description: "Automated trading and sniping plugin for PumpFun tokens.",
                version: "1.0.0",
                author: "galaxydo",
                icon: "💊"
            }
        ]

        // Merge packages with curated (preferring NPM data if overlap by packageName)
        const merged = new Map()
        for (const c of curated) merged.set(c.packageName, c)
        for (const p of packages) merged.set(p.packageName, p)

        return Response.json(Array.from(merged.values()))
    } catch (e: any) {
        return Response.json({ error: e.message || 'Failed to fetch registry' }, { status: 500 })
    }
}
