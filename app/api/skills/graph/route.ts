// app/api/skills/graph/route.ts — Skill Dependency Graph Data
// GET /api/skills/graph — returns nodes and edges for skill dependency visualization

export async function GET() {
    try {
        const fs = require('fs')
        const path = require('path')
        const skillsDir = path.join(process.cwd(), 'skills')

        if (!fs.existsSync(skillsDir)) {
            return Response.json({ nodes: [], edges: [] })
        }

        const files = fs.readdirSync(skillsDir).filter((f: string) => f.endsWith('.md'))
        const skills: Array<{ id: string; name: string; content: string }> = []

        for (const file of files) {
            const content = fs.readFileSync(path.join(skillsDir, file), 'utf-8')
            // Parse YAML frontmatter for name
            const match = content.match(/^---\s*\n([\s\S]*?)\n---/)
            let name = file.replace('.md', '')
            if (match) {
                const nameMatch = match[1].match(/name:\s*(.+)/)
                if (nameMatch) name = nameMatch[1].trim()
            }
            skills.push({ id: file.replace('.md', ''), name, content })
        }

        // Build nodes
        const nodes = skills.map(s => ({
            id: s.id,
            name: s.name,
        }))

        // Build edges by finding references to other skill names/ids in content
        const edges: Array<{ source: string; target: string }> = []
        for (const skill of skills) {
            for (const other of skills) {
                if (skill.id === other.id) continue
                // Check if this skill references the other by name or id
                const lower = skill.content.toLowerCase()
                if (
                    lower.includes(other.id.toLowerCase()) ||
                    lower.includes(other.name.toLowerCase())
                ) {
                    edges.push({ source: skill.id, target: other.id })
                }
            }
        }

        return Response.json({ nodes, edges })
    } catch (e: any) {
        return Response.json({ nodes: [], edges: [], error: e.message })
    }
}
