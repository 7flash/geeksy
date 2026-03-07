// app/src/skills/page.client.tsx — Dynamic skill discovery and display
import { render } from 'melina/client'

interface SkillData {
    id: string
    name: string
    description: string
    content: string  // Full markdown body
    filePath: string
    plugin?: { name: string; icon: string; packageName: string }
}

let skills: SkillData[] = []
let expandedSkill: string | null = null
let searchQuery = ''

const SKILL_ICONS: Record<string, string> = {
    bun: '⚡',
    docker: '🐳',
    git: '📦',
    npm: '📋',
    telegram: '📱',
    trading: '📈',
    project: '🏗️',
    measure: '📊',
    melina: '🦊',
    bgrun: '🔄',
    sqlite: '🗄️',
}

function SkillCard({ skill }: { skill: SkillData }) {
    const isExpanded = expandedSkill === skill.id
    const icon = skill.plugin?.icon || SKILL_ICONS[skill.id] || '🔧'
    const lineCount = skill.content ? skill.content.split('\n').length : 0

    return (
        <div className={`skill-card ${isExpanded ? 'expanded' : ''}`}>
            <div className="skill-header" onClick={() => { expandedSkill = isExpanded ? null : skill.id; rerender() }}>
                <div className="skill-identity">
                    <span className="skill-icon">{icon}</span>
                    <div>
                        <h2 className="skill-name">{skill.name}</h2>
                        <span className="skill-desc">{skill.description}</span>
                    </div>
                </div>
                <div className="skill-meta">
                    {skill.plugin && <span className="skill-plugin-badge">{skill.plugin.name}</span>}
                    <span className="skill-cmds-count">{lineCount} lines</span>
                    <span className="skill-file-badge">{skill.id}.md</span>
                    <span className={`skill-expand-arrow ${isExpanded ? 'open' : ''}`}>▶</span>
                </div>
            </div>

            {isExpanded && (
                <div className="skill-commands">
                    <div className="commands-divider" />
                    <pre className="skill-content-block">{skill.content}</pre>
                </div>
            )}
        </div>
    )
}

function getFilteredSkills(): SkillData[] {
    if (!searchQuery.trim()) return skills
    const q = searchQuery.toLowerCase()
    return skills.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.plugin?.name || '').toLowerCase().includes(q)
    )
}

async function loadSkills() {
    try {
        skills = await fetch('/api/skills').then(r => r.json())
    } catch {
        skills = []
    }
    rerender()
}

function rerender() {
    const container = document.getElementById('skills-content')
    if (!container) return

    const filtered = getFilteredSkills()
    const pluginSkills = filtered.filter(s => s.plugin)
    const standaloneSkills = filtered.filter(s => !s.plugin)

    // Group plugin skills by plugin name
    const pluginGroups = new Map<string, SkillData[]>()
    for (const s of pluginSkills) {
        const key = s.plugin!.packageName
        if (!pluginGroups.has(key)) pluginGroups.set(key, [])
        pluginGroups.get(key)!.push(s)
    }

    render(
        <div className="skills-list">
            <div className="skills-search-bar">
                <input
                    type="text"
                    className="skills-search-input"
                    placeholder="🔍 Search skills by name, description, or plugin..."
                    value={searchQuery}
                    onInput={(e: any) => {
                        searchQuery = (e.target as HTMLInputElement).value
                        rerender()
                    }}
                />
                {searchQuery && (
                    <button className="skills-search-clear" onClick={() => { searchQuery = ''; rerender() }}>✕</button>
                )}
                <span className="skills-count">{filtered.length}/{skills.length}</span>
            </div>

            {filtered.length === 0 && skills.length > 0 ? (
                <div className="overview-empty">
                    No skills matching "<strong>{searchQuery}</strong>". Try a different search term.
                </div>
            ) : filtered.length === 0 ? (
                <div className="overview-empty">
                    No skill files found in <code>skills/</code> directory.<br />
                    Create a <code>.md</code> file with YAML frontmatter to define new skills.
                </div>
            ) : (
                <>
                    {pluginGroups.size > 0 && Array.from(pluginGroups.entries()).map(([pkg, groupSkills]) => (
                        <div className="skills-group" key={pkg}>
                            <div className="skills-group-header">
                                <span className="skills-group-icon">{groupSkills[0].plugin!.icon}</span>
                                <span className="skills-group-name">{groupSkills[0].plugin!.name}</span>
                                <span className="skills-group-count">{groupSkills.length}</span>
                            </div>
                            {groupSkills.map(s => <SkillCard skill={s} />)}
                        </div>
                    ))}
                    {standaloneSkills.length > 0 && (
                        <div className="skills-group">
                            {pluginGroups.size > 0 && (
                                <div className="skills-group-header">
                                    <span className="skills-group-icon">🔧</span>
                                    <span className="skills-group-name">Local Skills</span>
                                    <span className="skills-group-count">{standaloneSkills.length}</span>
                                </div>
                            )}
                            {standaloneSkills.map(s => <SkillCard skill={s} />)}
                        </div>
                    )}
                </>
            )}
            <div className="skills-footer">
                <div className="skills-hint">
                    <span className="hint-icon">💡</span>
                    <span>
                        Skills are Markdown files placed in <code>skills/</code>. Each skill teaches agents how to use tools, APIs, or CLI commands.
                        Toggle skills per-agent using the chips in the chat header.
                    </span>
                </div>
            </div>
        </div>,
        container
    )
}

export default function mount() {
    loadSkills()
    return () => { }
}
