'use client'

// 사업현황 재해예방기술지도 카드 뷰 — 지사별 건수 → 지사 클릭 시 사업별 건수, 세부 내용은 관공서 양식 엑셀 다운로드
import React, { useState, useEffect, useMemo, useRef } from 'react'
import { ArrowLeft, Shield, Building, Download, Loader2 } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { BRANCH_OPTIONS } from '@/lib/constants'
import {
  downloadDisasterPreventionContractExcel,
  type DisasterPreventionExcelRow,
} from '@/lib/excel/disaster-prevention-contract-export'

interface BusinessDisasterPreventionViewProps {
  initialBranch?: string | null
  onBack: () => void
  onRowClickProject: (projectId: string, branch: string | null) => void
}

// project_contracts + projects 조인 결과에서 필요한 필드만 선언
interface ContractRecord {
  id: string
  project_id: string
  contract_type: '공사' | '용역'
  cntrct_nm: string
  corp_nm: string | null
  tot_cntrct_amt: number | null
  cntrct_date: string | null
  start_date: string | null
  end_date: string | null
  projects: {
    id: string
    project_name: string
    managing_hq: string
    managing_branch: string
    site_address: string | null
    display_order: number | null
  }
}

// 차수(연차) 접미어·공백 제거 정규화 (contract-status의 nameGroupKey 규칙과 동일)
const norm = (name: string): string =>
  name.replace(/\(\s*\d+\s*차[^)]*\)\s*$/, '').replace(/\s+/g, '')

// 차수 병합 그룹
interface MergedGroup {
  reprName: string
  corp: string
  totAmt: number | null
  start: string
  end: string
  cntrctDate: string
  contractType: '공사' | '용역'
}

// 공사 1건(+매칭 지도용역) 단위 행 — 건수 집계와 엑셀 세부 내용의 공통 원천
interface DetailRow {
  projectId: string
  projectName: string
  managingHq: string
  managingBranch: string
  location: string
  corpName: string
  workName: string
  workStart: string
  workEnd: string
  workAmt: number | null
  hasWork: boolean
  guideName: string
  guideOrgName: string
  guideAmt: number | null
  guideStart: string
  guideEnd: string
  hasGuide: boolean
  sortDate: string
  displayOrder: number
}

// 소재지 — 광역시·특별시류 토큰은 건너뛰고 첫 시·군 토큰. 없으면 첫 토큰
const extractLocation = (addr: string | null | undefined): string => {
  if (!addr) return ''
  const tokens = addr.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  const metroSuffix = /(광역시|특별시|특별자치시|특별자치도)$/
  const cityCounty = /^[가-힣]+(시|군)$/
  for (const t of tokens) {
    if (metroSuffix.test(t)) continue
    if (cityCounty.test(t)) return t
  }
  return tokens[0]
}

// 본부명 표시 — '본사'/'기타'가 아니고 '본부'로 안 끝나면 접미
const hqDisplay = (hq: string): string =>
  hq !== '본사' && hq !== '기타' && !hq.endsWith('본부') ? `${hq}본부` : hq

const HQ_KEYS = Object.keys(BRANCH_OPTIONS)
const hqIndex = (hq: string): number => {
  const i = HQ_KEYS.indexOf(hq)
  return i === -1 ? HQ_KEYS.length : i
}

interface AggStats {
  projectIds: Set<string>
  workCount: number
  guideCount: number
  guideAmt: number // 기술지도 계약금액 합
}

const emptyStats = (): AggStats => ({ projectIds: new Set(), workCount: 0, guideCount: 0, guideAmt: 0 })

