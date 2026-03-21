// app/api/landing/route.ts — Standalone landing page HTML
export async function GET() {
    return new Response(LANDING_HTML, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
}

const LANDING_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Geeksy — Your AI that actually does things</title>
<meta name="description" content="Self-hosted AI assistant that writes code, runs scripts, schedules tasks, searches the web, and manages your automation — all from a chat interface.">
<meta property="og:title" content="Geeksy — Your AI that actually does things">
<meta property="og:description" content="Self-hosted AI assistant with autonomous execution. Chat → Code → Schedule → Deploy.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://geeksy.xyz">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#6366f1">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%236366f1'/><text x='50' y='68' text-anchor='middle' font-size='50' font-weight='bold' fill='white'>G</text></svg>" type="image/svg+xml">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0f; color: #e4e4e7; line-height: 1.6; }
a { color: #818cf8; text-decoration: none; }
a:hover { color: #a5b4fc; }
code { font-family: 'JetBrains Mono', 'Fira Code', monospace; }

.landing { max-width: 960px; margin: 0 auto; padding: 0 24px; }

/* Nav */
.nav { display: flex; align-items: center; justify-content: space-between; padding: 20px 0; border-bottom: 1px solid #1e1e2e; }
.nav-brand { display: flex; align-items: center; gap: 10px; }
.logo { width: 36px; height: 36px; background: #6366f1; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: white; }
.brand-name { font-weight: 600; font-size: 18px; color: #f4f4f5; }
.nav-links { display: flex; align-items: center; gap: 24px; font-size: 14px; }
.btn-primary { background: #6366f1; color: white !important; padding: 8px 18px; border-radius: 8px; font-weight: 500; font-size: 14px; transition: background 0.2s; display: inline-block; }
.btn-primary:hover { background: #4f46e5; }

/* Hero */
.hero { text-align: center; padding: 80px 0 60px; }
.hero-badge { display: inline-block; background: #1e1e2e; border: 1px solid #2e2e3e; padding: 6px 16px; border-radius: 20px; font-size: 13px; color: #a1a1aa; margin-bottom: 24px; }
.hero h1 { font-size: clamp(36px, 6vw, 56px); font-weight: 700; line-height: 1.15; color: #f4f4f5; margin-bottom: 20px; }
.gradient-text { background: linear-gradient(135deg, #818cf8, #c084fc, #f472b6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
.hero-sub { font-size: 18px; color: #a1a1aa; max-width: 560px; margin: 0 auto 36px; line-height: 1.7; }
.hero-actions { display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap; }
.btn-hero { background: #6366f1; color: white !important; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 16px; transition: all 0.2s; display: inline-block; }
.btn-hero:hover { background: #4f46e5; transform: translateY(-1px); box-shadow: 0 8px 30px rgba(99,102,241,0.3); }
.install-cmd { display: flex; align-items: center; gap: 8px; background: #1e1e2e; border: 1px solid #2e2e3e; padding: 10px 16px; border-radius: 10px; }
.install-cmd code { color: #a5b4fc; font-size: 15px; }
.copy-btn { background: none; border: none; cursor: pointer; font-size: 14px; padding: 2px; opacity: 0.6; transition: opacity 0.2s; color: #a1a1aa; }
.copy-btn:hover { opacity: 1; }

/* Terminal Demo */
.demo { padding: 0 0 80px; }
.terminal { background: #12121a; border: 1px solid #2e2e3e; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.4); }
.terminal-bar { display: flex; align-items: center; gap: 8px; padding: 12px 16px; background: #1a1a24; border-bottom: 1px solid #2e2e3e; }
.dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.dot.red { background: #ef4444; } .dot.yellow { background: #eab308; } .dot.green { background: #22c55e; }
.terminal-title { margin-left: 8px; font-size: 13px; color: #71717a; }
.terminal-body { padding: 20px; display: flex; flex-direction: column; gap: 16px; }
.chat-line { display: flex; align-items: flex-start; gap: 10px; font-size: 14px; }
.chat-line.user .role { color: #6366f1; font-weight: 600; min-width: 50px; }
.chat-line.agent .role { color: #22c55e; font-weight: 600; min-width: 50px; }
.chat-line.tool { padding-left: 60px; color: #71717a; font-size: 13px; font-family: monospace; }
.tool-badge { background: #1e1e2e; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
.tool-status { color: #22c55e; margin-left: auto; }

/* Features */
.features { padding: 80px 0; }
.features h2 { text-align: center; font-size: 32px; font-weight: 700; margin-bottom: 48px; color: #f4f4f5; }
.feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
.feature-card { background: #12121a; border: 1px solid #1e1e2e; border-radius: 12px; padding: 28px; transition: border-color 0.2s; }
.feature-card:hover { border-color: #6366f1; }
.feature-icon { font-size: 28px; margin-bottom: 12px; }
.feature-card h3 { font-size: 17px; font-weight: 600; margin-bottom: 8px; color: #f4f4f5; }
.feature-card p { font-size: 14px; color: #a1a1aa; line-height: 1.6; }

/* How it works */
.how { padding: 80px 0; }
.how h2 { text-align: center; font-size: 32px; font-weight: 700; margin-bottom: 48px; color: #f4f4f5; }
.steps { display: flex; flex-direction: column; gap: 32px; max-width: 560px; margin: 0 auto; }
.step { display: flex; gap: 20px; align-items: flex-start; }
.step-num { width: 40px; height: 40px; background: #6366f1; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 18px; color: white; flex-shrink: 0; }
.step-content h3 { font-size: 18px; font-weight: 600; color: #f4f4f5; margin-bottom: 4px; }
.step-content code { background: #1e1e2e; padding: 4px 10px; border-radius: 6px; font-size: 14px; color: #a5b4fc; }
.step-content p { font-size: 14px; color: #a1a1aa; margin-top: 6px; }

/* Stack */
.stack { padding: 60px 0; text-align: center; }
.stack h2 { font-size: 24px; font-weight: 600; margin-bottom: 24px; color: #a1a1aa; }
.stack-pills { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
.pill { background: #1e1e2e; border: 1px solid #2e2e3e; padding: 8px 16px; border-radius: 20px; font-size: 13px; color: #a1a1aa; }

/* Footer */
.footer { padding: 40px 0; border-top: 1px solid #1e1e2e; text-align: center; font-size: 14px; color: #71717a; }

/* Mobile */
@media (max-width: 640px) {
    .nav-links a:not(.btn-primary) { display: none; }
    .hero { padding: 48px 0 40px; }
    .hero-actions { flex-direction: column; }
    .install-cmd { width: 100%; justify-content: center; }
    .feature-grid { grid-template-columns: 1fr; }
    .chat-line.tool { padding-left: 20px; }
}
</style>
</head>
<body>
<div class="landing">
    <!-- Nav -->
    <nav class="nav">
        <div class="nav-brand">
            <div class="logo">G</div>
            <span class="brand-name">Geeksy</span>
        </div>
        <div class="nav-links">
            <a href="https://github.com/7flash/geeksy" target="_blank" rel="noopener">GitHub</a>
            <a href="https://www.npmjs.com/package/geeksy" target="_blank" rel="noopener">npm</a>
            <a href="/" class="btn-primary">Open App →</a>
        </div>
    </nav>

    <!-- Hero -->
    <section class="hero">
        <div class="hero-badge">Open Source · Self-Hosted · Free</div>
        <h1>Your AI that actually<br><span class="gradient-text">does things</span></h1>
        <p class="hero-sub">
            Chat with an AI that writes code, runs scripts, schedules tasks,
            searches the web, and manages your automation — all from one interface.
        </p>
        <div class="hero-actions">
            <a href="/" class="btn-hero">Open App</a>
            <div class="install-cmd">
                <code>npx geeksy</code>
                <button class="copy-btn" onclick="navigator.clipboard.writeText('npx geeksy');this.textContent='✓ Copied';setTimeout(()=>this.textContent='📋',1500)" title="Copy">📋</button>
            </div>
        </div>
    </section>

    <!-- Demo -->
    <section class="demo">
        <div class="terminal">
            <div class="terminal-bar">
                <span class="dot red"></span><span class="dot yellow"></span><span class="dot green"></span>
                <span class="terminal-title">Geeksy Chat</span>
            </div>
            <div class="terminal-body">
                <div class="chat-line user">
                    <span class="role">You</span>
                    <span>Give me a motivational quote every morning at 9am</span>
                </div>
                <div class="chat-line agent">
                    <span class="role">Geeksy</span>
                    <span>I'll set that up! Creating a script and scheduling it...</span>
                </div>
                <div class="chat-line tool">
                    <span class="tool-badge">✏️ write_file</span>
                    <span>scripts/morning-quote.ts</span>
                    <span class="tool-status">✓ done</span>
                </div>
                <div class="chat-line tool">
                    <span class="tool-badge">⏰ schedule</span>
                    <span>cron: "0 9 * * *"</span>
                    <span class="tool-status">✓ scheduled</span>
                </div>
                <div class="chat-line agent">
                    <span class="role">Geeksy</span>
                    <span>Done! You'll get a random motivational quote every morning at 9am. ☀️</span>
                </div>
            </div>
        </div>
    </section>

    <!-- Features -->
    <section class="features">
        <h2>Everything an AI assistant should be</h2>
        <div class="feature-grid">
            <div class="feature-card">
                <div class="feature-icon">🔧</div>
                <h3>Autonomous Execution</h3>
                <p>Reads files, writes code, runs commands, edits projects. Not just chat — real tool use with a planner that breaks tasks into objectives.</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">⏰</div>
                <h3>Task Scheduling</h3>
                <p>Schedule scripts and chat prompts with cron, intervals, or one-shot timers. State persistence built in via STATE_URL.</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🌐</div>
                <h3>Web Search</h3>
                <p>Built-in web search and page fetching. The agent can look up documentation, current events, and APIs on the fly.</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🧠</div>
                <h3>Semantic Memory</h3>
                <p>RAG-powered long-term memory using Gemini embeddings. Past conversations inform current answers automatically.</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">🤖</div>
                <h3>Multi-Provider</h3>
                <p>Gemini, Claude, GPT-4, DeepSeek, Qwen — switch models per conversation. Bring your own API keys.</p>
            </div>
            <div class="feature-card">
                <div class="feature-icon">📱</div>
                <h3>Telegram Bot</h3>
                <p>Connect a Telegram bot to chat with Geeksy from your phone. Same agent, same tools, any device.</p>
            </div>
        </div>
    </section>

    <!-- How it works -->
    <section class="how">
        <h2>Three commands to your own AI</h2>
        <div class="steps">
            <div class="step">
                <div class="step-num">1</div>
                <div class="step-content">
                    <h3>Install</h3>
                    <code>npx geeksy</code>
                    <p>One command. Bun-native, zero config. Runs on localhost:3737.</p>
                </div>
            </div>
            <div class="step">
                <div class="step-num">2</div>
                <div class="step-content">
                    <h3>Add a key</h3>
                    <p>Go to Settings → Models → paste your Gemini / OpenAI / Claude API key.</p>
                </div>
            </div>
            <div class="step">
                <div class="step-num">3</div>
                <div class="step-content">
                    <h3>Chat</h3>
                    <p>Ask it to do things. It writes scripts, runs them, schedules tasks, and remembers context.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Stack -->
    <section class="stack">
        <h2>Built with</h2>
        <div class="stack-pills">
            <span class="pill">Bun</span>
            <span class="pill">TypeScript</span>
            <span class="pill">Melina.js</span>
            <span class="pill">smart-agent-ai</span>
            <span class="pill">jsx-ai</span>
            <span class="pill">SQLite</span>
            <span class="pill">SSE Streaming</span>
        </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
        <p>
            Made by <a href="https://github.com/7flash" target="_blank" rel="noopener">@7flash</a>
            &middot;
            <a href="https://github.com/7flash/geeksy" target="_blank" rel="noopener">Source on GitHub</a>
        </p>
    </footer>
</div>
</body>
</html>`
