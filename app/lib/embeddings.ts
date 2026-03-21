// app/lib/embeddings.ts
// Handles vector embeddings and semantic search for long-term memory
// Supports Gemini (free), OpenAI, and pseudo-embedding fallback

import { db } from './db'

const GEMINI_EMBEDDING_DIM = 768
const OPENAI_EMBEDDING_DIM = 1536

/** Get embedding dimension based on available provider */
function getEmbeddingDim(): number {
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return GEMINI_EMBEDDING_DIM
    if (process.env.OPENAI_API_KEY) return OPENAI_EMBEDDING_DIM
    return GEMINI_EMBEDDING_DIM // pseudo-embeddings match Gemini dim
}

async function generateEmbeddingGemini(text: string): Promise<number[]> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    if (!apiKey) throw new Error('No Gemini API key')

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'models/text-embedding-004',
                content: { parts: [{ text }] },
            }),
        }
    )

    if (!res.ok) {
        const err = await res.text().catch(() => res.statusText)
        throw new Error(`Gemini embedding failed (${res.status}): ${err}`)
    }

    const data = await res.json()
    const values = data?.embedding?.values
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Gemini returned empty embedding')
    }
    return values
}

async function generateEmbeddingOpenAI(text: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) throw new Error('No OpenAI API key')

    const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: text
        })
    })

    if (!res.ok) {
        const err = await res.text().catch(() => res.statusText)
        throw new Error(`OpenAI embedding failed (${res.status}): ${err}`)
    }

    const data = await res.json()
    if (data.data?.[0]?.embedding) {
        return data.data[0].embedding
    }
    throw new Error('OpenAI returned empty embedding')
}

function generatePseudoEmbedding(text: string): number[] {
    // Deterministic pseudo-embedding for development without API keys
    const dim = GEMINI_EMBEDDING_DIM
    const result = new Array(dim)
    // Use a simple hash-based approach for some semantic spread
    let hash = 0
    for (let i = 0; i < text.length; i++) {
        hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
    }
    for (let i = 0; i < dim; i++) {
        // Mix character codes and position for variety
        const charCode = text.charCodeAt(i % text.length) || 0
        result[i] = Math.sin(hash + i * 0.1 + charCode * 0.01) * 0.1
    }
    return result
}

/** Active provider name for logging */
let loggedProvider = false

export async function generateEmbedding(text: string): Promise<number[]> {
    // Priority: Gemini (free) > OpenAI > pseudo-embeddings
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
        if (!loggedProvider) { console.log('[geeksy] Using Gemini text-embedding-004 for semantic memory'); loggedProvider = true }
        return generateEmbeddingGemini(text)
    }

    if (process.env.OPENAI_API_KEY) {
        if (!loggedProvider) { console.log('[geeksy] Using OpenAI text-embedding-3-small for semantic memory'); loggedProvider = true }
        return generateEmbeddingOpenAI(text)
    }

    if (!loggedProvider) { console.warn('[geeksy] No embedding API key — using pseudo-embeddings (semantic search will be low quality)'); loggedProvider = true }
    return generatePseudoEmbedding(text)
}

function cosineSimilarity(A: number[], B: number[]): number {
    // Handle dimension mismatch (e.g. switching providers) by using shorter length
    const len = Math.min(A.length, B.length)
    let dotProduct = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < len; i++) {
        dotProduct += A[i] * B[i]
        normA += A[i] * A[i]
        normB += B[i] * B[i]
    }
    if (normA === 0 || normB === 0) return 0
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

export interface SemanticSearchResult {
    id: number
    text: string
    similarity: number
    metadata?: any
}

export interface SemanticMemoryFilter {
    agentId?: number
    sessionId?: number
}

// In-memory naive vector search (to avoid binary extension dependencies for portability)
let memoryCache: { id: number, text: string, vector: number[], meta?: string }[] = []
let cacheLoaded = false

function initVectorCache() {
    if (cacheLoaded) return

    // Create vector storage table if it doesn't exist yet
    ;(db as any).db.exec(`CREATE TABLE IF NOT EXISTS semantic_memory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        vector JSON NOT NULL,
        meta TEXT
    )`)

    const rows = (db as any).db.query(`SELECT * FROM semantic_memory`).all() as any[]
    memoryCache = rows.map(r => ({
        id: r.id,
        text: r.text,
        vector: JSON.parse(r.vector),
        meta: r.meta
    }))
    cacheLoaded = true
}

export async function addSemanticMemory(text: string, meta?: any) {
    initVectorCache()
    const vector = await generateEmbedding(text)

    const stmt = (db as any).db.query(`INSERT INTO semantic_memory (text, vector, meta) VALUES ($text, $vector, $meta) RETURNING id`)
    const res = stmt.get({
        $text: text,
        $vector: JSON.stringify(vector),
        $meta: meta ? JSON.stringify(meta) : null
    }) as { id: number }

    memoryCache.push({ id: res.id, text, vector, meta: meta ? JSON.stringify(meta) : undefined })
}

export async function searchSemanticMemory(
    query: string,
    limit = 5,
    threshold = 0.3,
    filter?: SemanticMemoryFilter,
): Promise<SemanticSearchResult[]> {
    initVectorCache()
    if (memoryCache.length === 0) return []

    const queryVec = await generateEmbedding(query)

    const scored = memoryCache.map(mem => {
        const metadata = mem.meta ? JSON.parse(mem.meta) : undefined
        return {
            id: mem.id,
            text: mem.text,
            similarity: cosineSimilarity(queryVec, mem.vector),
            metadata,
        }
    })

    return scored
        .filter(s => {
            if (s.similarity < threshold) return false
            if (filter?.sessionId != null && s.metadata?.sessionId !== filter.sessionId) return false
            if (filter?.agentId != null && s.metadata?.agentId !== filter.agentId) return false
            return true
        })
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
}
