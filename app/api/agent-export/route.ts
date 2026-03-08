// app/api/agent-export/route.ts — Agent state export/import (no auth)
import { db } from '../../lib/db'

/** GET /api/agent-export?id=1 — Download full agent state as JSON */
export async function GET(req: Request) {
    const url = new URL(req.url)
    const id = parseInt(url.searchParams.get('id') || '0')
    if (!id) return Response.json({ error: 'Missing agent id' }, { status: 400 })

    const agent = db.agents.select().where({ id }).first()
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

    const messages = db.messages.select().where({ agentId: id }).all()
    const objectives = db.objectives.select().where({ agentId: id }).all()
    const files = db.files.select().where({ agentId: id }).all()
    const state = db.agentState.select().where({ agentId: id }).all()
    const schedules = db.schedules.select().where({ agentId: id }).all()

    const exported = {
        version: 1,
        exportedAt: new Date().toISOString(),
        agent,
        messages,
        objectives,
        files,
        agentState: state,
        schedules,
        counts: {
            messages: messages.length,
            objectives: objectives.length,
            files: files.length,
            schedules: schedules.length,
        }
    }

    return new Response(JSON.stringify(exported, null, 2), {
        headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': `attachment; filename="agent-${agent.name.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json"`,
        }
    })
}

/** POST /api/agent-export — Import agent state from JSON */
export async function POST(req: Request) {
    const data = await req.json()

    if (!data.agent || !data.version) {
        return Response.json({ error: 'Invalid agent export format' }, { status: 400 })
    }

    // Create the agent (without the original id)
    const { id: _oldId, createdAt: _ca, updatedAt: _ua, ...agentData } = data.agent
    agentData.name = `${agentData.name} (imported)`
    const newAgent = db.agents.insert(agentData)
    const newId = newAgent.id

    // Import messages
    let msgCount = 0
    if (data.messages?.length) {
        for (const msg of data.messages) {
            const { id: _, createdAt: _c, updatedAt: _u, ...msgData } = msg
            db.messages.insert({ ...msgData, agentId: newId })
            msgCount++
        }
    }

    // Import objectives
    let objCount = 0
    if (data.objectives?.length) {
        for (const obj of data.objectives) {
            const { id: _, createdAt: _c, updatedAt: _u, ...objData } = obj
            db.objectives.insert({ ...objData, agentId: newId })
            objCount++
        }
    }

    // Import files
    let fileCount = 0
    if (data.files?.length) {
        for (const file of data.files) {
            const { id: _, createdAt: _c, updatedAt: _u, ...fileData } = file
            db.files.insert({ ...fileData, agentId: newId })
            fileCount++
        }
    }

    // Import agent state
    if (data.agentState?.length) {
        for (const s of data.agentState) {
            const { id: _, createdAt: _c, updatedAt: _u, ...sData } = s
            db.agentState.insert({ ...sData, agentId: newId })
        }
    }

    return Response.json({
        success: true,
        agentId: newId,
        imported: { messages: msgCount, objectives: objCount, files: fileCount }
    })
}
