/**
 * WebSocket Signaling Server for P2P Communication
 * 
 * GET /api/p2p → Upgrade to WebSocket for signaling
 * 
 * Handles:
 * - Peer registration (peer-join)
 * - Peer discovery (peer-list broadcast)
 * - SDP offer/answer relay
 * - ICE candidate relay
 * - Peer departure (peer-leave)
 * 
 * No agent data passes through — only WebRTC signaling metadata.
 */

import type { MeasureFn } from 'measure-fn'

interface ConnectedPeer {
    id: string
    login: string
    avatar: string
    instanceId: string
    ws: any  // Bun WebSocket
    connectedAt: number
}

// Active peers indexed by GitHub user ID
const activePeers = new Map<string, ConnectedPeer>()

/** Broadcast a message to all connected peers except sender */
function broadcast(msg: any, excludeId?: string) {
    const data = JSON.stringify(msg)
    for (const [id, peer] of activePeers) {
        if (id !== excludeId) {
            try { peer.ws.send(data) } catch { /* stale connection */ }
        }
    }
}

/** Send to a specific peer */
function sendTo(peerId: string, msg: any) {
    const peer = activePeers.get(peerId)
    if (peer) {
        try { peer.ws.send(JSON.stringify(msg)) } catch { /* stale */ }
    }
}

/** Handle WebSocket upgrade for signaling */
export function GET(req: Request, m: MeasureFn) {
    const server = (globalThis as any).__bun_server

    if (!server) {
        return Response.json({ error: 'WebSocket upgrade requires Bun server context' }, { status: 500 })
    }

    const upgraded = server.upgrade(req, {
        data: { type: 'p2p-signaling' },
    })

    if (!upgraded) {
        return Response.json({ error: 'WebSocket upgrade failed' }, { status: 400 })
    }

    // Bun handles the upgrade — no response needed
    return undefined as any
}

/** WebSocket handler — register with Bun server's websocket config */
export const websocket = {
    open(ws: any) {
        // Connection opened — wait for peer-join message
    },

    message(ws: any, data: string) {
        try {
            const msg = JSON.parse(data)

            switch (msg.type) {
                case 'peer-join': {
                    const peer: ConnectedPeer = {
                        id: msg.from,
                        login: msg.payload.login,
                        avatar: msg.payload.avatar,
                        instanceId: msg.payload.instanceId,
                        ws,
                        connectedAt: Date.now(),
                    }
                    activePeers.set(peer.id, peer)

                    // Send current peer list to new peer
                    const peerList = Array.from(activePeers.values())
                        .filter(p => p.id !== peer.id)
                        .map(p => ({
                            id: p.id,
                            login: p.login,
                            avatar: p.avatar,
                            instanceId: p.instanceId,
                            connectedAt: p.connectedAt,
                        }))

                    ws.send(JSON.stringify({
                        type: 'peer-list',
                        from: 'server',
                        payload: peerList,
                    }))

                    // Broadcast new peer to others
                    broadcast({
                        type: 'peer-join',
                        from: peer.id,
                        payload: {
                            login: peer.login,
                            avatar: peer.avatar,
                            instanceId: peer.instanceId,
                        },
                    }, peer.id)

                    console.log(`[P2P] Peer joined: @${peer.login} (${peer.id}). Total: ${activePeers.size}`)
                    break
                }

                case 'offer':
                case 'answer':
                case 'ice-candidate': {
                    // Relay to target peer
                    if (msg.to) {
                        sendTo(msg.to, msg)
                    }
                    break
                }

                case 'peer-leave': {
                    activePeers.delete(msg.from)
                    broadcast({
                        type: 'peer-leave',
                        from: msg.from,
                        payload: {},
                    })
                    console.log(`[P2P] Peer left: ${msg.from}. Total: ${activePeers.size}`)
                    break
                }
            }
        } catch (e) {
            console.error('[P2P] Message parse error:', e)
        }
    },

    close(ws: any) {
        // Find and remove this peer
        for (const [id, peer] of activePeers) {
            if (peer.ws === ws) {
                activePeers.delete(id)
                broadcast({
                    type: 'peer-leave',
                    from: id,
                    payload: {},
                })
                console.log(`[P2P] Peer disconnected: @${peer.login}. Total: ${activePeers.size}`)
                break
            }
        }
    },
}

/** Get current peer count (for health checks) */
export function getPeerCount(): number {
    return activePeers.size
}
