'use client'
// 관리자가 AI 기능별 제조사·모델명·비고를 확인하고 편집하는 화면

import { useCallback, useEffect, useState } from 'react'
import { Bot, CloudDownload, Loader2, Pencil, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { AiProvider } from '@/lib/ai-models'

const PROVIDERS: readonly AiProvider[] = ['OpenAI', 'Google']
const MODEL_LIST_ID = 'ai-model-candidates'

interface AiUsageItem {
  featureKey: string
  provider: AiProvider
  model: string
  location: string
  feature: string
  remarks: string
  sortOrder: number
}

type AiUsageResponse =
  | { success: true; source: 'defaults' | 'database'; items: AiUsageItem[] }
  | { success: false; error?: string }

type PatchResponse =
  | { success: true; featureKey: string }
  | { success: false; error?: string }

type AvailableResponse =
  | { success: true; provider: AiProvider; models: string[] }
  | { success: false; error?: string }

interface EditDraft {
  provider: AiProvider
  model: string
  remarks: string
}

type ModelOptions = Partial<Record<AiProvider, string[]>>

const inputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-100'

async function requireAccessToken(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('로그인이 필요합니다.')
  return session.access_token
}

function ProviderBadge({ provider }: { provider: AiProvider }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        provider === 'OpenAI' ? 'bg-emerald-50 text-emerald-700' : 'bg-indigo-50 text-indigo-700'
      }`}
    >
      {provider}
    </span>
  )
}

function ModelCandidateList({ models }: { models: string[] }) {
  return (
    <datalist id={MODEL_LIST_ID}>
      {models.map((model) => <option key={model} value={model} />)}
    </datalist>
  )
}

function EditFields({
  draft,
  onChange,
  candidates,
  modelsLoading,
  modelsError,
  onFetchModels,
}: {
  draft: EditDraft
  onChange: (next: EditDraft) => void
  candidates: string[]
  modelsLoading: boolean
  modelsError: string | null
  onFetchModels: () => void
}) {
  return (
    <div className="grid gap-2">
      <select
        value={draft.provider}
        onChange={(event) => onChange({ ...draft, provider: event.target.value as AiProvider })}
        aria-label="제조사"
        className={inputClass}
      >
        {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
      </select>

      <div className="flex gap-2">
        <input
          type="text"
          list={MODEL_LIST_ID}
          value={draft.model}
          onChange={(event) => onChange({ ...draft, model: event.target.value })}
          aria-label="모델명"
          placeholder="모델명을 고르거나 직접 입력합니다"
          className={`${inputClass} font-mono`}
        />
        <button
          type="button"
          onClick={onFetchModels}
          disabled={modelsLoading}
          title={`${draft.provider} 최신 모델 목록 불러오기`}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          {modelsLoading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            : <CloudDownload className="h-3.5 w-3.5" aria-hidden="true" />}
          최신 모델 조회
        </button>
      </div>

      <input
        type="text"
        value={draft.remarks}
        onChange={(event) => onChange({ ...draft, remarks: event.target.value })}
        aria-label="비고"
        placeholder="비고"
        className={inputClass}
      />

      {modelsError
        ? <p className="text-xs font-semibold text-red-600">{modelsError}</p>
        : candidates.length > 0
          ? <p className="text-xs text-slate-400">{draft.provider} 모델 후보 {candidates.length}개를 불러왔습니다.</p>
          : <p className="text-xs text-slate-400">최신 모델 조회를 누르면 목록에서 고를 수 있습니다.</p>}
    </div>
  )
}

function EditActions({
  saving,
  onSave,
  onCancel,
}: {
  saving: boolean
  onSave: () => void
  onCancel: () => void
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      >
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {saving ? '저장 중' : '저장'}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-600 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        취소
      </button>
    </div>
  )
}

interface RowHandlers {
  editingKey: string | null
  draft: EditDraft | null
  saving: boolean
  candidates: string[]
  modelsLoading: boolean
  modelsError: string | null
  onDraftChange: (next: EditDraft) => void
  onFetchModels: () => void
  onEdit: (item: AiUsageItem) => void
  onSave: () => void
  onCancel: () => void
}

function AiUsageTable({ items, loading, handlers }: { items: AiUsageItem[]; loading: boolean; handlers: RowHandlers }) {
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs">
            <tr>
              <th scope="col" className="px-4 py-2 font-semibold text-slate-600">제조사</th>
              <th scope="col" className="px-3 py-2 font-semibold text-slate-600">모델명</th>
              <th scope="col" className="px-3 py-2 font-semibold text-slate-600">위치</th>
              <th scope="col" className="px-3 py-2 font-semibold text-slate-600">기능</th>
              <th scope="col" className="px-3 py-2 font-semibold text-slate-600">비고</th>
              <th scope="col" className="px-4 py-2 text-right font-semibold text-slate-600">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    AI 사용현황을 불러오는 중입니다.
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-slate-500">
                  표시할 AI 사용현황이 없습니다.
                </td>
              </tr>
            ) : items.map((item) => {
              const editing = handlers.editingKey === item.featureKey && handlers.draft !== null

              return (
                <tr key={item.featureKey} className="align-top transition hover:bg-slate-50">
                  {editing && handlers.draft ? (
                    <td colSpan={2} className="px-4 py-2.5">
                      <EditFields
                        draft={handlers.draft}
                        onChange={handlers.onDraftChange}
                        candidates={handlers.candidates}
                        modelsLoading={handlers.modelsLoading}
                        modelsError={handlers.modelsError}
                        onFetchModels={handlers.onFetchModels}
                      />
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-2.5"><ProviderBadge provider={item.provider} /></td>
                      <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">{item.model}</td>
                    </>
                  )}
                  <td className="max-w-[320px] px-3 py-2.5">
                    <span className="block break-all font-mono text-[11px] leading-snug text-slate-500">
                      {item.location}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-800">{item.feature}</td>
                  <td className="max-w-[220px] px-3 py-2.5 text-xs text-slate-500">
                    {editing ? <span className="text-slate-400">왼쪽 입력란에서 수정합니다.</span> : item.remarks || '-'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {editing ? (
                      <div className="flex justify-end">
                        <EditActions saving={handlers.saving} onSave={handlers.onSave} onCancel={handlers.onCancel} />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlers.onEdit(item)}
                        disabled={handlers.editingKey !== null}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        편집
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AiUsageMobileList({ items, loading, handlers }: { items: AiUsageItem[]; loading: boolean; handlers: RowHandlers }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white py-12 text-sm text-slate-500 shadow-sm md:hidden">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" aria-hidden="true" />
        AI 사용현황을 불러오는 중입니다.
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500 shadow-sm md:hidden">
        표시할 AI 사용현황이 없습니다.
      </div>
    )
  }

  return (
    <div className="grid gap-2 md:hidden">
      {items.map((item) => {
        const editing = handlers.editingKey === item.featureKey && handlers.draft !== null

        return (
          <div key={item.featureKey} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-950">{item.feature}</span>
                <span className="mt-1 flex items-center gap-2">
                  <ProviderBadge provider={item.provider} />
                  <span className="truncate font-mono text-xs font-semibold text-slate-700">{item.model}</span>
                </span>
              </span>
              {!editing && (
                <button
                  type="button"
                  onClick={() => handlers.onEdit(item)}
                  disabled={handlers.editingKey !== null}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
                >
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  편집
                </button>
              )}
            </div>

            <p className="mt-2 break-all font-mono text-[11px] leading-snug text-slate-500">{item.location}</p>

            {editing && handlers.draft ? (
              <div className="mt-3 grid gap-2">
                <EditFields
                  draft={handlers.draft}
                  onChange={handlers.onDraftChange}
                  candidates={handlers.candidates}
                  modelsLoading={handlers.modelsLoading}
                  modelsError={handlers.modelsError}
                  onFetchModels={handlers.onFetchModels}
                />
                <EditActions saving={handlers.saving} onSave={handlers.onSave} onCancel={handlers.onCancel} />
              </div>
            ) : (
              item.remarks && <p className="mt-2 text-xs text-slate-500">{item.remarks}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function AdminAiUsagePage() {
  const [items, setItems] = useState<AiUsageItem[]>([])
  const [source, setSource] = useState<'defaults' | 'database'>('database')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [modelOptions, setModelOptions] = useState<ModelOptions>({})
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)

  const loadItems = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const token = await requireAccessToken()
      const response = await fetch('/api/admin/ai-usage', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = (await response.json()) as AiUsageResponse

      if (!response.ok || !result.success) {
        throw new Error(!result.success ? result.error || 'AI 사용현황을 불러오지 못했습니다.' : 'AI 사용현황을 불러오지 못했습니다.')
      }

      setItems(result.items)
      setSource(result.source)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'AI 사용현황을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadItems()
  }, [loadItems])

  const handleEdit = (item: AiUsageItem) => {
    setEditingKey(item.featureKey)
    setDraft({ provider: item.provider, model: item.model, remarks: item.remarks })
    setModelsError(null)
    setError(null)
  }

  const handleCancel = () => {
    setEditingKey(null)
    setDraft(null)
    setModelsError(null)
  }

  // 제조사별로 한 번만 불러오고 그 뒤에는 캐시된 후보를 그대로 쓴다.
  const handleFetchModels = async () => {
    if (!draft) return
    const provider = draft.provider

    setModelsError(null)
    setModelsLoading(true)

    try {
      const token = await requireAccessToken()
      const response = await fetch(`/api/admin/ai-models/available?provider=${provider}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = (await response.json()) as AvailableResponse

      if (!response.ok || !result.success) {
        throw new Error(!result.success ? result.error || '모델 목록을 불러오지 못했습니다.' : '모델 목록을 불러오지 못했습니다.')
      }

      setModelOptions((current) => ({ ...current, [provider]: result.models }))
    } catch (fetchError) {
      setModelsError(fetchError instanceof Error ? fetchError.message : '모델 목록을 불러오지 못했습니다.')
    } finally {
      setModelsLoading(false)
    }
  }

  const handleSave = async () => {
    if (!editingKey || !draft) return

    const model = draft.model.trim()
    if (!model) {
      setError('모델명을 입력해주세요.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const token = await requireAccessToken()
      const response = await fetch('/api/admin/ai-usage', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          featureKey: editingKey,
          provider: draft.provider,
          model,
          remarks: draft.remarks.trim(),
        }),
      })
      const result = (await response.json()) as PatchResponse

      if (!response.ok || !result.success) {
        throw new Error(!result.success ? result.error || 'AI 모델 설정을 저장하지 못했습니다.' : 'AI 모델 설정을 저장하지 못했습니다.')
      }

      setEditingKey(null)
      setDraft(null)
      await loadItems()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'AI 모델 설정을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const candidates = draft ? modelOptions[draft.provider] ?? [] : []

  const handlers: RowHandlers = {
    editingKey,
    draft,
    saving,
    candidates,
    modelsLoading,
    modelsError,
    onDraftChange: setDraft,
    onFetchModels: () => void handleFetchModels(),
    onEdit: handleEdit,
    onSave: () => void handleSave(),
    onCancel: handleCancel,
  }

  return (
    <section className="space-y-4">
      <ModelCandidateList models={candidates} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-[0.18em] text-blue-600">AI CONTROL</p>
          <h2 className="mt-1 flex items-center gap-2 text-xl font-bold text-slate-950 md:text-2xl">
            <Bot className="h-6 w-6 text-blue-600" aria-hidden="true" />
            AI 사용현황
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            기능별 제조사와 모델명을 관리합니다. 저장한 모델은 최대 1분 안에 실제 서비스에 반영됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadItems()}
          disabled={loading}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition hover:border-slate-300 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          새로고침
        </button>
      </div>

      {!loading && source === 'defaults' && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800"
        >
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            DB 마이그레이션 실행 전이라 편집 내용이 저장되지 않습니다.
            <span className="mt-0.5 block text-xs font-medium text-amber-700">
              database/20260813-1400_ai_model_settings.sql을 실행하면 편집한 모델이 서비스에 반영됩니다.
            </span>
          </span>
        </div>
      )}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => void loadItems()}
            className="shrink-0 rounded-lg px-1 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-red-400"
          >
            다시 시도
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600 shadow-sm md:px-4">
        <span className="tabular-nums">전체 {items.length.toLocaleString('ko-KR')}건</span>
        <span>{source === 'database' ? 'DB 설정 적용 중' : '코드 기본값 표시 중'}</span>
      </div>

      <AiUsageMobileList items={items} loading={loading} handlers={handlers} />
      <AiUsageTable items={items} loading={loading} handlers={handlers} />
    </section>
  )
}
