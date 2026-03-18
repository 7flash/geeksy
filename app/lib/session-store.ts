import { Session } from "smart-agent-ai";

export const sessions = new Map<string, Session>();
export const dbSessionBindings = new Map<number, string>();

export function getBoundSmartSessionId(dbSessionId?: number | null): string | undefined {
    if (typeof dbSessionId !== 'number') return undefined;
    return dbSessionBindings.get(dbSessionId);
}

export function bindDbSessionToSmartSession(dbSessionId: number | null | undefined, smartSessionId: string) {
    if (typeof dbSessionId !== 'number') return;
    dbSessionBindings.set(dbSessionId, smartSessionId);
}