const BusinessDisasterPreventionView: React.FC<BusinessDisasterPreventionViewProps> = ({
  initialBranch = null,
  onBack,
  onRowClickProject,
}) => {
  const { user, userProfile } = useAuth()
  // initialBranch가 있으면(계약현황 서류철에서 복귀) 해당 지사의 사업 목록부터 복원
  const [viewLevel, setViewLevel] = useState<'branch' | 'project'>(initialBranch ? 'project' : 'branch')
  const [selectedBranchForDetail, setSelectedBranchForDetail] = useState<string | null>(initialBranch)
  const [records, setRecords] = useState<ContractRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (!user || !userProfile) return
    if (userProfile.role !== '발주청') {
      setLoading(false)
      return
    }
    if (loadedRef.current) return
    loadedRef.current = true

    const load = async () => {
      try {
        // projects와 FK 관계가 2개(project_id, 대표계약)라 임베드에 컬럼 힌트가 필수 — 없으면 모호성 오류
        let q = (supabase as any)
          .from('project_contracts')
          .select('*, projects!project_id!inner(id, project_name, managing_hq, managing_branch, site_address, display_order)')

        // getProjectsByUserBranch와 동일한 관할 범위 규칙을 조인 컬럼 필터로 재현
        const hq = userProfile.hq_division
        const branch = userProfile.branch_division
        if (hq === '본사' && branch === '본사') {
          // 본사 조직: 필터 없음
        } else if (hq) {
          if (branch) {
            const hqBranches = BRANCH_OPTIONS[hq] || []
            const isHeadquarterBranch = hqBranches.length > 0 && hqBranches[0] === branch
            if (isHeadquarterBranch) q = q.eq('projects.managing_hq', hq)
            else q = q.eq('projects.managing_branch', branch)
          } else {
            q = q.eq('projects.managing_hq', hq)
          }
        }
        // hq 없음: 필터 없음 (관리자급)

        const { data, error: qErr } = await q
        if (qErr) {
          setError('계약 현황을 불러오지 못했습니다.')
          return
        }
        setRecords((data || []) as ContractRecord[])
      } catch {
        setError('계약 현황을 불러오는 중 오류가 발생했습니다.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, userProfile])

  // 세부 행 가공 — 프로젝트별 차수 병합 → 공사/지도 분리 → 매칭 → 정렬
  const detailRows = useMemo<DetailRow[]>(() => {
    const byProject = new Map<string, ContractRecord[]>()
    for (const r of records) {
      const arr = byProject.get(r.project_id)
      if (arr) arr.push(r)
      else byProject.set(r.project_id, [r])
    }

    const rows: DetailRow[] = []

    for (const projectRecords of byProject.values()) {
      const proj = projectRecords[0].projects
      if (!proj) continue

      // 차수 병합 그룹 (contract_type + '|' + norm(cntrct_nm))
      const groupMap = new Map<string, ContractRecord[]>()
      for (const r of projectRecords) {
        const key = `${r.contract_type}|${norm(r.cntrct_nm)}`
        const arr = groupMap.get(key)
        if (arr) arr.push(r)
        else groupMap.set(key, [r])
      }
      const groups: MergedGroup[] = [...groupMap.values()].map((members) => {
        const repr = members.reduce((a, b) => ((b.cntrct_date || '') > (a.cntrct_date || '') ? b : a))
        const starts = members.map((m) => m.start_date).filter((d): d is string => !!d)
        const ends = members.map((m) => m.end_date).filter((d): d is string => !!d)
        return {
          reprName: repr.cntrct_nm,
          corp: repr.corp_nm || '',
          totAmt: repr.tot_cntrct_amt,
          start: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : '',
          end: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : '',
          cntrctDate: repr.cntrct_date || '',
          contractType: repr.contract_type,
        }
      })

      // 공사 그룹 / 지도 용역 그룹 분리 (그 외 용역은 무시)
      const cnstGroups = groups.filter((g) => g.contractType === '공사')
      const guideGroups = groups.filter(
        (g) =>
          g.contractType === '용역' &&
          (norm(g.reprName).includes('재해예방') || norm(g.reprName).includes('기술지도'))
      )

      // 매칭 — cnst별로 norm(guide명)이 norm(공사명)으로 시작하는 guide 탐색. 한 guide는 한 cnst에만
      const usedGuides = new Set<MergedGroup>()
      const cnstToGuide = new Map<MergedGroup, MergedGroup | null>()
      for (const cnst of cnstGroups) {
        const cnstNorm = norm(cnst.reprName)
        let found: MergedGroup | null = null
        for (const g of guideGroups) {
          if (usedGuides.has(g)) continue
          if (norm(g.reprName).startsWith(cnstNorm)) {
            found = g
            break
          }
        }
        if (!found && cnstGroups.length === 1 && guideGroups.length === 1 && !usedGuides.has(guideGroups[0])) {
          found = guideGroups[0]
        }
        if (found) usedGuides.add(found)
        cnstToGuide.set(cnst, found)
      }

      const location = extractLocation(proj.site_address)
      const displayOrder = proj.display_order ?? Number.MAX_SAFE_INTEGER

      // cnst 그룹당 1행
      for (const cnst of cnstGroups) {
        const guide = cnstToGuide.get(cnst) || null
        rows.push({
          projectId: proj.id,
          projectName: proj.project_name,
          managingHq: proj.managing_hq,
          managingBranch: proj.managing_branch,
          location,
          corpName: cnst.corp,
          workName: cnst.reprName,
          workStart: cnst.start,
          workEnd: cnst.end,
          workAmt: cnst.totAmt,
          hasWork: true,
          guideName: guide ? guide.reprName : '',
          guideOrgName: guide ? guide.corp : '',
          guideAmt: guide ? guide.totAmt : null,
          guideStart: guide ? guide.start : '',
          guideEnd: guide ? guide.end : '',
          hasGuide: !!guide,
          sortDate: cnst.cntrctDate,
          displayOrder,
        })
      }

      // 매칭 안 된 지도 그룹 — 공사 측 필드 공란, 공사명은 지도 접미어 제거
      for (const g of guideGroups) {
        if (usedGuides.has(g)) continue
        rows.push({
          projectId: proj.id,
          projectName: proj.project_name,
          managingHq: proj.managing_hq,
          managingBranch: proj.managing_branch,
          location,
          corpName: '',
          workName: g.reprName.replace(/\s*재해\s*예방\s*기술\s*지도\s*용?\s*역?\s*$/, ''),
          workStart: '',
          workEnd: '',
          workAmt: null,
          hasWork: false,
          guideName: g.reprName,
          guideOrgName: g.corp,
          guideAmt: g.totAmt,
          guideStart: g.start,
          guideEnd: g.end,
          hasGuide: true,
          sortDate: g.cntrctDate,
          displayOrder,
        })
      }
    }

    // 정렬: 본부 → 지사 → display_order → 사업명 → 공사 체결일 (엑셀 출력 순서)
    rows.sort((a, b) => {
      const hi = hqIndex(a.managingHq) - hqIndex(b.managingHq)
      if (hi !== 0) return hi
      const arr = BRANCH_OPTIONS[a.managingHq] || []
      const ai = arr.indexOf(a.managingBranch)
      const bi = arr.indexOf(b.managingBranch)
      const aIdx = ai === -1 ? Infinity : ai
      const bIdx = bi === -1 ? Infinity : bi
      if (aIdx !== bIdx) return aIdx - bIdx
      if (aIdx === Infinity) {
        const bc = a.managingBranch.localeCompare(b.managingBranch, 'ko')
        if (bc !== 0) return bc
      }
      if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder
      const pn = a.projectName.localeCompare(b.projectName, 'ko')
      if (pn !== 0) return pn
      return (a.sortDate || '').localeCompare(b.sortDate || '')
    })

    return rows
  }, [records])

  const totalWorkCount = useMemo(() => detailRows.filter((r) => r.hasWork).length, [detailRows])
  const totalGuideCount = useMemo(() => detailRows.filter((r) => r.hasGuide).length, [detailRows])

  // 지사별 통계 (세부 행 기준)
  const branchStats = useMemo(() => {
    const stats = new Map<string, AggStats>()
    detailRows.forEach((r) => {
      const existing = stats.get(r.managingBranch) || emptyStats()
      existing.projectIds.add(r.projectId)
      if (r.hasWork) existing.workCount += 1
      if (r.hasGuide) {
        existing.guideCount += 1
        existing.guideAmt += r.guideAmt || 0
      }
      stats.set(r.managingBranch, existing)
    })
    return stats
  }, [detailRows])

  // 사업별 통계 (지사 선택 시)
  const projectList = useMemo(() => {
    if (!selectedBranchForDetail) return []
    const byProject = new Map<string, { project_id: string; project_name: string; workCount: number; guideCount: number; guideAmt: number }>()
    detailRows
      .filter((r) => r.managingBranch === selectedBranchForDetail)
      .forEach((r) => {
        const existing = byProject.get(r.projectId) || {
          project_id: r.projectId,
          project_name: r.projectName,
          workCount: 0,
          guideCount: 0,
          guideAmt: 0,
        }
        if (r.hasWork) existing.workCount += 1
        if (r.hasGuide) {
          existing.guideCount += 1
          existing.guideAmt += r.guideAmt || 0
        }
        byProject.set(r.projectId, existing)
      })
    return [...byProject.values()].sort((a, b) => b.workCount - a.workCount || a.project_name.localeCompare(b.project_name, 'ko'))
  }, [detailRows, selectedBranchForDetail])

  const handleBack = () => {
    if (viewLevel === 'project') {
      setViewLevel('branch')
      setSelectedBranchForDetail(null)
    } else {
      onBack()
    }
  }

  const handleBranchClick = (branch: string) => {
    setSelectedBranchForDetail(branch)
    setViewLevel('project')
  }

  // 세부 내용 전체를 관공서 양식으로 다운로드
  const handleExport = async () => {
    if (detailRows.length === 0) return
    setExporting(true)
    try {
      const excelRows: DisasterPreventionExcelRow[] = detailRows.map((r) => ({
        hqName: hqDisplay(r.managingHq),
        branchName: r.managingBranch,
        corpName: r.corpName,
        workName: r.workName,
        location: r.location,
        workStart: r.workStart,
        workEnd: r.workEnd,
        workAmt: r.workAmt,
        guideName: r.guideName,
        guideOrgName: r.guideOrgName,
        guideAmt: r.guideAmt,
        guideStart: r.guideStart,
        guideEnd: r.guideEnd,
      }))
      await downloadDisasterPreventionContractExcel(excelRows)
    } catch {
      alert('엑셀 다운로드 중 오류가 발생했습니다.')
    } finally {
      setExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[300px]">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={handleBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="뒤로가기"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            재해예방기술지도 계약현황
            {viewLevel === 'project' && selectedBranchForDetail && (
              <span className="text-sm font-normal text-gray-500 ml-2">- {selectedBranchForDetail}</span>
            )}
          </h2>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden sm:inline text-sm text-gray-500">
            공사 {totalWorkCount.toLocaleString()}건 · 기술지도 {totalGuideCount.toLocaleString()}건
          </span>
          <button
            onClick={handleExport}
            disabled={detailRows.length === 0 || exporting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            <span className="hidden sm:inline">엑셀 다운로드</span>
            <span className="sm:hidden">엑셀</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-white rounded-lg border border-gray-200 py-8 text-center text-sm text-red-600">{error}</div>
      )}

      {/* 지사별 테이블 */}
      {!error && viewLevel === 'branch' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">지사별 재해예방기술지도 계약현황</span>
              </div>
              <span className="text-sm text-emerald-600 font-semibold">공사 {totalWorkCount.toLocaleString()}건</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">지사명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">사업수</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">공사 계약</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">기술지도 계약</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">기술지도 계약금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                {(() => {
                  const subtotal = Array.from(branchStats.values()).reduce(
                    (acc, curr) => ({
                      projectCount: acc.projectCount + curr.projectIds.size,
                      workCount: acc.workCount + curr.workCount,
                      guideCount: acc.guideCount + curr.guideCount,
                      guideAmt: acc.guideAmt + curr.guideAmt,
                    }),
                    { projectCount: 0, workCount: 0, guideCount: 0, guideAmt: 0 }
                  )
                  return (
                    <tr className="bg-emerald-50/70 font-semibold border-b-2 border-emerald-200">
                      <td className="px-3 py-2 text-sm text-center text-emerald-800">소계</td>
                      <td className="px-3 py-2 text-sm text-center text-emerald-800">{subtotal.projectCount}개</td>
                      <td className="px-3 py-2 text-sm text-center text-emerald-800">{subtotal.workCount > 0 ? `${subtotal.workCount.toLocaleString()}건` : '-'}</td>
                      <td className="px-3 py-2 text-sm text-center text-emerald-800">{subtotal.guideCount > 0 ? `${subtotal.guideCount.toLocaleString()}건` : '-'}</td>
                      <td className="px-3 py-2 text-sm text-center text-emerald-800">
                        {subtotal.guideAmt > 0 ? (
                          <>
                            {Math.round(subtotal.guideAmt / 1000000).toLocaleString('ko-KR')}
                            <span className="ml-0.5 text-[10px] text-gray-600">백만원</span>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                    </tr>
                  )
                })()}
                {/* detailRows가 지사 목록(BRANCH_OPTIONS) 순으로 정렬돼 있어 Map 삽입 순서가 곧 지사 순서 */}
                {Array.from(branchStats.entries())
                  .map(([branch, stats]) => (
                    <tr key={branch} onClick={() => handleBranchClick(branch)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                      <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">{branch}</td>
                      <td className="px-3 py-3 text-sm text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          {stats.projectIds.size}개
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm text-center">
                        {stats.workCount > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                            {stats.workCount.toLocaleString()}건
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-center">
                        {stats.guideCount > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                            {stats.guideCount.toLocaleString()}건
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-sm text-center text-gray-700">
                        {stats.guideAmt > 0 ? (
                          <>
                            {Math.round(stats.guideAmt / 1000000).toLocaleString('ko-KR')}
                            <span className="ml-0.5 text-[10px] text-gray-600">백만원</span>
                          </>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                {branchStats.size === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-500">등록된 계약이 없습니다. 각 사업의 계약현황 서류철에서 계약을 등록하면 여기에 집계됩니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 사업별 테이블 */}
      {!error && viewLevel === 'project' && selectedBranchForDetail && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-emerald-50 px-4 py-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-800">{selectedBranchForDetail} - 사업별 재해예방기술지도 계약현황</span>
              </div>
              <span className="text-sm text-emerald-600 font-semibold">공사 {projectList.reduce((s, p) => s + p.workCount, 0).toLocaleString()}건</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">사업명</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">공사 계약</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">기술지도 계약</th>
                  <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">기술지도 계약금액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {/* 소계 */}
                <tr className="bg-emerald-50/70 font-semibold border-b-2 border-emerald-200">
                  <td className="px-3 py-2 text-sm text-center text-emerald-800">소계</td>
                  <td className="px-3 py-2 text-sm text-center text-emerald-800">
                    {projectList.reduce((s, p) => s + p.workCount, 0) > 0 ? `${projectList.reduce((s, p) => s + p.workCount, 0).toLocaleString()}건` : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm text-center text-emerald-800">
                    {projectList.reduce((s, p) => s + p.guideCount, 0) > 0 ? `${projectList.reduce((s, p) => s + p.guideCount, 0).toLocaleString()}건` : '-'}
                  </td>
                  <td className="px-3 py-2 text-sm text-center text-emerald-800">
                    {projectList.reduce((s, p) => s + p.guideAmt, 0) > 0 ? (
                      <>
                        {Math.round(projectList.reduce((s, p) => s + p.guideAmt, 0) / 1000).toLocaleString('ko-KR')}
                        <span className="ml-0.5 text-[10px] text-gray-600">천원</span>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
                {projectList.map((p) => (
                  <tr key={p.project_id} onClick={() => onRowClickProject(p.project_id, selectedBranchForDetail)} className="hover:bg-emerald-50/50 cursor-pointer transition-colors">
                    <td className="px-3 py-3 text-sm font-medium text-gray-900 text-center">
                      <span className="sm:hidden" title={p.project_name}>
                        {p.project_name.length > 3 ? `${p.project_name.slice(0, 3)}...` : p.project_name}
                      </span>
                      <span className="hidden sm:inline">{p.project_name}</span>
                    </td>
                    <td className="px-3 py-3 text-sm text-center">
                      {p.workCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          {p.workCount.toLocaleString()}건
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-center">
                      {p.guideCount > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">
                          {p.guideCount.toLocaleString()}건
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-center text-gray-700">
                      {p.guideAmt > 0 ? (
                        <>
                          {Math.round(p.guideAmt / 1000).toLocaleString('ko-KR')}
                          <span className="ml-0.5 text-[10px] text-gray-600">천원</span>
                        </>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                {projectList.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">해당 지사에 등록된 계약이 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default BusinessDisasterPreventionView
