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
    schedules: z.object({
        name: z.string(),
        type: z.string().default('once'),         // sequential | interval | once
        status: z.string().default('pending'),     // pending | running | completed | failed | cancelled
        agentId: z.number().optional(),
        message: z.string().optional(),            // single prompt (for chat-based tasks)
        scriptPath: z.string().optional(),         // path to script file (for script-based tasks)
        tasks: z.string().optional(),              // JSON array of { id, name, message, status }
        intervalSec: z.number().optional(),
        nextRun: z.number().optional(),
        lastRun: z.number().optional(),
        lastError: z.string().optional(),
        lastOutput: z.string().optional(),         // last script stdout
        completedCount: z.number().default(0),
        totalCount: z.number().default(1),
        currentTask: z.string().optional(),
    }),
    agentState: z.object({
        agentId: z.number(),
        key: z.string(),
        value: z.string(),
    }),
    plugins: z.object({
        name: z.string(),                          // display name e.g. "Telegram"
        packageName: z.string(),                   // npm package e.g. "geeksy-telegram-plugin"
        status: z.string().default('installed'),   // installed | running | stopped | error
        port: z.number().optional(),               // port the plugin serves on
        config: z.string().default('{}'),          // JSON config blob
        error: z.string().optional(),              // last error message
        version: z.string().optional(),            // installed version
        description: z.string().optional(),        // short description
        icon: z.string().default('🧩'),            // emoji icon
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
        schedules: ['status', 'agentId'],
        agentState: ['agentId'],
        plugins: ['packageName'],
    },
    cascade: {
        agents: ['messages', 'objectives', 'files', 'agentState'],
    },
})
