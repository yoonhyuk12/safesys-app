'use client'

// 품질검사 성과 총괄표 탭 (별지 2호) — 실시대장 기반 실적 자동집계·작성·엑셀 출력

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Download, X, Trash2, FileText, Calculator, FileDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignatureModal from '@/components/project/SignatureModal'
import { downloadQualitySummaryExcel } from '@/lib/excel/quality-summary-export'
import {
  QualitySummaryReport,
  QualitySummaryFormData,
  QualityTestRecord,
  SettlementRow,
  QualityPerformanceRow,
  VerificationPerformanceRow,
  createEmptyQualitySummary,
  createEmptySettlementRow,
  createEmptyQualityPerformanceRow,
  createEmptyVerificationPerformanceRow,
  settlementCumulative,
  aggregatePerformanceRows,
} from '@/lib/quality/quality-test-types'

interface QualitySummaryTabProps {
  projectId: string
  userId: string
  projectName: string
  constructionPeriod: string // "YYYY-MM-DD ~ YYYY-MM-DD" (없으면 '')
  currentProgressRate?: string // 현재 공정률(%) — 새 총괄표 기본값
  supervisorBranch?: string // 감독(관할 지사)명 — 확인자 소속 기본값
  supervisorPosition?: string // 감독직급 — 확인자 직위 기본값
  supervisorName?: string // 감독 이름 — 확인자 성명 기본값
  ownerCompanyName?: string // 프로젝트 소유자 회사명 — 작성자 소속 기본값
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const cellInputCls =
  'w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'
const thCls = 'px-1.5 py-1.5 text-center whitespace-nowrap font-medium'

type SignKey = 'writer_signature' | 'reviewer_signature' | 'confirmer_signature'

// 작성자·검토자·확인자 입력 필드 매핑 (별지 2호 기입요령 ③④⑤)
interface SignerField {
  label: string
  roleHint: string
  aff: 'writer_affiliation' | 'reviewer_affiliation' | 'confirmer_affiliation'
  pos: 'writer_position' | 'reviewer_position' | 'confirmer_position'
  name: 'writer_name' | 'reviewer_name' | 'confirmer_name'
  sig: SignKey
}

const SIGNERS: SignerField[] = [
  { label: '작성자', roleHint: '건설업자', aff: 'writer_affiliation', pos: 'writer_position', name: 'writer_name', sig: 'writer_signature' },
  { label: '검토자', roleHint: '품질시험업무담당자', aff: 'reviewer_affiliation', pos: 'reviewer_position', name: 'reviewer_name', sig: 'reviewer_signature' },
  { label: '확인자', roleHint: '감독소장', aff: 'confirmer_affiliation', pos: 'confirmer_position', name: 'confirmer_name', sig: 'confirmer_signature' },
]

export default function QualitySummaryTab({
  projectId,
  userId,
  projectName,
  constructionPeriod,
  currentProgressRate = '',
  supervisorBranch = '',
  supervisorPosition = '',
  supervisorName = '',
  ownerCompanyName = '',
}: QualitySummaryTabProps) {
  const [reports, setReports] = useState<QualitySummaryReport[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<QualitySummaryFormData | null>(null)
  const [editingReportId, setEditingReportId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [aggregating, setAggregating] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [activeSignKey, setActiveSignKey] = useState<SignKey | null>(null)

  const loadReports = useCallback(async () => {
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('quality_summary_reports')
      .select('*')
      .eq('project_id', projectId)
      .order('report_date', { ascending: false })
    if (!error && data) setReports(data as QualitySummaryReport[])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    loadReports()
  }, [loadReports])

  const resetForm = () => {
    setShowForm(false)
    setFormData(null)
    setEditingReportId(null)
  }

  const handleAddClick = () => {
    setEditingReportId(null)
    setFormData(
      createEmptyQualitySummary({
        construction_period: constructionPeriod,
        progress_rate: currentProgressRate,
        writer_affiliation: ownerCompanyName,
        writer_position: '품질관리자',
        confirmer_affiliation: supervisorBranch,
        confirmer_position: supervisorPosition,
        confirmer_name: supervisorName,
      })
    )
    setShowForm(true)
  }

  const handleSelectReport = (report: QualitySummaryReport) => {
    const { id, project_id, created_by, created_at, updated_at, ...fields } = report
    void id; void project_id; void created_by; void created_at; void updated_at
    setFormData({
      ...createEmptyQualitySummary(),
      ...fields,
      settlement_rows: Array.isArray(fields.settlement_rows) && fields.settlement_rows.length > 0
        ? fields.settlement_rows
        : [createEmptySettlementRow()],
      quality_rows: Array.isArray(fields.quality_rows) && fields.quality_rows.length > 0
        ? fields.quality_rows
        : [createEmptyQualityPerformanceRow()],
      verification_rows: Array.isArray(fields.verification_rows) && fields.verification_rows.length > 0
        ? fields.verification_rows
        : [createEmptyVerificationPerformanceRow()],
    })
    setEditingReportId(report.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData) return

    // RLS상 수정은 작성자 본인만 가능 — 사전에 명확히 안내
    if (editingReportId) {
      const editingReport = reports.find((r) => r.id === editingReportId)
      if (editingReport && editingReport.created_by !== userId) {
        alert('작성자 본인만 수정할 수 있습니다.')
        return
      }
    }

    setSaving(true)
    try {
      const dataToSave = {
        ...formData,
        project_id: projectId,
        created_by: userId,
        updated_at: new Date().toISOString(),
      }
      if (editingReportId) {
        const { error } = await (supabase as any)
          .from('quality_summary_reports')
          .update(dataToSave)
          .eq('id', editingReportId)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from('quality_summary_reports').insert([dataToSave])
        if (error) throw error
      }
      resetForm()
      loadReports()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('저장 실패: ' + message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (report: QualitySummaryReport) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await (supabase as any).from('quality_summary_reports').delete().eq('id', report.id)
    if (!error) {
      if (editingReportId === report.id) resetForm()
      loadReports()
    } else {
      alert('삭제 실패: ' + error.message)
    }
  }

  const handleDownload = async (report: QualitySummaryFormData, id: string) => {
    setDownloadingId(id)
    try {
      await downloadQualitySummaryExcel(report, projectName)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('엑셀 생성 실패: ' + message)
    } finally {
      setDownloadingId(null)
    }
  }

  // 실시대장 레코드에서 ④·⑤ 실적 자동집계 (계획·비고·확인시험구분 입력값은 보존)
  const handleAggregate = async () => {
    if (!formData) return
    setAggregating(true)
    try {
      const { data, error } = await (supabase as any)
        .from('quality_test_records')
        .select('*')
        .eq('project_id', projectId)
      if (error) throw error
      const records = (data ?? []) as QualityTestRecord[]
      if (records.length === 0) {
        alert('집계할 실시대장 기록이 없습니다. 실시대장 탭에서 먼저 기록을 등록해주세요.')
        return
      }
      const { quality_rows, verification_rows } = aggregatePerformanceRows(
        records,
        formData.quality_rows,
        formData.verification_rows
      )
      setFormData({
        ...formData,
        quality_rows: quality_rows.length > 0 ? quality_rows : [createEmptyQualityPerformanceRow()],
        verification_rows:
          verification_rows.length > 0 ? verification_rows : [createEmptyVerificationPerformanceRow()],
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('자동집계 실패: ' + message)
    } finally {
      setAggregating(false)
    }
  }

  const set = <K extends keyof QualitySummaryFormData>(key: K, value: QualitySummaryFormData[K]) => {
    if (formData) setFormData({ ...formData, [key]: value })
  }

  const updateSettlementRow = (index: number, key: keyof SettlementRow, value: string) => {
    if (!formData) return
    set(
      'settlement_rows',
      formData.settlement_rows.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    )
  }

  const updateQualityRow = (index: number, key: keyof QualityPerformanceRow, value: string) => {
    if (!formData) return
    set(
      'quality_rows',
      formData.quality_rows.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    )
  }

  const updateVerificationRow = (index: number, key: keyof VerificationPerformanceRow, value: string) => {
    if (!formData) return
    set(
      'verification_rows',
      formData.verification_rows.map((row, i) => (i === index ? { ...row, [key]: value } : row))
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 목록 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between gap-2">
          <h2 className="font-semibold text-sm sm:text-base truncate">품질검사 성과 총괄표 (별지 2호)</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="https://drive.google.com/uc?export=download&id=1ouCLwgy7LwJCAJ4MTM9Frig1bN5oSoFR"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium"
              title="품질검사 성과 총괄표 HWP 양식 다운로드"
            >
              <FileDown className="h-4 w-4" />
              HWP 양식
            </a>
            <button
              onClick={handleAddClick}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              추가
            </button>
          </div>
        </div>

        {reports.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              작성된 총괄표가 없습니다. 추가 버튼으로 작성하고, 실적은 실시대장에서 자동집계할 수 있습니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="px-2 py-2 text-center whitespace-nowrap">작성일</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">공정(%)</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">작성자</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">엑셀</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">삭제</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr
                    key={report.id}
                    onClick={() => handleSelectReport(report)}
                    className={`border-t border-gray-100 cursor-pointer hover:bg-amber-50 ${
                      editingReportId === report.id ? 'bg-amber-50' : ''
                    }`}
                  >
                    <td className="px-2 py-2 text-center whitespace-nowrap">{report.report_date || '-'}</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">{report.progress_rate || '-'}</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">{report.writer_name || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownload(report, report.id)
                        }}
                        disabled={downloadingId === report.id}
                        className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                        title="엑셀 다운로드"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </td>
                    <td className="px-2 py-2 text-center">
                      {report.created_by === userId && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDelete(report)
                          }}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="삭제"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 작성/수정 폼 */}
      {showForm && formData && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-sm sm:text-base truncate">
              성과 총괄표 {editingReportId ? '수정' : '작성'}
            </h2>
            <button onClick={resetForm} className="text-white hover:text-amber-200 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-3 sm:p-4 space-y-5">
            {/* 기본 정보 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>작성일시</label>
                <input
                  type="date"
                  value={formData.report_date || ''}
                  onChange={(e) => set('report_date', e.target.value || null)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>공사기간</label>
                <input
                  type="text"
                  value={formData.construction_period}
                  onChange={(e) => set('construction_period', e.target.value)}
                  placeholder="2026-01-01 ~ 2026-12-31"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>공정 (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.progress_rate}
                  onChange={(e) => set('progress_rate', e.target.value)}
                  placeholder="예: 45"
                  className={inputCls}
                />
              </div>
            </div>

            {/* 3. 기성 또는 정산량 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold text-gray-700">3. 기성 또는 정산량</h3>
                <button
                  type="button"
                  onClick={() => set('settlement_rows', [...formData.settlement_rows, createEmptySettlementRow()])}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  행 추가
                </button>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className={thCls}>공종</th>
                      <th className={thCls}>계획량(㎥)</th>
                      <th className={thCls}>전회까지</th>
                      <th className={thCls}>금회</th>
                      <th className={thCls}>누계</th>
                      <th className={thCls}>비고</th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.settlement_rows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-1 min-w-[90px]">
                          <input value={row.work_type} onChange={(e) => updateSettlementRow(i, 'work_type', e.target.value)} className={cellInputCls} />
                        </td>
                        <td className="p-1 min-w-[70px]">
                          <input value={row.plan_qty} onChange={(e) => updateSettlementRow(i, 'plan_qty', e.target.value)} inputMode="decimal" className={cellInputCls} />
                        </td>
                        <td className="p-1 min-w-[70px]">
                          <input value={row.prev_qty} onChange={(e) => updateSettlementRow(i, 'prev_qty', e.target.value)} inputMode="decimal" className={cellInputCls} />
                        </td>
                        <td className="p-1 min-w-[70px]">
                          <input value={row.current_qty} onChange={(e) => updateSettlementRow(i, 'current_qty', e.target.value)} inputMode="decimal" className={cellInputCls} />
                        </td>
                        <td className="p-1 min-w-[60px] text-center text-gray-600">{settlementCumulative(row)}</td>
                        <td className="p-1 min-w-[80px]">
                          <input value={row.note} onChange={(e) => updateSettlementRow(i, 'note', e.target.value)} className={cellInputCls} />
                        </td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => set('settlement_rows', formData.settlement_rows.filter((_, idx) => idx !== i))}
                            className="p-0.5 text-gray-400 hover:text-red-600"
                            title="행 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4·5 실적 — 자동집계 */}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                ④·⑤ 실적은 실시대장 기록에서 자동집계할 수 있습니다 (계획·비고는 직접 입력).
              </p>
              <button
                type="button"
                onClick={handleAggregate}
                disabled={aggregating}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
              >
                <Calculator className="h-3.5 w-3.5" />
                {aggregating ? '집계 중...' : '실시대장에서 자동집계'}
              </button>
            </div>

            {/* 4. 품질검사 종류 및 실적 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold text-gray-700">4. 품질검사 종류 및 실적</h3>
                <button
                  type="button"
                  onClick={() => set('quality_rows', [...formData.quality_rows, createEmptyQualityPerformanceRow()])}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  행 추가
                </button>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className={thCls}>공종</th>
                      <th className={thCls}>시험·검사 종류(재료)</th>
                      <th className={thCls}>계획</th>
                      <th className={thCls}>실시</th>
                      <th className={thCls}>합격</th>
                      <th className={thCls}>불합격</th>
                      <th className={thCls}>재시험</th>
                      <th className={thCls}>비고</th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.quality_rows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-1 min-w-[90px]">
                          <input value={row.work_type} onChange={(e) => updateQualityRow(i, 'work_type', e.target.value)} className={cellInputCls} />
                        </td>
                        <td className="p-1 min-w-[110px]">
                          <input value={row.test_item} onChange={(e) => updateQualityRow(i, 'test_item', e.target.value)} className={cellInputCls} />
                        </td>
                        {(['plan', 'done', 'pass', 'fail', 'retest'] as const).map((key) => (
                          <td key={key} className="p-1 min-w-[48px]">
                            <input value={row[key]} onChange={(e) => updateQualityRow(i, key, e.target.value)} inputMode="numeric" className={`${cellInputCls} text-center`} />
                          </td>
                        ))}
                        <td className="p-1 min-w-[80px]">
                          <input value={row.note} onChange={(e) => updateQualityRow(i, 'note', e.target.value)} className={cellInputCls} />
                        </td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => set('quality_rows', formData.quality_rows.filter((_, idx) => idx !== i))}
                            className="p-0.5 text-gray-400 hover:text-red-600"
                            title="행 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 5. 확인시험 종류 및 실적 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="text-sm font-semibold text-gray-700">5. 확인시험 종류 및 실적</h3>
                <button
                  type="button"
                  onClick={() =>
                    set('verification_rows', [...formData.verification_rows, createEmptyVerificationPerformanceRow()])
                  }
                  className="flex items-center gap-1 px-2 py-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded hover:bg-amber-100"
                >
                  <Plus className="h-3.5 w-3.5" />
                  행 추가
                </button>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-600">
                      <th className={thCls}>공종</th>
                      <th className={thCls}>시험·검사 종류(재료)</th>
                      <th className={thCls}>확인시험구분</th>
                      <th className={thCls}>계획</th>
                      <th className={thCls}>실시</th>
                      <th className={thCls}>합격</th>
                      <th className={thCls}>불합격</th>
                      <th className={thCls}>재시험</th>
                      <th className={thCls}>비고</th>
                      <th className={thCls}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.verification_rows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="p-1 min-w-[90px]">
                          <input value={row.work_type} onChange={(e) => updateVerificationRow(i, 'work_type', e.target.value)} className={cellInputCls} />
                        </td>
                        <td className="p-1 min-w-[110px]">
                          <input value={row.test_item} onChange={(e) => updateVerificationRow(i, 'test_item', e.target.value)} className={cellInputCls} />
                        </td>
                        <td className="p-1 min-w-[90px]">
                          <input value={row.verification_type} onChange={(e) => updateVerificationRow(i, 'verification_type', e.target.value)} className={cellInputCls} />
                        </td>
                        {(['plan', 'done', 'pass', 'fail', 'retest'] as const).map((key) => (
                          <td key={key} className="p-1 min-w-[48px]">
                            <input value={row[key]} onChange={(e) => updateVerificationRow(i, key, e.target.value)} inputMode="numeric" className={`${cellInputCls} text-center`} />
                          </td>
                        ))}
                        <td className="p-1 min-w-[80px]">
                          <input value={row.note} onChange={(e) => updateVerificationRow(i, 'note', e.target.value)} className={cellInputCls} />
                        </td>
                        <td className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              set('verification_rows', formData.verification_rows.filter((_, idx) => idx !== i))
                            }
                            className="p-0.5 text-gray-400 hover:text-red-600"
                            title="행 삭제"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 작성자·검토자·확인자 */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1.5">작성자·검토자·확인자</h3>
              <div className="space-y-2">
                {SIGNERS.map((signer) => {
                  const affKey = signer.aff
                  const posKey = signer.pos
                  const nameKey = signer.name
                  return (
                    <div key={signer.sig} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                      <div className="text-xs font-medium text-gray-600 pb-2">
                        {signer.label}
                        <span className="block text-[10px] text-gray-400">({signer.roleHint})</span>
                      </div>
                      <input
                        type="text"
                        value={formData[affKey] as string}
                        onChange={(e) => set(affKey, e.target.value)}
                        placeholder="소속"
                        className={inputCls}
                      />
                      <input
                        type="text"
                        value={formData[posKey] as string}
                        onChange={(e) => set(posKey, e.target.value)}
                        placeholder="직위"
                        className={inputCls}
                      />
                      <input
                        type="text"
                        value={formData[nameKey] as string}
                        onChange={(e) => set(nameKey, e.target.value)}
                        placeholder="성명"
                        className={inputCls}
                      />
                      <div>
                        {formData[signer.sig] ? (
                          <button type="button" onClick={() => setActiveSignKey(signer.sig)} title="다시 서명">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={formData[signer.sig]}
                              alt={`${signer.label} 서명`}
                              className="h-9 border rounded cursor-pointer hover:opacity-80"
                            />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveSignKey(signer.sig)}
                            className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                          >
                            서명
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {editingReportId && (
                <button
                  onClick={() => handleDownload(formData, editingReportId)}
                  disabled={downloadingId === editingReportId}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 disabled:opacity-50"
                  title="성과 총괄표 엑셀 다운로드"
                >
                  <Download className="h-4 w-4" />
                  엑셀
                </button>
              )}
              <button
                onClick={resetForm}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2 text-sm text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {saving ? '저장 중...' : editingReportId ? '수정' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={activeSignKey !== null}
        onClose={() => setActiveSignKey(null)}
        onSave={(signatureData) => {
          if (activeSignKey) set(activeSignKey, signatureData)
          setActiveSignKey(null)
        }}
      />
    </div>
  )
}
