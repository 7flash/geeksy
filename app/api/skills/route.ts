// app/api/skills/route.ts — Skill discovery API with plugin provenance
import { join, resolve, basename } from 'path'
import { readdirSync, readFileSync, existsSync } from 'fs'
import { parseSkillFile } from 'jsx-ai'
import { measureSync } from 'measure-fn'
import { db } from '../../lib/db'
import { skillsDir, workspaceRoot } from '../../lib/paths'

export interface SkillInfo {
    id: string
    name: string
    description: string
    content: string
    filePath: string
    plugin?: {
        name: string
        icon: string
        packageName: string
        status: string
        api?: any
    }
}

function buildSkillPluginMap(): Map<string, SkillInfo['plugin']> {
    const map = new Map<string, SkillInfo['plugin']>()
    const codeDir = workspaceRoot

    try {
        const plugins = db.plugins.select().all() as any[]
        for (const plugin of plugins) {
            const candidates = [
                resolve(codeDir, plugin.packageName),
                ...(() => {
                    try {
                        return readdirSync(codeDir)
                            .map(d => resolve(codeDir, d))
                            .filter(d => {
                                try {
                                    const pkg = resolve(d, 'package.json')
                                    if (!existsSync(pkg)) return false
                                    const json = JSON.parse(readFileSync(pkg, 'utf8'))
                                    return json.name === plugin.packageName
                                } catch { return false }
                            })
                    } catch { return [] }
                })(),
            ]

            for (const pluginDir of candidates) {
                const manifestPaths = [
                    resolve(pluginDir, 'geeksy-plugin.json'),
                    resolve(pluginDir, 'plugin.json'),
                ]

                let found = false
                for (const mp of manifestPaths) {
                    if (!existsSync(mp)) continue
                    try {
                        const manifest = JSON.parse(readFileSync(mp, 'utf8'))
                        if (manifest.skills) {
                            for (const skillPath of manifest.skills) {
                                const skillId = basename(skillPath).replace(/\.md$/, '')
                                map.set(skillId, {
                                    name: manifest.displayName || manifest.name || plugin.name,
                                    icon: manifest.icon || plugin.icon || '🧩',
                                    packageName: plugin.packageName,
                                    status: plugin.status || 'installed',
                                    api: manifest.api || undefined,
                                })
                            }
                        }
                        found = true
                        break
                    } catch { }
                }
                if (found) break
            }
        }
    } catch { }

    return map
}

export async function GET() {
    const skills = measureSync('Discover skills', () => {
        const pluginMap = buildSkillPluginMap()
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
                        plugin: pluginMap.get(id),
                    })
                } catch { }
            }
        } catch { }
        return result
    })

    return Response.json(skills)
}
