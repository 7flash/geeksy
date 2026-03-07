/**
 * WebRTC P2P Communication for Geeksy
 * 
 * Enables cross-instance agent communication via WebRTC data channels.
 * Uses a lightweight WebSocket signaling server for SDP/ICE exchange.
 * Peer identity = GitHub user ID (from Cloud Auth).
 * 
 * Architecture:
 *   Peer A ──WebSocket──▶ Signaling Server ◀──WebSocket── Peer B
 *   Peer A ◀──WebRTC Data Channel (P2P, encrypted)──▶ Peer B
 */

// ── Types ──

export interface PeerInfo {
    id: string          // GitHub user ID
    login: string       // GitHub username
    avatar: string      // GitHub avatar URL
    instanceId: string  // Unique UUID per Geeksy instance
    connectedAt: number
}

export interface P2PMessage {
    type: 'offer' | 'answer' | 'ice-candidate' | 'rpc-request' | 'rpc-response' | 'peer-list' | 'peer-join' | 'peer-leave'
    from: string
    to?: string
    payload: any
}

export interface RpcRequest {
    id: string
    method: string
    params: Record<string, any>
}

export interface RpcResponse {
    id: string
    result?: any
    error?: string
}

// ── P2P Manager ──

export class P2PManager {
    private ws: WebSocket | null = null
    private connections = new Map<string, RTCPeerConnection>()
    private channels = new Map<string, RTCDataChannel>()
    private peers = new Map<string, PeerInfo>()
    private pendingRpc = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>()
    private instanceId = crypto.randomUUID()
    private handlers = new Map<string, (params: any) => Promise<any>>()

    public onPeerJoin?: (peer: PeerInfo) => void
    public onPeerLeave?: (peerId: string) => void
    public onConnected?: (peerId: string) => void
    public onDisconnected?: (peerId: string) => void
    public onMessage?: (from: string, method: string, params: any) => void

    constructor(
        private signalingUrl: string,
        private localPeer: PeerInfo,
    ) { }

    /** Register an RPC handler for incoming requests */
    registerHandler(method: string, handler: (params: any) => Promise<any>) {
        this.handlers.set(method, handler)
    }

    /** Connect to signaling server */
    connect() {
        if (this.ws?.readyState === WebSocket.OPEN) return

        this.ws = new WebSocket(this.signalingUrl)

        this.ws.onopen = () => {
            // Announce ourselves
            this.send({
                type: 'peer-join',
                from: this.localPeer.id,
                payload: {
                    login: this.localPeer.login,
                    avatar: this.localPeer.avatar,
                    instanceId: this.instanceId,
                },
            })
        }

        this.ws.onmessage = (event) => {
            const msg: P2PMessage = JSON.parse(event.data)
            this.handleSignaling(msg)
        }

        this.ws.onclose = () => {
            // Auto-reconnect after 3s
            setTimeout(() => this.connect(), 3000)
        }

        this.ws.onerror = () => {
            this.ws?.close()
        }
    }

    /** Disconnect from signaling and close all peer connections */
    disconnect() {
        this.send({
            type: 'peer-leave',
            from: this.localPeer.id,
            payload: {},
        })

        for (const [id, conn] of this.connections) {
            conn.close()
            this.connections.delete(id)
            this.channels.delete(id)
        }

        this.ws?.close()
        this.ws = null
        this.peers.clear()
    }

    /** Initiate a WebRTC connection to a peer */
    async connectToPeer(peerId: string) {
        if (this.connections.has(peerId)) return

        const pc = this.createPeerConnection(peerId)

        // Create data channel (offerer creates it)
        const channel = pc.createDataChannel('geeksy-rpc', { ordered: true })
        this.setupDataChannel(peerId, channel)

        // Create and send offer
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        this.send({
            type: 'offer',
            from: this.localPeer.id,
            to: peerId,
            payload: { sdp: offer.sdp, type: offer.type },
        })
    }

