// app/lib/embeddings.ts
// Handles vector embeddings and semantic search for long-term memory

import { db } from './db'

export async function generateEmbedding(text: string): Promise<number[]> {
    // We'll use the OpenAI compatible embeddings endpoint for local models or OpenAI itself.
    // If not configured, we'll try an open fallback or return dummy numbers.
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
        console.warn('[geeksy] OPENAI_API_KEY missing - falling back to pseudo-embeddings')
        // In real environments without a key, you'd integrate a local transformer or return [0].
        // Fix to pseudo-deterministic predictable array
        return Array.from({ length: 1536 }, (_, i) => Math.sin(text.length + i) * 0.1)
    }

    try {
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
        const data = await res.json()
        if (data.data && data.data[0]) {
            return data.data[0].embedding
        }
        throw new Error('No embedding returned')
    } catch (e: any) {
        console.error('[geeksy] Failed to generate embedding:', e.message)
        throw e
    }
}

function cosineSimilarity(A: number[], B: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < A.length; i++) {
        dotProduct += A[i] * B[i];
        normA += A[i] * A[i];
        normB += B[i] * B[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface SemanticSearchResult {
    id: number
    text: string
    similarity: number
    metadata?: any
}

// In-memory naive vector search map (to avoid binary extensions dependency for portability)
// Geesky OS stores these locally in SQLite blobs
let memoryCache: { id: number, text: string, vector: number[], meta?: string }[] = []
let cacheLoaded = false

function initVectorCache() {
    if (cacheLoaded) return

    // Create vector storage table if it doesn't exist yet
    (db as any).db.exec(`CREATE TABLE IF NOT EXISTS semantic_memory (
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

export async function searchSemanticMemory(query: string, limit = 5, threshold = 0.3): Promise<SemanticSearchResult[]> {
    initVectorCache()
    if (memoryCache.length === 0) return []

    const queryVec = await generateEmbedding(query)

    // Exact in-memory cosine sweep
    // For personal knowledge bases up to 10k items, JS arrays run this in roughly < 5ms.
    const scored = memoryCache.map(mem => ({
        id: mem.id,
        text: mem.text,
        similarity: cosineSimilarity(queryVec, mem.vector),
        metadata: mem.meta ? JSON.parse(mem.meta) : undefined
    }))

    return scored
        .filter(s => s.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit)
}
