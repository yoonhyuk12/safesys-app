'use client'
// 화면 라벨용으로 기능 키에 설정된 AI 모델명을 한 번 조회하고, 로딩·실패 시엔 기존 문구를 그대로 돌려주는 훅

import { useEffect, useState } from 'react'
import type { AiFeatureKey } from '@/lib/ai-models'

interface AiModelResponse {
  success?: unknown
  model?: unknown
}

function readModel(value: unknown): string {
  if (typeof value !== 'object' || value === null) return ''
  const body = value as AiModelResponse
  if (body.success !== true || typeof body.model !== 'string') return ''
  return body.model.trim()
}

/** 조회에 성공하면 설정된 모델 id를, 그 전이나 실패 시엔 fallback을 반환한다. */
export function useAiModel(featureKey: AiFeatureKey, fallback: string): string {
  const [model, setModel] = useState('')

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()

    const load = async () => {
      try {
        const response = await fetch(`/api/ai/model?feature=${encodeURIComponent(featureKey)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`AI 모델명 조회 오류 (${response.status})`)
        const data: unknown = await response.json()
        if (!cancelled) setModel(readModel(data))
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          setModel('')
        }
      }
    }

    void load()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [featureKey])

  return model || fallback
}
