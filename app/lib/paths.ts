import { join, resolve } from 'path'

export const appRoot = process.env.GEEKSY_APP_ROOT || process.cwd()
export const appHome = process.env.GEEKSY_HOME || process.cwd()

export const dataDir = join(appHome, 'data')
export const backupsDir = join(dataDir, 'backups')
export const skillsDir = join(appHome, 'skills')
export const keysPath = join(appHome, '.geeksy-keys.json')
export const secretsPath = join(appHome, '.geeksy-secrets.json')
export const configPath = join(appHome, '.config.toml')

export const appNodeModulesDir = join(appHome, 'node_modules')
export const rootNodeModulesDir = join(appRoot, 'node_modules')
export const workspaceRoot = resolve(appRoot, '..')