    /** Send an RPC request to a peer and wait for response */
    async rpc(peerId: string, method: string, params: Record<string, any> = {}, timeoutMs = 30000): Promise<any> {
        const channel = this.channels.get(peerId)
        if (!channel || channel.readyState !== 'open') {
            throw new Error(`No open channel to peer ${peerId}`)
        }

        const id = crypto.randomUUID()

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRpc.delete(id)
                reject(new Error(`RPC timeout: ${method}`))
            }, timeoutMs)

            this.pendingRpc.set(id, { resolve, reject, timeout })

            channel.send(JSON.stringify({
                type: 'rpc-request',
                from: this.localPeer.id,
                payload: { id, method, params } satisfies RpcRequest,
            }))
        })
    }

    /** Get list of known peers */
    getPeers(): PeerInfo[] {
        return Array.from(this.peers.values())
    }

    /** Check if connected to a peer via data channel */
    isConnectedTo(peerId: string): boolean {
        const ch = this.channels.get(peerId)
        return ch?.readyState === 'open'
    }

    // ── Private ──

    private send(msg: P2PMessage) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg))
        }
    }

    private createPeerConnection(peerId: string): RTCPeerConnection {
        const pc = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ],
        })

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.send({
                    type: 'ice-candidate',
                    from: this.localPeer.id,
                    to: peerId,
                    payload: event.candidate.toJSON(),
                })
            }
        }

        pc.ondatachannel = (event) => {
            this.setupDataChannel(peerId, event.channel)
        }

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'connected') {
                this.onConnected?.(peerId)
            } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                this.cleanupPeer(peerId)
                this.onDisconnected?.(peerId)
            }
        }

        this.connections.set(peerId, pc)
        return pc
    }

    private setupDataChannel(peerId: string, channel: RTCDataChannel) {
        channel.onopen = () => {
            this.channels.set(peerId, channel)
            this.onConnected?.(peerId)
        }

        channel.onmessage = (event) => {
            this.handleDataMessage(peerId, JSON.parse(event.data))
        }

        channel.onclose = () => {
            this.channels.delete(peerId)
            this.onDisconnected?.(peerId)
        }
    }

    private async handleSignaling(msg: P2PMessage) {
        switch (msg.type) {
            case 'peer-list': {
                const peers: PeerInfo[] = msg.payload
                for (const p of peers) {
                    if (p.id !== this.localPeer.id) {
                        this.peers.set(p.id, p)
                    }
                }
                break
            }

            case 'peer-join': {
                const peer: PeerInfo = {
                    id: msg.from,
                    login: msg.payload.login,
                    avatar: msg.payload.avatar,
                    instanceId: msg.payload.instanceId,
                    connectedAt: Date.now(),
                }
                this.peers.set(peer.id, peer)
                this.onPeerJoin?.(peer)
                break
            }

            case 'peer-leave': {
                this.peers.delete(msg.from)
                this.cleanupPeer(msg.from)
                this.onPeerLeave?.(msg.from)
                break
            }

            case 'offer': {
                if (msg.to !== this.localPeer.id) return
                const pc = this.createPeerConnection(msg.from)
                await pc.setRemoteDescription(new RTCSessionDescription(msg.payload))
                const answer = await pc.createAnswer()
                await pc.setLocalDescription(answer)
                this.send({
                    type: 'answer',
                    from: this.localPeer.id,
                    to: msg.from,
                    payload: { sdp: answer.sdp, type: answer.type },
                })
                break
            }

            case 'answer': {
                if (msg.to !== this.localPeer.id) return
                const pc = this.connections.get(msg.from)
                if (pc) {
                    await pc.setRemoteDescription(new RTCSessionDescription(msg.payload))
                }
                break
            }

            case 'ice-candidate': {
                if (msg.to !== this.localPeer.id) return
                const pc = this.connections.get(msg.from)
                if (pc) {
                    await pc.addIceCandidate(new RTCIceCandidate(msg.payload))
                }
                break
            }
        }
    }

    private async handleDataMessage(from: string, msg: P2PMessage) {
        if (msg.type === 'rpc-request') {
            const req = msg.payload as RpcRequest
            const handler = this.handlers.get(req.method)

            let response: RpcResponse
            if (handler) {
                try {
                    const result = await handler(req.params)
                    response = { id: req.id, result }
                } catch (e: any) {
                    response = { id: req.id, error: e.message || String(e) }
                }
            } else {
                response = { id: req.id, error: `Unknown method: ${req.method}` }
            }

            const channel = this.channels.get(from)
            channel?.send(JSON.stringify({
                type: 'rpc-response',
                from: this.localPeer.id,
                payload: response,
            }))
        }

        if (msg.type === 'rpc-response') {
            const res = msg.payload as RpcResponse
            const pending = this.pendingRpc.get(res.id)
            if (pending) {
                clearTimeout(pending.timeout)
                this.pendingRpc.delete(res.id)
                if (res.error) {
                    pending.reject(new Error(res.error))
                } else {
                    pending.resolve(res.result)
                }
            }
        }
    }

    private cleanupPeer(peerId: string) {
        const pc = this.connections.get(peerId)
        if (pc) {
            pc.close()
            this.connections.delete(peerId)
        }
        this.channels.delete(peerId)
    }
}
