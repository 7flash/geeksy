#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync, existsSync, cpSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Geeksy CLI

Usage:
  geeksy                Start Geeksy on the default port
  geeksy --port 3737    Start Geeksy on a custom port
  geeksy --help         Show help
  geeksy --version      Show version

Notes:
- Geeksy requires Bun to run.
- Set GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or another supported provider key before use.`)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  console.log(pkg.version)
  process.exit(0)
}

let port = process.env.BUN_PORT || '3737'
const portIndex = args.findIndex(a => a === '--port' || a === '-p')
if (portIndex >= 0 && args[portIndex + 1]) port = args[portIndex + 1]

const appHome = process.env.GEEKSY_HOME || join(homedir(), '.geeksy')
const bundledSkillsDir = join(root, 'skills')
const userSkillsDir = join(appHome, 'skills')

mkdirSync(join(appHome, 'data'), { recursive: true })
mkdirSync(userSkillsDir, { recursive: true })

if (existsSync(bundledSkillsDir)) {
  for (const name of readdirSync(bundledSkillsDir)) {
    const from = join(bundledSkillsDir, name)
    const to = join(userSkillsDir, name)
    if (!existsSync(to)) cpSync(from, to, { recursive: true })
  }
}

const env = {
  ...process.env,
  BUN_PORT: port,
  GEEKSY_HOME: appHome,
  GEEKSY_APP_ROOT: root,
}
const child = spawn('bun', ['run', resolve(root, 'app/server.ts')], {
  cwd: appHome,
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
})

child.on('error', (err) => {
  if ((err && err.message || '').toLowerCase().includes('bun')) {
    console.error('Geeksy requires Bun, but `bun` was not found in PATH.')
    console.error('Install Bun from https://bun.sh and try again.')
    process.exit(1)
  }
  console.error(err)
  process.exit(1)
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
