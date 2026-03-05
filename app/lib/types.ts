// app/src/lib/types.ts — Shared client types

export interface AgentEvent {
    type: string
    iteration?: number
    elapsed?: number
    message?: string
    tool?: string
    params?: Record<string, any>
    result?: { success: boolean; output: string; error?: string }
    results?: Array<{ name: string; met: boolean; reason: string }>
    objectives?: Array<{ name: string; description: string; type: string; params: Record<string, string> }>
    error?: string
}

export interface AgentEntry {
    id: number
    name: string
    sessionId: string | null
    status: 'idle' | 'running'
    model?: string
}

export interface ScheduleEntry {
    id: string
    name: string
    type: 'sequential' | 'interval' | 'once'
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
    agentId?: number
    message?: string
    scriptPath?: string
    intervalSec?: number
    nextRun?: number
    lastRun?: number
    lastError?: string
    lastOutput?: string
    progress?: {
        completed: number
        total: number
        currentTask?: string
    }
    tasks?: ScheduleTask[]
}

export interface ScheduleTask {
    id: string
    name: string
    message: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    result?: string
}

export interface ObjectiveEntry {
    name: string
    description: string
    type: string
    met?: boolean
    reason?: string
}

export interface ObjectiveGroup {
    id: number
    timestamp: number
    label: string  // e.g. "Initial plan" or "Replanning"
    objectives: ObjectiveEntry[]
}

export interface FileEntry {
    path: string
    action: 'read' | 'write'
}

export interface StateEntry {
    id: number
    agentId: number
    key: string
    value: string
}

export interface SkillInfo {
    id: string
    name: string
    description: string
    content: string  // Full markdown body of the skill file
    filePath: string
}

export interface ToolCardEntry {
    el: HTMLElement
    name: string
    params: Record<string, any>
    result?: { success: boolean; output: string; error?: string }
}

export interface WorkspaceState {
    agents: AgentEntry[]
    activeAgentId: number | null
    objectives: ObjectiveEntry[]
    objectiveGroups: ObjectiveGroup[]
    files: FileEntry[]
    schedules: ScheduleEntry[]
    stateEntries: StateEntry[]
    isRunning: boolean
    activeSkills: Set<string>
    availableSkills: SkillInfo[]
    activeTab: 'objectives' | 'files' | 'schedule' | 'processes' | 'memory' | 'skills'
}
