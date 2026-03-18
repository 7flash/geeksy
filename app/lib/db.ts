// app/lib/db.ts — Server-side persistence with sqlite-zod-orm
import { Database, z } from 'sqlite-zod-orm'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'

const dbPath = process.env.GEEKSY_DB_PATH || join(process.env.GEEKSY_HOME || process.cwd(), 'data', 'agents.db')
mkdirSync(dirname(dbPath), { recursive: true })

export const db = new Database(dbPath, {
    agents: z.object({
        name: z.string().default('New Agent'),
        model: z.string().default('gemini-2.5-flash'),
        systemPrompt: z.string().optional(),
        sessionId: z.string().optional(),
    }),
    sessions: z.object({
        name: z.string().default('New Session'),
        type: z.string().default('web'),              // 'web' | 'telegram_bot'
        status: z.string().default('active'),         // 'active' | 'paused' | 'archived'
        model: z.string().default('gemini-2.5-flash'),
        systemPrompt: z.string().optional(),
        config: z.string().default('{}'),             // JSON: { botToken, chatId, ... }
        memory: z.string().default('{}'),             // JSON key-value memory store
        messageCount: z.number().default(0),
        lastActiveAt: z.number().optional(),
    }),
    messages: z.object({
        agentId: z.number(),
        sessionId: z.number().optional(),
        role: z.enum(['user', 'assistant', 'system', 'tool']),
        content: z.string(),
    }),
    objectives: z.object({
        agentId: z.number(),
        sessionId: z.number().optional(),
        name: z.string(),
        description: z.string(),
        type: z.string(),
        status: z.string().default('pending'), // pending | complete | failed
        result: z.string().optional(),
    }),
    files: z.object({
        agentId: z.number(),
        sessionId: z.number().optional(),
        path: z.string(),
        action: z.string().default('read'), // read | write
    }),
    schedules: z.object({
        name: z.string(),
        type: z.string().default('once'),         // sequential | interval | once | cron
        status: z.string().default('pending'),     // pending | running | completed | failed | cancelled
        agentId: z.number().optional(),
        sessionId: z.number().optional(),
        message: z.string().optional(),            // single prompt (for chat-based tasks)
        scriptPath: z.string().optional(),         // path to script file (for script-based tasks)
        tasks: z.string().optional(),              // JSON array of { id, name, message, status }
        intervalSec: z.number().optional(),
        cron: z.string().optional(),               // cron expression e.g. "0 9 * * *"
        timeoutSec: z.number().default(60),        // max wall time for script/chat execution
        expectedOutput: z.string().optional(),     // mark run failed if output does not contain this text
        failOnStderr: z.boolean().default(false),  // mark script run failed when stderr is non-empty
        nextRun: z.number().optional(),
        lastRun: z.number().optional(),
        lastError: z.string().optional(),
        lastOutput: z.string().optional(),         // last script stdout / normalized output
        completedCount: z.number().default(0),
        totalCount: z.number().default(1),
        currentTask: z.string().optional(),
        maxRetries: z.number().default(0),         // 0 = no retry, N = retry N times before failing
        retryCount: z.number().default(0),         // current retry attempt
        retryDelayMs: z.number().default(2000),    // base delay for exponential backoff (2^attempt * base)
        lastDurationMs: z.number().optional(),     // execution time of last run in ms
        successCount: z.number().default(0),       // lifetime successful executions
        failCount: z.number().default(0),          // lifetime failed executions
        lastReportedStatus: z.string().optional(), // last status surfaced into chat
        lastReportedAt: z.number().optional(),     // when the last chat report was emitted
    }),
    agentState: z.object({
        agentId: z.number(),
        key: z.string(),
        value: z.string(),
    }),
    followUps: z.object({
        agentId: z.number(),
        reason: z.string(),
        context: z.string(),
        scheduledAt: z.number(),
        status: z.string().default('pending'), // 'pending' | 'processed'
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
        followUps: { agentId: 'agents' },
    },
    indexes: {
        messages: ['agentId', 'sessionId'],
        objectives: ['agentId', 'sessionId'],
        files: ['agentId', 'sessionId'],
        followUps: ['agentId', 'status'],
        schedules: ['status', 'agentId', 'sessionId'],
        agentState: ['agentId'],
        plugins: ['packageName'],
        sessions: ['type', 'status'],
    },
    cascade: {
        agents: ['messages', 'objectives', 'files', 'followUps', 'agentState'],
    },
})

