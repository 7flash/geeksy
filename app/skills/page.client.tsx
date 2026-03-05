// app/src/skills/page.client.tsx — Dynamic skill discovery and display
import { render } from 'melina/client'

interface SkillData {
    id: string
    name: string
    description: string
    content: string  // Full markdown body
    filePath: string
}

let skills: SkillData[] = []
let expandedSkill: string | null = null

const SKILL_ICONS: Record<string, string> = {
    bun: '⚡',
    docker: '🐳',
    git: '📦',
    npm: '📋',
    telegram: '📱',
    trading: '📈',
    project: '🏗️',
}

function SkillCard({ skill }: { skill: SkillData }) {
    const isExpanded = expandedSkill === skill.id
    const icon = SKILL_ICONS[skill.id] || '🔧'
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
    render(
        <div className="skills-list">
            {skills.length === 0 ? (
                <div className="overview-empty">
                    No skill files found in <code>skills/</code> directory.<br />
                    Create a <code>.md</code> file with YAML frontmatter to define new skills.
                </div>
            ) : (
                skills.map(s => <SkillCard skill={s} />)
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
