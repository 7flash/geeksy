// app/lib/db.ts — Server-side persistence with sqlite-zod-orm
import { Database, z } from 'sqlite-zod-orm'
import { join } from 'path'

const dbPath = join(process.cwd(), 'data', 'agents.db')

export const db = new Database(dbPath, {
    agents: z.object({
        name: z.string().default('New Agent'),
        model: z.string().default('gemini-2.5-flash'),
        sessionId: z.string().optional(),
    }),
    messages: z.object({
        agentId: z.number(),
        role: z.enum(['user', 'assistant', 'system', 'tool']),
        content: z.string(),
    }),
    objectives: z.object({
        agentId: z.number(),
        name: z.string(),
        description: z.string(),
        type: z.string(),
        status: z.string().default('pending'), // pending | complete | failed
        result: z.string().optional(),
    }),
    files: z.object({
        agentId: z.number(),
        path: z.string(),
        action: z.string().default('read'), // read | write
    }),
}, {
    timestamps: true,
    relations: {
        messages: { agentId: 'agents' },
        objectives: { agentId: 'agents' },
        files: { agentId: 'agents' },
    },
    indexes: {
        messages: ['agentId'],
        objectives: ['agentId'],
        files: ['agentId'],
    },
    cascade: {
        agents: ['messages', 'objectives', 'files'],
    },
})
