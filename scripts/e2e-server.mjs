// Isolated sample workspace: browser tests never mutate a developer's database.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = mkdtempSync(path.join(tmpdir(), 'medguard-e2e-'))
const child = spawn(process.execPath, ['scripts/dev.mjs'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_ENV: 'test',
    DEMO_MODE: 'true',
    DATA_DIR: data,
    DATABASE_URL: `sqlite:///${data}/test.db`,
    S3_BUCKET: '',
    AWS_BUCKET_NAME: '',
    API_PORT: '8001',
    FRONTEND_PORT: '5174',
  },
})
let stopping = false
function stop() {
  if (!stopping) {
    stopping = true
    child.kill('SIGTERM')
  }
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
process.on('exit', () => rmSync(data, { recursive: true, force: true }))
child.on('error', error => {
  console.error(error)
  process.exit(1)
})
child.on('exit', code => process.exit(code ?? 0))
