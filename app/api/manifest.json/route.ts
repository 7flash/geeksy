// app/api/manifest.json/route.ts — PWA Web App Manifest
export async function GET() {
    const manifest = {
        name: 'Geeksy — Personal OS',
        short_name: 'Geeksy',
        description: 'Personal OS for autonomous AI agents',
        start_url: '/',
        display: 'standalone',
        background_color: '#0a0a0f',
        theme_color: '#6366f1',
        orientation: 'any',
        icons: [
            {
                src: 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'><defs><linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='%237c3aed'/><stop offset='100%' stop-color='%23a855f7'/></linearGradient></defs><rect width='512' height='512' rx='96' fill='url(%23g)'/><text x='256' y='320' text-anchor='middle' font-size='256' fill='white'>🤖</text></svg>`),
                sizes: '512x512',
                type: 'image/svg+xml',
                purpose: 'any maskable',
            }
        ],
        categories: ['productivity', 'utilities'],
    }

    return new Response(JSON.stringify(manifest, null, 2), {
        headers: {
            'Content-Type': 'application/manifest+json',
            'Cache-Control': 'public, max-age=86400',
        },
    })
}
