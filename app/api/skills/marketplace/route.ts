// app/api/skills/marketplace/route.ts — Skill Marketplace API
// GET: list available community skills | POST: install a skill
import { join } from 'path'
import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { skillsDir } from '../../../lib/paths'

export interface MarketplaceSkill {
    id: string
    name: string
    description: string
    author: string
    version: string
    tags: string[]
    url: string   // Raw .md URL to download
    icon: string
}

/**
 * Community skill registry.
 * In production this would be fetched from a remote registry URL.
 * For now, a curated list of useful agent skills.
 */
const REGISTRY: MarketplaceSkill[] = [
    {
        id: 'web-scraper',
        name: 'Web Scraper',
        description: 'Extract structured data from web pages using CSS selectors and Bun fetch. Handles pagination, rate limiting, and JSON/CSV output.',
        author: 'geeksy-community',
        version: '1.0.0',
        tags: ['data', 'web', 'scraping'],
        url: '',
        icon: '🕸️',
    },
    {
        id: 'code-review',
        name: 'Code Review',
        description: 'Systematic code review checklist: security, performance, maintainability, error handling, and test coverage. Produces structured review reports.',
        author: 'geeksy-community',
        version: '1.0.0',
        tags: ['development', 'quality'],
        url: '',
        icon: '🔍',
    },
    {
        id: 'api-tester',
        name: 'API Tester',
        description: 'Automated REST API testing with request chaining, variable extraction, assertions, and report generation. Supports auth flows.',
        author: 'geeksy-community',
        version: '1.0.0',
        tags: ['testing', 'api', 'development'],
        url: '',
        icon: '🧪',
    },
    {
        id: 'data-pipeline',
        name: 'Data Pipeline',
        description: 'Build ETL pipelines: extract from CSV/JSON/API, transform with map/filter/aggregate, load to SQLite or JSON files. Observable via measure-fn.',
        author: 'geeksy-community',
        version: '1.0.0',
        tags: ['data', 'etl', 'pipeline'],
        url: '',
        icon: '🔄',
    },
    {
        id: 'cron-monitor',
        name: 'Cron Monitor',
        description: 'Monitor scheduled tasks and cron jobs. Alert on failures, track execution times, and generate health reports. Integrates with Geeksy scheduler.',
        author: 'geeksy-community',
        version: '1.0.0',
        tags: ['monitoring', 'scheduler', 'ops'],
        url: '',
        icon: '⏰',
    },
    {
        id: 'markdown-writer',
        name: 'Markdown Writer',
        description: 'Structured document creation: technical docs, blog posts, changelogs, and ADRs. Enforces consistent formatting, heading hierarchy, and linking.',
        author: 'geeksy-community',
        version: '1.0.0',
        tags: ['writing', 'documentation'],
        url: '',
        icon: '📝',
    },
    {
        id: 'git-analytics',
        name: 'Git Analytics',
        description: 'Analyze git history for insights: commit frequency, contributor stats, file churn, merge patterns. Generates visual reports.',
        author: 'geeksy-community',
        version: '1.0.0',
        tags: ['git', 'analytics', 'development'],
        url: '',
        icon: '📊',
    },
    {
        id: 'security-audit',
        name: 'Security Audit',
        description: 'Scan codebases for common vulnerabilities: hardcoded secrets, SQL injection, XSS, dependency CVEs. Produces prioritized findings.',
        author: 'geeksy-community',
        version: '1.0.0',
        tags: ['security', 'audit', 'development'],
        url: '',
        icon: '🛡️',
    },
]

/** GET /api/skills/marketplace — List available community skills */
export async function GET() {
    // Check which are already installed
    const enriched = REGISTRY.map(skill => ({
        ...skill,
        installed: existsSync(join(skillsDir, `${skill.id}.md`)),
    }))

    return Response.json({
        skills: enriched,
        count: enriched.length,
        installed: enriched.filter(s => s.installed).length,
    })
}

/** POST /api/skills/marketplace — Install a skill by ID */
export async function POST(req: Request) {
    const body = await req.json() as { id: string }
    if (!body.id) {
        return Response.json({ error: 'Missing skill id' }, { status: 400 })
    }

    const skill = REGISTRY.find(s => s.id === body.id)
    if (!skill) {
        return Response.json({ error: `Skill "${body.id}" not found in registry` }, { status: 404 })
    }

    const targetPath = join(skillsDir, `${skill.id}.md`)
    if (existsSync(targetPath)) {
        return Response.json({ error: 'Skill already installed', path: targetPath }, { status: 409 })
    }

    // Generate skill file content
    const content = generateSkillContent(skill)

    // Ensure skills directory exists
    if (!existsSync(skillsDir)) {
        mkdirSync(skillsDir, { recursive: true })
    }

    writeFileSync(targetPath, content, 'utf-8')

    return Response.json({ ok: true, skill: { ...skill, installed: true }, path: targetPath })
}

/** Generate a proper skill .md file from marketplace metadata */
function generateSkillContent(skill: MarketplaceSkill): string {
    return `---
name: ${skill.name}
description: ${skill.description}
version: ${skill.version}
author: ${skill.author}
tags: [${skill.tags.join(', ')}]
---

# ${skill.icon} ${skill.name}

${skill.description}

## Usage

This skill was installed from the Geeksy Skill Marketplace.
The agent can use this skill's guidelines when performing related tasks.

## Tags

${skill.tags.map(t => `- \`${t}\``).join('\n')}
`
}
