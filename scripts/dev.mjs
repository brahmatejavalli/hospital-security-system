import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const python =
  process.env.PYTHON ||
  path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
if (!existsSync(python) && !process.env.PYTHON) {
  const installCommand =
    process.platform === 'win32'
      ? '.\\.venv\\Scripts\\python.exe -m pip install -r backend\\requirements.txt'
      : '.venv/bin/python -m pip install -r backend/requirements.txt'
  console.error(
    `Python environment not found. From the project root, run:\npython -m venv .venv\n${installCommand}`,
  )
  process.exit(1)
}
const apiPort = process.env.API_PORT || '8000'
const frontendPort = process.env.FRONTEND_PORT || '5173'
const children = [
  spawn(
    python,
    [
      '-m',
      'uvicorn',
      'app.main:app',
      '--host',
      '0.0.0.0',
      '--port',
      apiPort,
      '--reload',
      '--no-proxy-headers',
    ],
    { cwd: path.join(root, 'backend'), stdio: 'inherit' },
  ),
  spawn(
    process.execPath,
    [
      'node_modules/vite/bin/vite.js',
      '--config',
      'frontend/vite.config.ts',
      '--host',
      '0.0.0.0',
      '--port',
      frontendPort,
    ],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, API_TARGET: process.env.API_TARGET || `http://127.0.0.1:${apiPort}` },
    },
  ),
]
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill('SIGTERM')
  process.exitCode = code
}
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
for (const child of children) {
  child.on('error', error => {
    console.error(error)
    stop(1)
  })
  child.on('exit', code => {
    if (!stopping) stop(code ?? 1)
  })
}
