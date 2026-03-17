#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { readFileSync, mkdirSync, existsSync, cpSync, readdirSync, openSync, closeSync } from 'node:fs'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const args = process.argv.slice(2)
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

function getCommit() {
  return pkg.geeksyCommit || pkg.gitHead || process.env.npm_package_gitHead || 'unknown'
}

function getDefaultAppHome() {
  if (process.env.GEEKSY_HOME) return process.env.GEEKSY_HOME
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Geeksy')
  if (process.platform === 'win32') return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Geeksy')
  return join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'geeksy')
}

function ensureWritablePaths(appHome) {
  const dataDir = join(appHome, 'data')
  const dbPath = process.env.GEEKSY_DB_PATH || join(dataDir, 'agents.db')
  const bundledSkillsDir = join(root, 'skills')
  const userSkillsDir = join(appHome, 'skills')

  mkdirSync(dataDir, { recursive: true })
  mkdirSync(userSkillsDir, { recursive: true })

  const fd = openSync(dbPath, 'a')
  closeSync(fd)

  if (existsSync(bundledSkillsDir)) {
    for (const name of readdirSync(bundledSkillsDir)) {
      const from = join(bundledSkillsDir, name)
      const to = join(userSkillsDir, name)
      if (!existsSync(to)) cpSync(from, to, { recursive: true })
    }
  }

  return { dataDir, dbPath, userSkillsDir }
}

if (args.includes('--help') || args.includes('-h')) {
  console.log(`Geeksy CLI

Usage:
  geeksy                Start Geeksy on the default port
  geeksy --port 3737    Start Geeksy on a custom port
  geeksy --help         Show help
  geeksy --version      Show version

Notes:
- Geeksy requires Bun to run.
- Default data dir is OS-native app data (override with GEEKSY_HOME or GEEKSY_DB_PATH).
- Set GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or another supported provider key before use.`)
  process.exit(0)
}

if (args.includes('--version') || args.includes('-v')) {
  console.log(`${pkg.version} (${getCommit()})`)
  process.exit(0)
}

let port = process.env.BUN_PORT || '3737'
const portIndex = args.findIndex(a => a === '--port' || a === '-p')
if (portIndex >= 0 && args[portIndex + 1]) port = args[portIndex + 1]

const appHome = getDefaultAppHome()
let dbPath = ''
let userSkillsDir = ''

try {
  const ensured = ensureWritablePaths(appHome)
  dbPath = ensured.dbPath
  userSkillsDir = ensured.userSkillsDir
} catch (err) {
  console.error(`Geeksy ${pkg.version} (${getCommit()})`)
  console.error(`Failed to prepare writable app data at: ${appHome}`)
  console.error(err)
  process.exit(1)
}

console.log(`Geeksy ${pkg.version} (${getCommit()})`)
console.log(`home=${appHome}`)
console.log(`db=${dbPath}`)
console.log(`skills=${userSkillsDir}`)

const env = {
  ...process.env,
  BUN_PORT: port,
  GEEKSY_HOME: appHome,
  GEEKSY_DB_PATH: dbPath,
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
