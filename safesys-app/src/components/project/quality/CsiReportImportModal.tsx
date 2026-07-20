'use client'

// CSI(건설공사 안전관리 종합정보망) 품질검사 성적서 조회·가져오기 모달 — 실시대장 등록 폼 프리필용
import React, { useState } from 'react'
import { X, Search, FlaskConical, ArrowRight } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { CsiQualityReport, CsiQualityReportsResponse } from '@/lib/quality/csi-report-types'

interface CsiReportImportModalProps {
  projectName: string
  onClose: () => void
  onImport: (report: CsiQualityReport) => void
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const toDateInputValue = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

// 조회 기간 프리셋 — CSI 응답 시간이 발급일자 범위에 비례해 길어지므로 범위 선택을 빠르게 돕는다
const RANGE_PRESETS = [
  { label: '3개월', months: 3 },
  { label: '6개월', months: 6 },
  { label: '1년', months: 12 },
  { label: '2년', months: 24 },
]

const presetStartValue = (months: number) => {
  const d = new Date()
  d.setMonth(d.getMonth() - months)
  return toDateInputValue(d)
}

// CSI에 등록된 공사명은 우리 프로젝트명과 띄어쓰기가 달라(예: '점동지구다목적농촌용수개발사업토목공사')
// 전체 이름으로 부분일치를 걸면 0건이 된다. 첫 낱말만 기본값으로 넣고 나머지는 사용자가 조정한다.
const defaultSearchTerm = (projectName: string) => projectName.trim().split(/\s+/)[0] || ''

export default function CsiReportImportModal({
  projectName,
  onClose,
  onImport,
}: CsiReportImportModalProps) {
  // 필수 파라미터가 성적서 발급일자 범위라 기본값은 최근 3개월
  const [startDate, setStartDate] = useState(() => presetStartValue(3))
  const [endDate, setEndDate] = useState(() => toDateInputValue(new Date()))
  const todayValue = toDateInputValue(new Date())
  const [constNm, setConstNm] = useState(() => defaultSearchTerm(projectName))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)
  const [reports, setReports] = useState<CsiQualityReport[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [fetchedRowCount, setFetchedRowCount] = useState(0)

  const handleSearch = async () => {
    if (!startDate || !endDate) {
      setError('발급일자 시작일과 종료일을 입력해주세요.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        st: startDate.replace(/-/g, ''),
        end: endDate.replace(/-/g, ''),
      })
      if (constNm.trim()) params.set('constNm', constNm.trim())
      const res = await fetch(`/api/csi/quality-reports?${params.toString()}`)
      const json = (await res.json()) as CsiQualityReportsResponse
      if (!json.success || !json.data) {
        throw new Error(json.error || '조회에 실패했습니다.')
      }
      setReports(json.data.reports)
      setTotalCount(json.data.totalCount)
      setFetchedRowCount(json.data.fetchedRowCount)
      setSearched(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 bg-amber-600 px-4 py-3 text-white">
          <h3 className="text-sm font-semibold sm:text-base">CSI 품질검사 성적서 불러오기</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-white/10"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
          <p className="text-xs text-gray-500">
            건설공사 안전관리 종합정보망(csi.go.kr)의 [발급완료] 품질검사 성적서를 발급일자
            기준으로 조회합니다. 가져오면 실시대장 등록 폼에 자동 입력됩니다.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-gray-600">조회 기간</span>
            {RANGE_PRESETS.map(({ label, months }) => {
              const active = startDate === presetStartValue(months) && endDate === todayValue
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setStartDate(presetStartValue(months))
                    setEndDate(todayValue)
                  }}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    active
                      ? 'border-amber-600 bg-amber-600 text-white'
                      : 'border-gray-300 bg-white text-gray-600 hover:border-amber-400 hover:text-amber-700'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
            <div>
              <label className={labelCls}>발급일자 시작 *</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>발급일자 종료 *</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className={labelCls}>공사명 (부분일치)</label>
              <input
                type="text"
                value={constNm}
                onChange={(e) => setConstNm(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSearch()
                }}
                placeholder="비우면 기관 전체 조회"
                className={inputCls}
              />
            </div>
            <div className="col-span-2 flex items-end sm:col-span-1">
              <button
                type="button"
                onClick={handleSearch}
                disabled={loading}
                className="flex w-full items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
              >
                <Search className="h-4 w-4" />
                조회
              </button>
            </div>
          </div>
          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center gap-2 py-10">
              <LoadingSpinner />
              <p className="text-xs text-gray-400">
                조회 기간이 길면 응답에 1~2분가량 걸릴 수 있습니다.
              </p>
            </div>
          ) : !searched ? (
            <p className="py-10 text-center text-sm text-gray-400">
              조회 버튼을 눌러 성적서를 검색해주세요.
            </p>
          ) : reports.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500">
              조회된 성적서가 없습니다. 발급일자 범위를 넓히거나 공사명을 비우고 다시
              조회해보세요.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">
                성적서 {reports.length}건
                {totalCount > fetchedRowCount &&
                  ` — 전체 ${totalCount}행 중 ${fetchedRowCount}행만 표시됨. 발급일자 범위를 좁혀 다시 조회해주세요.`}
              </p>
              {reports.map((report, index) => (
                <div
                  key={`${report.issueNo || report.rqstNo}-${index}`}
                  className="rounded-lg border border-gray-200 p-3 hover:border-amber-300 hover:bg-amber-50/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                          <FlaskConical className="h-3 w-3" />
                          {report.issueNo || '성적서번호 없음'}
                        </span>
                        <span className="text-xs text-gray-500">발급 {report.issueYmd || '-'}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-gray-900">
                        {report.sampleNm || '시료명 없음'}
                        <span className="ml-2 font-normal text-gray-500">
                          {report.companyNm || report.labNm}
                        </span>
                      </p>
                      {report.constNm && (
                        <p className="truncate text-xs text-gray-500">{report.constNm}</p>
                      )}
                      <p className="mt-1 truncate text-xs text-gray-600">
                        시험항목 {report.items.length}건 —{' '}
                        {Array.from(
                          new Set(report.items.map((it) => it.teNm || it.tsNm).filter(Boolean))
                        ).join(', ') || '항목 정보 없음'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onImport(report)}
                      className="flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
                    >
                      가져오기
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
