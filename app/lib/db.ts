// app/lib/db.ts — Server-side persistence with sqlite-zod-orm
import { Database, z } from 'sqlite-zod-orm'
import { join } from 'path'

const dbPath = join(process.cwd(), 'data', 'agents.db')

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
        type: z.string().default('once'),         // sequential | interval | once | cron
        status: z.string().default('pending'),     // pending | running | completed | failed | cancelled
        agentId: z.number().optional(),
        message: z.string().optional(),            // single prompt (for chat-based tasks)
        scriptPath: z.string().optional(),         // path to script file (for script-based tasks)
        tasks: z.string().optional(),              // JSON array of { id, name, message, status }
        intervalSec: z.number().optional(),
        cron: z.string().optional(),               // cron expression e.g. "0 9 * * *"
        nextRun: z.number().optional(),
        lastRun: z.number().optional(),
        lastError: z.string().optional(),
        lastOutput: z.string().optional(),         // last script stdout
        completedCount: z.number().default(0),
        totalCount: z.number().default(1),
        currentTask: z.string().optional(),
        maxRetries: z.number().default(0),         // 0 = no retry, N = retry N times before failing
        retryCount: z.number().default(0),         // current retry attempt
        retryDelayMs: z.number().default(2000),    // base delay for exponential backoff (2^attempt * base)
        lastDurationMs: z.number().optional(),     // execution time of last run in ms
        successCount: z.number().default(0),       // lifetime successful executions
        failCount: z.number().default(0),          // lifetime failed executions
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
    prompts: z.object({
        eventId: z.string().default(''),             // jsx-ai hook event ID
        method: z.string().default('callLLM'),       // callLLM | callText | streamLLM
        model: z.string().default(''),
        provider: z.string().default(''),             // gemini | openai | anthropic
        strategy: z.string().optional(),              // native | xml | natural | nlt | hybrid
        messages: z.string().default('[]'),           // JSON: raw messages array sent to LLM
        system: z.string().optional(),                // system prompt text
        tools: z.string().optional(),                 // JSON: tool names array
        responseText: z.string().optional(),          // LLM response text
        toolCalls: z.string().optional(),             // JSON: tool calls from response
        tokensIn: z.number().optional(),
        tokensOut: z.number().optional(),
        tokensThinking: z.number().optional(),
        durationMs: z.number().optional(),
        error: z.string().optional(),
        source: z.string().default('unknown'),        // which app sent this (geeksy, smart-agent, etc)
    })
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
        objectives: ['agentId'],
        files: ['agentId'],
        followUps: ['agentId', 'status'],
        schedules: ['status', 'agentId'],
        agentState: ['agentId'],
        plugins: ['packageName'],
        sessions: ['type', 'status'],
        prompts: ['eventId', 'model'],
    },
    cascade: {
        agents: ['messages', 'objectives', 'files', 'followUps', 'agentState'],
    },
})

