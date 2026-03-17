// app/lib/skill-discovery-tool.ts — Agent tools for skill/plugin discovery and installation
import type { Tool } from 'smart-agent-ai'
import { skillsDir } from './paths'
import { join } from 'path'
import { readdirSync, existsSync } from 'fs'

export function createSkillDiscoveryTools(): Tool[] {
    return [searchSkillsTool(), installSkillTool()]
}

function searchSkillsTool(): Tool {
    return {
        name: 'search_skills',
        description: `Search for available skills and plugins that can extend Geeksy's capabilities.
Use this tool FIRST when a user asks for something that might need a specialized skill or plugin you don't already have.
Examples: YouTube transcripts, trading, browser automation, Discord integration, data pipelines.
Returns both installed skills and available marketplace/registry entries.`,
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Search query describing the capability needed (e.g. "youtube transcripts", "telegram bot", "web scraping")',
                },
            },
            required: ['query'],
        },
        execute: async (params: any) => {
            const query = (params.query || '').toLowerCase()
            const results: any[] = []

            // 1. Check installed skills
            try {
                const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'))
                for (const f of files) {
                    const id = f.replace(/\.md$/, '')
                    const name = id.replace(/-/g, ' ')
                    if (name.includes(query) || id.includes(query)) {
                        results.push({ type: 'installed_skill', id, name, status: 'installed' })
                    }
                }
            } catch { }

            // 2. Check marketplace skills
            try {
                const res = await fetch('http://localhost:' + (process.env.BUN_PORT || '3737') + '/api/skills/marketplace')
                if (res.ok) {
                    const data = await res.json()
                    const skills = data.skills || []
                    for (const s of skills) {
                        const matchFields = [s.id, s.name, s.description, ...(s.tags || [])].join(' ').toLowerCase()
                        if (matchFields.includes(query)) {
                            results.push({
                                type: 'marketplace_skill',
                                id: s.id,
                                name: s.name,
                                description: s.description,
                                tags: s.tags,
                                installed: s.installed,
                                icon: s.icon,
                            })
                        }
                    }
                }
            } catch { }

            // 3. Check plugin registry
            try {
                const res = await fetch('http://localhost:' + (process.env.BUN_PORT || '3737') + '/api/plugins/registry')
                if (res.ok) {
                    const plugins = await res.json()
                    if (Array.isArray(plugins)) {
                        for (const p of plugins) {
                            const matchFields = [p.packageName, p.name, p.description || ''].join(' ').toLowerCase()
                            if (matchFields.includes(query)) {
                                results.push({
                                    type: 'registry_plugin',
                                    packageName: p.packageName,
                                    name: p.name,
                                    description: p.description,
                                    icon: p.icon,
                                    version: p.version,
                                })
                            }
                        }
                    }
                }
            } catch { }

            if (results.length === 0) {
                return {
                    success: true,
                    output: `No skills or plugins found matching "${params.query}". You can still try to accomplish the task with built-in tools (exec, read_file, write_file, schedule).`,
                }
            }

            return {
                success: true,
                output: JSON.stringify({
                    query: params.query,
                    found: results.length,
                    results,
                    hint: 'If a skill or plugin would help, offer to install it for the user. Use install_skill to install marketplace skills.',
                }, null, 2),
            }
        },
    }
}

function installSkillTool(): Tool {
    return {
        name: 'install_skill',
        description: `Install a skill from the marketplace or a plugin from the registry.
Only use this AFTER searching with search_skills and confirming with the user that they want to install it.
For marketplace skills, provide the skill id. For registry plugins, provide the packageName.`,
        parameters: {
            type: 'object',
            properties: {
                skillId: {
                    type: 'string',
                    description: 'Marketplace skill ID to install (e.g. "web-scraper", "code-review")',
                },
                pluginPackageName: {
                    type: 'string',
                    description: 'Plugin npm package name to install (e.g. "geeksy-telegram-plugin")',
                },
            },
        },
        execute: async (params: any) => {
            const port = process.env.BUN_PORT || '3737'
            const base = `http://localhost:${port}`

            if (params.skillId) {
                try {
                    const res = await fetch(`${base}/api/skills/marketplace`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: params.skillId }),
                    })
                    const data = await res.json()
                    if (res.ok) {
                        return { success: true, output: `Skill "${params.skillId}" installed successfully. It is now available for use.` }
                    }
                    return { success: false, output: data.error || 'Failed to install skill', error: data.error }
                } catch (err: any) {
                    return { success: false, output: `Install failed: ${err.message}`, error: err.message }
                }
            }

            if (params.pluginPackageName) {
                try {
                    const name = params.pluginPackageName
                        .replace(/^geeksy-|-plugin$/g, '')
                        .replace(/-/g, ' ')
                        .replace(/\b\w/g, (c: string) => c.toUpperCase())

                    const res = await fetch(`${base}/api/plugins`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name,
                            packageName: params.pluginPackageName,
                            description: `Plugin: ${params.pluginPackageName}`,
                        }),
                    })
                    const data = await res.json()
                    if (res.ok) {
                        return { success: true, output: `Plugin "${params.pluginPackageName}" installed successfully.${data.registeredSkills?.length ? ` Registered skills: ${data.registeredSkills.join(', ')}` : ''}` }
                    }
                    return { success: false, output: data.error || 'Failed to install plugin', error: data.error }
                } catch (err: any) {
                    return { success: false, output: `Install failed: ${err.message}`, error: err.message }
                }
            }

            return { success: false, output: 'Provide either skillId or pluginPackageName', error: 'Missing parameter' }
        },
    }
}
