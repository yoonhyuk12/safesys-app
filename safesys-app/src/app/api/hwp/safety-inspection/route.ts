import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'create-hwp-from-text.ps1')
const TEMPLATE_PATH = path.join(process.cwd(), 'public', '안전점검 양식.hwp')
let hwpJobQueue: Promise<void> = Promise.resolve()

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return ''
}

function safeBaseName(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/\s+/g, '_')
}

function buildFileBaseName(inspection: Record<string, unknown>): string {
  const type = asText(inspection.inspection_type) || 'inspection'
  const date = asText(inspection.inspection_date) || new Date().toISOString().slice(0, 10)
  return safeBaseName(`safety_inspection_${type}_${date}`)
}

function runPowerShellCreate(jsonPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        SCRIPT_PATH,
        '-JsonPath',
        jsonPath,
        '-OutputPath',
        outputPath,
        '-TemplatePath',
        TEMPLATE_PATH
      ],
      { windowsHide: true }
    )

    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      ps.kill()
      reject(new Error('HWP creation timed out'))
    }, 300000)

    ps.stdout.on('data', chunk => { stdout += chunk.toString() })
    ps.stderr.on('data', chunk => { stderr += chunk.toString() })
    ps.on('error', err => {
      clearTimeout(timeout)
      reject(err)
    })
    ps.on('exit', code => {
      clearTimeout(timeout)
      if (code === 0) {
        resolve()
        return
      }
      const details = (stderr || stdout || '').trim()
      reject(new Error(details || `PowerShell exited with code ${code}`))
    })
  })
}

async function runPowerShellCreateWithRetry(jsonPath: string, outputPath: string): Promise<void> {
  let lastError: unknown = null
  const ext = path.extname(outputPath) || '.hwp'
  const base = outputPath.slice(0, outputPath.length - ext.length)

  for (let attempt = 1; attempt <= 2; attempt++) {
    const attemptOutputPath = attempt === 1 ? outputPath : `${base}.retry${attempt}${ext}`
    try {
      await fs.rm(attemptOutputPath, { force: true })
      await runPowerShellCreate(jsonPath, attemptOutputPath)
      if (attemptOutputPath !== outputPath) {
        await fs.copyFile(attemptOutputPath, outputPath)
        await fs.rm(attemptOutputPath, { force: true })
      }
      return
    } catch (err) {
      lastError = err
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 1200))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error('HWP creation failed')
}

async function enqueueHwpJob<T>(job: () => Promise<T>): Promise<T> {
  const prev = hwpJobQueue
  let release!: () => void
  hwpJobQueue = new Promise<void>(resolve => {
    release = resolve
  })

  await prev.catch(() => undefined)
  try {
    return await job()
  } finally {
    release()
  }
}

export async function POST(request: NextRequest) {
  if (process.platform !== 'win32') {
    return NextResponse.json(
      { error: 'HWP creation is only supported on Windows server environments.' },
      { status: 501 }
    )
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const inspection = (body as Record<string, unknown>).inspection as Record<string, unknown> | undefined
  const results = (body as Record<string, unknown>).results as Array<Record<string, unknown>> | undefined
  const photos = (body as Record<string, unknown>).photos as Array<Record<string, unknown>> | undefined
  const project = (body as Record<string, unknown>).project as Record<string, unknown> | null | undefined

  if (!inspection || !Array.isArray(results) || !Array.isArray(photos)) {
    return NextResponse.json(
      { error: 'inspection, results, photos are required' },
      { status: 400 }
    )
  }

  const fileBaseName = buildFileBaseName(inspection)
  const workDir = path.join(os.tmpdir(), 'safesys-hwp-generate', randomUUID())
  const jsonPath = path.join(workDir, 'payload.json')
  const outputPath = path.join(workDir, `${fileBaseName}.hwp`)

  try {
    await fs.access(TEMPLATE_PATH)
    await fs.mkdir(workDir, { recursive: true })
    const payload = {
      inspection,
      results,
      photos,
      project: project || null
    }
    await fs.writeFile(jsonPath, JSON.stringify(payload), 'utf8')

    await enqueueHwpJob(() => runPowerShellCreateWithRetry(jsonPath, outputPath))

    const outputBuffer = await fs.readFile(outputPath)
    const downloadName = `${fileBaseName}.hwp`
    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'HWP creation failed'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  } finally {
    await Promise.allSettled([
      fs.unlink(jsonPath),
      fs.unlink(outputPath)
    ])
    await fs.rm(workDir, { recursive: true, force: true })
  }
}
