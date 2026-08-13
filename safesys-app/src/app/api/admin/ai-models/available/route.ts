// 관리자 화면의 모델 드롭다운용 — OpenAI·Gemini 모델 목록 API를 프록시해 id 배열로 돌려주는 라우트
import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import type { AiProvider } from '@/lib/ai-models'

const CACHE_TTL_MS = 10 * 60 * 1000

// 채팅·생성용 모델을 목록 앞쪽에 두기 위한 접두사. 나머지(임베딩·TTS 등)는 뒤로 밀린다.
const OPENAI_PRIMARY_PREFIXES = ['gpt-', 'chatgpt-', 'o1', 'o3', 'o4']

interface CacheEntry {
  models: string[]
  fetchedAt: number
}

const cache = new Map<AiProvider, CacheEntry>()

function isProvider(value: string | null): value is AiProvider {
  return value === 'OpenAI' || value === 'Google'
}

function readString(value: unknown, key: string): string {
  if (typeof value !== 'object' || value === null) return ''
  const record = value as Record<string, unknown>
  const field = record[key]
  return typeof field === 'string' ? field : ''
}

function readArray(value: unknown, key: string): unknown[] {
  if (typeof value !== 'object' || value === null) return []
  const record = value as Record<string, unknown>
  return Array.isArray(record[key]) ? (record[key] as unknown[]) : []
}

function sortByPriority(ids: readonly string[], isPrimary: (id: string) => boolean): string[] {
  const primary = ids.filter(isPrimary).sort()
  const rest = ids.filter((id) => !isPrimary(id)).sort()
  return [...primary, ...rest]
}

async function fetchOpenAiModels(): Promise<string[]> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY가 설정되지 않았습니다.')

  const response = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    throw new Error(`OpenAI 모델 목록 조회 실패 (${response.status})`)
  }

  const payload: unknown = await response.json()
  const ids = readArray(payload, 'data')
    .map((entry) => readString(entry, 'id'))
    .filter(Boolean)

  return sortByPriority(ids, (id) => OPENAI_PRIMARY_PREFIXES.some((prefix) => id.startsWith(prefix)))
}

async function fetchGeminiModels(): Promise<string[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY가 설정되지 않았습니다.')

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
    headers: { 'x-goog-api-key': apiKey },
  })
  if (!response.ok) {
    throw new Error(`Gemini 모델 목록 조회 실패 (${response.status})`)
  }

  const payload: unknown = await response.json()
  const entries = readArray(payload, 'models')
  const generative = new Set(
    entries
      .filter((entry) =>
        readArray(entry, 'supportedGenerationMethods').some((method) => method === 'generateContent')
      )
      .map((entry) => readString(entry, 'name').replace(/^models\//, ''))
      .filter(Boolean)
  )
  const ids = entries
    .map((entry) => readString(entry, 'name').replace(/^models\//, ''))
    .filter(Boolean)

  return sortByPriority(ids, (id) => generative.has(id))
}

async function loadModels(provider: AiProvider): Promise<string[]> {
  const cached = cache.get(provider)
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.models

  const models = provider === 'OpenAI' ? await fetchOpenAiModels() : await fetchGeminiModels()
  cache.set(provider, { models, fetchedAt: Date.now() })
  return models
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) {
    return NextResponse.json({ success: false, error: auth.error }, { status: auth.status })
  }

  const provider = request.nextUrl.searchParams.get('provider')
  if (!isProvider(provider)) {
    return NextResponse.json(
      { success: false, error: 'provider는 OpenAI 또는 Google이어야 합니다.' },
      { status: 400 }
    )
  }

  try {
    return NextResponse.json({ success: true, provider, models: await loadModels(provider) })
  } catch (error) {
    console.error('AI 모델 목록 조회 오류', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : '모델 목록을 불러오지 못했습니다.' },
      { status: 502 }
    )
  }
}
