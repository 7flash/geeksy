// app/api/skills/route.ts — Skill discovery API
import { join } from 'path'
import { readdirSync } from 'fs'
import { parseSkillFile } from 'jsx-ai'
import { measureSync } from 'measure-fn'

const skillsDir = join(process.cwd(), 'skills')

export interface SkillInfo {
    id: string         // filename without extension
    name: string
    description: string
    content: string    // full markdown body
    filePath: string
}

// ── GET /api/skills — Discover and return all .md skill files ──

export async function GET() {
    const skills = measureSync('Discover skills', () => {
        const result: SkillInfo[] = []
        try {
            for (const f of readdirSync(skillsDir)) {
                if (!f.endsWith('.md')) continue
                const id = f.replace(/\.md$/, '')
                const filePath = join(skillsDir, f)
                try {
                    const skill = parseSkillFile(filePath)
                    result.push({
                        id,
                        name: skill.name,
                        description: skill.description,
                        content: skill.content,
                        filePath,
                    })
                } catch { /* skip unparseable files */ }
            }
        } catch { /* skills dir doesn't exist yet */ }
        return result
    })

    return Response.json(skills)
}
