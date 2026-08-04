'use client'
// 법적이행 확인(안전활동 점검표) 서류철 — 분기별 여/부 점검표 목록·작성/수정 페이지

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import type { Project } from '@/lib/projects'
import { ArrowLeft, Plus, RefreshCw, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import {
  createEmptyFormData,
  hydrateFormData,
  sumConstructionCost,
  isBelowLedgerThreshold,
  DISCIPLINE_OPTIONS,
  type YN,
  type LegalComplianceFormData,
  type LegalComplianceRecord,
} from './lib/constants'
import OverviewSection from './components/OverviewSection'
import OwnerBasicSection from './components/OwnerBasicSection'
import OwnerDetailSection from './components/OwnerDetailSection'
import ContractSection from './components/ContractSection'
import YNToggle from './components/YNToggle'

// 원(BIGINT/문자열) 총공사비 후보 중 첫 유효값을 백만원 단위 문자열로 반올림
const toMillionWon = (candidates: Array<number | null>): string => {
  const won = candidates.find((v) => v != null && Number.isFinite(v) && v > 0)
  return won != null ? String(Math.round(won / 1_000_000)) : ''
}

const currentQuarter = () => Math.floor(new Date().getMonth() / 3) + 1

export default function LegalCompliancePage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [records, setRecords] = useState<LegalComplianceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [view, setView] = useState<'list' | 'form'>('list')
  const [editingRecord, setEditingRecord] = useState<LegalComplianceRecord | null>(null)
  const [formData, setFormData] = useState<LegalComplianceFormData>(createEmptyFormData())
  const [year, setYear] = useState(new Date().getFullYear())
  const [quarter, setQuarter] = useState(currentQuarter())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMenuOpen, setRefreshMenuOpen] = useState(false)

  // 저장된 점검표들의 공종 목록 (최근정보 가져오기 선택지)
  const savedDisciplines = useMemo(() => {
    const set = new Set(records.map((r) => r.form_data.overview.discipline).filter(Boolean))
    const ordered = DISCIPLINE_OPTIONS.filter((d) => set.has(d))
    const rest = [...set].filter((d) => !(DISCIPLINE_OPTIONS as readonly string[]).includes(d))
    return [...ordered, ...rest]
  }, [records])

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login')
  }, [authLoading, user, router])

  useEffect(() => {
    if (!user || !projectId) return
    const loadProject = async () => {
      const { data } = await supabase
        .from('projects')
        .select(
          'id, project_name, managing_hq, managing_branch, project_category, construction_start_date, construction_end_date, total_budget, g2b_tot_amt, representative_contract_id'
        )
        .eq('id', projectId)
        .single()
      if (data) setProject(data as Project)
    }
    loadProject()
  }, [user, projectId])

  const loadRecords = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setLoadError('')
    const { data, error } = await (supabase as any)
      .from('legal_compliance_checks')
      .select('*')
      .eq('project_id', projectId)
      .order('check_year', { ascending: false })
      .order('check_quarter', { ascending: false })
    if (error) {
      setLoadError(
        error.message?.includes('legal_compliance_checks')
          ? '법적이행 확인 테이블이 준비되지 않았습니다. 데이터베이스 마이그레이션을 먼저 실행해주세요.'
          : error.message
      )
    } else if (data) {
      setRecords(
        (data as LegalComplianceRecord[]).map((r) => ({ ...r, form_data: hydrateFormData(r.form_data) }))
      )
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    if (user && projectId) loadRecords()
  }, [user, projectId, loadRecords])

  // 총공사비 50억(5,000백만원) 미만이면 기본·설계·공사 안전보건대장 해당여부를 '부'로 고정하고 종속 값을 비운다
  const belowLedgerThreshold = isBelowLedgerThreshold(formData.overview.costTotal)
  useEffect(() => {
    if (!belowLedgerThreshold) return
    // 해당여부만 '부', 나머지 필드는 '' — 각 대장의 타입을 보존하며 재구성
    const forceNo = <T extends Record<string, YN>>(g: T): T =>
      Object.fromEntries(Object.keys(g).map((fk) => [fk, fk === 'applicable' ? '부' : ''])) as T
    const needsReset = (g: Record<string, YN>): boolean =>
      g.applicable !== '부' || Object.keys(g).some((fk) => fk !== 'applicable' && g[fk] !== '')
    setFormData((prev) => {
      const ob = prev.ownerBasic
      if (!needsReset(ob.basicLedger) && !needsReset(ob.designLedger) && !needsReset(ob.constructionLedger)) {
        return prev
      }
      return {
        ...prev,
        ownerBasic: {
          ...ob,
          basicLedger: needsReset(ob.basicLedger) ? forceNo(ob.basicLedger) : ob.basicLedger,
          designLedger: needsReset(ob.designLedger) ? forceNo(ob.designLedger) : ob.designLedger,
          constructionLedger: needsReset(ob.constructionLedger) ? forceNo(ob.constructionLedger) : ob.constructionLedger,
        },
      }
    })
  }, [belowLedgerThreshold])

  // 안전관리계획서 수립 비대상('부')이면 안전관리실태 이행점검회의 해당여부를 '부'로 종속시키고 이행여부를 비운다
  const implMeetingLocked = formData.ownerBasic.safetyMgmtPlan.applicable === '부'
  useEffect(() => {
    if (!implMeetingLocked) return
    setFormData((prev) => {
      const im = prev.ownerDetail.implMeeting
      if (im.applicable === '부' && im.implemented === '') return prev
      return { ...prev, ownerDetail: { ...prev.ownerDetail, implMeeting: { applicable: '부', implemented: '' } } }
    })
  }, [implMeetingLocked])

  const handleBack = () => {
    if (view === 'form') {
      setView('list')
      return
    }
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) {
      router.push(returnUrl)
      return
    }
    router.push(`/project/${projectId}`)
  }

  // projects·대표계약을 서버에서 새로 조회해 사업개요 자동 채움 값을 만든다 (수동 입력 필드는 건드리지 않음)
  const fetchOverviewDefaults = useCallback(async (): Promise<
    Partial<LegalComplianceFormData['overview']>
  > => {
    const { data } = await supabase
      .from('projects')
      .select(
        'id, project_name, managing_hq, managing_branch, project_category, construction_start_date, construction_end_date, total_budget, g2b_tot_amt, representative_contract_id'
      )
      .eq('id', projectId)
      .single()
    if (!data) return {}
    const proj = data as Project
    setProject(proj)

    const patch: Partial<LegalComplianceFormData['overview']> = {
      hq: proj.managing_hq || '',
      implementer: proj.managing_branch || '',
      sector: proj.project_category || '',
      districtName: proj.project_name || '',
      dateActualStart: proj.construction_start_date || '',
      dateCompletion: proj.construction_end_date || '',
    }
    let contractTot: number | null = null
    if (proj.representative_contract_id) {
      const { data: c } = await (supabase as any)
        .from('project_contracts')
        .select('start_date, tot_cntrct_amt')
        .eq('id', proj.representative_contract_id)
        .single()
      if (c) {
        if (c.start_date) patch.dateContract = c.start_date
        contractTot = typeof c.tot_cntrct_amt === 'number' ? c.tot_cntrct_amt : null
      }
    }
    const budgetNum =
      proj.total_budget && proj.total_budget !== '' ? Number(proj.total_budget) : null
    const costTotal = toMillionWon([proj.g2b_tot_amt ?? null, budgetNum, contractTot])
    if (costTotal) patch.costTotal = costTotal
    return patch
  }, [projectId])

  // 새 점검표 — projects 기본정보와 대표계약으로 사업개요 자동 채움
  const startNew = useCallback(async () => {
    const fd = createEmptyFormData()
    const patch = await fetchOverviewDefaults()
    const merged = { ...fd.overview, ...patch }
    const total = sumConstructionCost(merged.costNet, merged.costMaterial)
    if (total !== null) merged.costTotal = total
    fd.overview = merged
    setFormData(fd)
    setEditingRecord(null)
    setYear(new Date().getFullYear())
    setQuarter(currentQuarter())
    setSaveError('')
    setView('form')
  }, [fetchOverviewDefaults])

  // 최근정보 가져오기 — 기본정보 갱신 또는 선택한 공종의 최근 점검표 전체 불러오기
  const handleRefreshDefaults = async (source: string) => {
    setRefreshMenuOpen(false)
    setRefreshing(true)
    if (source === 'basic') {
      // 서버 최신 기본정보로 사업개요의 자동 채움 필드만 갱신 (체크값·수동 입력 유지)
      const patch = await fetchOverviewDefaults()
      setFormData((prev) => {
        const merged = { ...prev.overview, ...patch }
        // 순공사비·자재대가 있으면 총공사비는 그 합을 유지(예산값으로 덮어쓰지 않음)
        const total = sumConstructionCost(merged.costNet, merged.costMaterial)
        if (total !== null) merged.costTotal = total
        return { ...prev, overview: merged }
      })
    } else {
      // records는 연도·분기 내림차순 정렬 상태 — 해당 공종의 가장 최근 점검표를 복사
      const latest = records.find((r) => r.form_data.overview.discipline === source)
      if (latest) {
        setFormData(hydrateFormData(latest.form_data))
      } else {
        alert(`${source} 공종의 저장된 점검표가 없습니다.`)
      }
    }
    setRefreshing(false)
  }

  const startEdit = (rec: LegalComplianceRecord) => {
    setFormData(hydrateFormData(rec.form_data))
    setEditingRecord(rec)
    setYear(rec.check_year)
    setQuarter(rec.check_quarter)
    setSaveError('')
    setView('form')
  }

  const handleDelete = async (rec: LegalComplianceRecord) => {
    if (!confirm(`${rec.check_year}년 ${rec.check_quarter}분기 점검표를 삭제하시겠습니까?`)) return
    const { error } = await (supabase as any).from('legal_compliance_checks').delete().eq('id', rec.id)
    if (error) {
      alert('삭제에 실패했습니다: ' + error.message)
      return
    }
    loadRecords()
  }

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    setSaveError('')
    try {
      if (editingRecord) {
        const { error } = await (supabase as any)
          .from('legal_compliance_checks')
          .update({
            check_year: year,
            check_quarter: quarter,
            form_data: formData,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingRecord.id)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await (supabase as any).from('legal_compliance_checks').insert({
          project_id: projectId,
          created_by: user.id,
          check_year: year,
          check_quarter: quarter,
          form_data: formData,
        })
        if (error) throw new Error(error.message)

        // 텔레그램 알림 발송 (발주청) - 신규 등록 시에만
        try {
          const { data: projectTgData } = await supabase
            .from('projects')
            .select('client_telegram_id, client_app_code')
            .eq('id', projectId)
            .single()

          if (projectTgData?.client_telegram_id || projectTgData?.client_app_code) {
            const discipline = formData.overview?.discipline || ''
            const telegramMessage =
              `📑 <b>법적이행 확인 점검표 등록 알림</b>\n\n` +
              `🏗️ <b>현장:</b> ${project?.project_name || ''}\n` +
              `📅 <b>연도·분기:</b> ${year}년 ${quarter}분기` +
              (discipline ? `\n🔧 <b>공종:</b> ${discipline}` : '') +
              `\n\n🔗 <a href="https://safesys.vercel.app/">AI안전관리 시스템 바로가기</a>`

            await fetch('/api/telegram', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'direct',
                chatId: projectTgData.client_telegram_id || undefined,
                projectId,
                recipients: { client: true, contractor: false },
                message: telegramMessage,
              }),
            })
          }
        } catch (telegramError) {
          console.error('텔레그램 발송 오류:', telegramError)
        }
      }
      await loadRecords()
      setView('list')
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || !user) return null

  const sectionTitle = (n: number, text: string) => (
    <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-800">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[11px] text-white">{n}</span>
      {text}
    </h2>
  )

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-4">
          <div className="flex h-16 items-center gap-3">
            <button onClick={handleBack} className="shrink-0 text-gray-400 hover:text-gray-600">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-gray-900 sm:text-xl">법적이행 확인</h1>
              {project && <p className="truncate text-xs text-gray-500">{project.project_name}</p>}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-2 py-4 sm:px-4">
        {view === 'list' ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
              <h2 className="text-sm font-semibold sm:text-base">
                안전활동 점검표
                {records.length > 0 && <span className="ml-2 text-xs font-normal text-blue-100">{records.length}건</span>}
              </h2>
              <button
                onClick={startNew}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" />
                새 점검표 작성
              </button>
            </div>

            {loading ? (
              <div className="p-8 text-center text-sm text-gray-500">불러오는 중…</div>
            ) : loadError ? (
              <div className="p-8 text-center text-sm text-red-600">{loadError}</div>
            ) : records.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">등록된 점검표가 없습니다.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {records.map((rec) => (
                  <li
                    key={rec.id}
                    onClick={() => startEdit(rec)}
                    className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-gray-50"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {rec.check_year}년 {rec.check_quarter}분기
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                        {rec.form_data.overview.discipline || '공종 미지정'}
                      </span>
                      {rec.form_data.isContractedWork === '여' && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700">도급사업</span>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">
                      {new Date(rec.updated_at).toLocaleDateString('ko-KR')}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(rec)
                      }}
                      className="shrink-0 text-gray-300 hover:text-red-500"
                      aria-label="삭제"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* 연도·분기 */}
            <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-1 rounded-md border border-gray-300 bg-white py-0.5 pl-2 pr-1">
                <span className="min-w-[44px] text-center text-sm tabular-nums">{year}년</span>
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => setYear((y) => y + 1)}
                    aria-label="다음 연도"
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setYear((y) => y - 1)}
                    aria-label="이전 연도"
                    className="text-gray-400 hover:text-gray-700"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <select
                value={quarter}
                onChange={(e) => setQuarter(Number(e.target.value))}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              >
                {[1, 2, 3, 4].map((q) => (
                  <option key={q} value={q}>
                    {q}분기
                  </option>
                ))}
              </select>
              <span className="relative ml-auto">
                <button
                  type="button"
                  onClick={() => setRefreshMenuOpen((v) => !v)}
                  disabled={refreshing}
                  className="flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                  {refreshing ? '가져오는 중…' : '최근정보 가져오기'}
                </button>
                {refreshMenuOpen && (
                  <>
                    {/* 바깥 클릭 시 닫힘 */}
                    <div className="fixed inset-0 z-40" onClick={() => setRefreshMenuOpen(false)} />
                    <div className="absolute right-0 top-[calc(100%+4px)] z-50 min-w-44 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                      <button
                        type="button"
                        onClick={() => handleRefreshDefaults('basic')}
                        className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-blue-50"
                      >
                        프로젝트 기본정보
                      </button>
                      {savedDisciplines.length > 0 && (
                        <div className="border-t border-gray-100 px-3 pb-0.5 pt-1.5 text-[10px] text-gray-400">
                          공종별 최근 점검표
                        </div>
                      )}
                      {savedDisciplines.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => handleRefreshDefaults(d)}
                          className="block w-full px-3 py-2 text-left text-xs text-gray-700 hover:bg-blue-50"
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </span>
            </div>

            {/* ① 사업개요 */}
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {sectionTitle(1, '사업개요')}
              <OverviewSection
                value={formData.overview}
                onChange={(overview) => setFormData((prev) => ({ ...prev, overview }))}
              />
            </section>

            {/* ② 안전활동 기본사항 */}
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {sectionTitle(2, '안전활동 기본사항')}
              <OwnerBasicSection
                value={formData.ownerBasic}
                onChange={(ownerBasic) => setFormData((prev) => ({ ...prev, ownerBasic }))}
                budgetBelowThreshold={belowLedgerThreshold}
              />
            </section>

            {/* ③ 안전활동 세부사항 */}
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {sectionTitle(3, '안전활동 세부사항')}
              <OwnerDetailSection
                value={formData.ownerDetail}
                onChange={(ownerDetail) => setFormData((prev) => ({ ...prev, ownerDetail }))}
                ledgerImplLocked={formData.ownerBasic.constructionLedger.applicable === '부'}
                coordinatorLocked={formData.ownerBasic.coordinator.applicable === '부'}
                implMeetingLocked={implMeetingLocked}
              />
            </section>

            {/* ④ 도급사업 의무사항 */}
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {sectionTitle(4, '도급사업 의무사항')}
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="text-sm text-gray-700">도급사업 해당여부</span>
                <YNToggle
                  value={formData.isContractedWork}
                  onChange={(v) => setFormData((prev) => ({ ...prev, isContractedWork: v }))}
                />
              </div>
              {formData.isContractedWork === '여' ? (
                <ContractSection
                  value={formData.contractChecks}
                  onChange={(contractChecks) => setFormData((prev) => ({ ...prev, contractChecks }))}
                />
              ) : (
                <p className="text-xs text-gray-400">도급사업 해당여부를 &lsquo;여&rsquo;로 선택하면 의무사항 점검 항목이 표시됩니다.</p>
              )}
            </section>

            {/* ⑤ 비고 */}
            <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
              {sectionTitle(5, '비고')}
              <textarea
                value={formData.remarks}
                onChange={(e) => setFormData((prev) => ({ ...prev, remarks: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="특이사항을 입력하세요."
              />
            </section>

            {saveError && <p className="text-center text-sm text-red-600">{saveError}</p>}

            <div className="flex items-center justify-end gap-2 pb-8">
              <button
                onClick={() => setView('list')}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? '저장 중…' : editingRecord ? '수정 저장' : '저장'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
