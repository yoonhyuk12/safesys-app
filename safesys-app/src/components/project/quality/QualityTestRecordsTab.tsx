'use client'

// 품질검사 실시대장 탭 (별지 제42호서식) — 대장 행 목록·작성·수정·삭제·엑셀 출력
// 한 제출건(일련번호)에 시험·검사 종목~건설사업관리기술인 확인 항목을 여러 건 등록할 수 있다.

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Printer, X, Trash2, FileText, FileDown, Upload, Image as ImageIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignatureModal from '@/components/project/SignatureModal'
import { downloadQualityTestLedgerExcel } from '@/lib/excel/quality-test-ledger-export'
import { downloadQualityTestPhotoReport } from '@/lib/reports/quality-test-photo-report'
import {
  QualityTestRecord,
  QualityTestItemFields,
  QualityTestCommonFields,
  TestVerdict,
  TEST_CATEGORY_OPTIONS,
  createEmptyQualityTestItem,
  createEmptyQualityTestCommon,
  createEmptyQualitySummary,
} from '@/lib/quality/quality-test-types'

interface QualityTestRecordsTabProps {
  projectId: string
  userId: string
  projectName: string
  supervisorName?: string
  constructionPeriod?: string // 새 총괄표 자동 생성용 공사기간
  currentProgressRate?: string // 새 총괄표 자동 생성용 현재 공정률(%)
  ownerCompanyName?: string // 새 총괄표 작성자 소속 기본값
  supervisorBranch?: string // 새 총괄표 확인자 소속 기본값
  supervisorPosition?: string // 새 총괄표 확인자 직위 기본값
  onOpenSummary: (summaryId: string) => void // 총괄표 헤더 클릭 시 총괄표 탭 열기
}

// 실시대장 폼에서 고를 수 있는 소속 총괄표 옵션
interface SummaryOption {
  id: string
  report_date: string | null
  writer_name: string | null
  created_at: string
}

type SignatureField = 'quality_engineer_signature' | 'supervision_engineer_signature'
type FormItem = QualityTestItemFields & { _key: string; _id?: string }

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const VERDICT_OPTIONS: TestVerdict[] = ['합격', '불합격', '재시험']

export default function QualityTestRecordsTab({
  projectId,
  userId,
  projectName,
  supervisorName = '',
  constructionPeriod = '',
  currentProgressRate = '',
  ownerCompanyName = '',
  supervisorBranch = '',
  supervisorPosition = '',
  onOpenSummary,
}: QualityTestRecordsTabProps) {
  const [records, setRecords] = useState<QualityTestRecord[]>([])
  const [summaries, setSummaries] = useState<SummaryOption[]>([])
  const [selectedSummaryId, setSelectedSummaryId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [commonData, setCommonData] = useState<QualityTestCommonFields | null>(null)
  const [items, setItems] = useState<FormItem[]>([])
  const [editingSerialNo, setEditingSerialNo] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [ledgerDownloading, setLedgerDownloading] = useState(false)
  const [photoReportDownloading, setPhotoReportDownloading] = useState(false)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [activeSign, setActiveSign] = useState<{ itemKey: string; field: SignatureField } | null>(null)
  const nextKeyRef = useRef(0)
  const newKey = () => String(nextKeyRef.current++)

  // 같은 일련번호(제출건)의 항목들이 항상 붙어 보이도록 일련번호 오름차순으로 로드
  // (test_date로 정렬하면 기존 제출건에 항목을 나중에 추가할 때 created_at이 최신이라 그룹이 흩어짐)
  const loadRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('quality_test_records')
      .select('*')
      .eq('project_id', projectId)
      .order('serial_no', { ascending: true })
      .order('created_at', { ascending: true })
    if (!error && data) setRecords(data as QualityTestRecord[])
    setLoading(false)
  }, [projectId])

  // 소속 총괄표 목록 — 생성순(created_at 오름차순)으로 로드, 마지막이 최신 총괄표
  const loadSummaries = useCallback(async () => {
    const { data, error } = await (supabase as any)
      .from('quality_summary_reports')
      .select('id, report_date, writer_name, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (!error && data) setSummaries(data as SummaryOption[])
  }, [projectId])

  useEffect(() => {
    loadRecords()
    loadSummaries()
  }, [loadRecords, loadSummaries])

  const computeNextSerialNo = () => records.reduce((max, r) => Math.max(max, r.serial_no || 0), 0) + 1

  const resetForm = () => {
    setShowForm(false)
    setCommonData(null)
    setItems([])
    setEditingSerialNo(null)
    setSelectedSummaryId('')
  }

  const handleAddClick = () => {
    // 직전 제출건의 기술인 성명·서명을 기본값으로 이어받아 반복 입력을 줄인다.
    // 건설사업관리기술인 성명은 프로젝트 감독자 이름을 우선 기본값으로 사용한다.
    const last = records[records.length - 1]
    const supervisionName = supervisorName || last?.supervision_engineer_name || ''
    const supervisionSignature =
      last && last.supervision_engineer_name === supervisionName ? last.supervision_engineer_signature : ''

    // 총괄표가 없으면 저장 시 조용히 자동 생성('new'), 있으면 최신 총괄표를 기본 선택
    setSelectedSummaryId(summaries.length === 0 ? 'new' : summaries[summaries.length - 1].id)
    setEditingSerialNo(null)
    setCommonData(createEmptyQualityTestCommon())
    setItems([
      {
        ...createEmptyQualityTestItem({
          quality_engineer_name: last?.quality_engineer_name || '',
          quality_engineer_signature: last?.quality_engineer_signature || '',
          supervision_engineer_name: supervisionName,
          supervision_engineer_signature: supervisionSignature,
        }),
        _key: newKey(),
      },
    ])
    setShowForm(true)
  }

  const handleAddItem = () => {
    const last = items[items.length - 1]
    setItems((prev) => [
      ...prev,
      {
        ...createEmptyQualityTestItem({
          quality_engineer_name: last?.quality_engineer_name || '',
          quality_engineer_signature: last?.quality_engineer_signature || '',
          supervision_engineer_name: last?.supervision_engineer_name || supervisorName || '',
          supervision_engineer_signature: last?.supervision_engineer_signature || '',
        }),
        _key: newKey(),
      },
    ])
  }

  const handleRemoveItem = (itemKey: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((it) => it._key !== itemKey)))
  }

  const handleSelectRecord = (record: QualityTestRecord) => {
    const group = records
      .filter((r) => r.serial_no === record.serial_no)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const first = group[0] ?? record

    // 제출건의 현재 소속 총괄표를 기본값으로 — 레거시(미지정) 기록은 ''
    setSelectedSummaryId(first.summary_id ?? '')
    setCommonData({
      test_date: first.test_date,
      test_category: first.test_category,
      work_type: first.work_type,
      target_material: first.target_material,
      supplier_factory: first.supplier_factory,
      test_place: first.test_place,
      photo_url: first.photo_url || '',
      note: first.note,
    })
    setItems(
      group.map((r) => ({
        test_item: r.test_item,
        test_standard: r.test_standard,
        test_result: r.test_result,
        result_verdict: r.result_verdict,
        quality_engineer_name: r.quality_engineer_name,
        quality_engineer_signature: r.quality_engineer_signature,
        supervision_engineer_name: r.supervision_engineer_name,
        supervision_engineer_signature: r.supervision_engineer_signature,
        _id: r.id,
        _key: newKey(),
      }))
    )
    setEditingSerialNo(record.serial_no)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!commonData || items.length === 0) return

    // RLS상 수정은 작성자 본인만 가능 — 사전에 명확히 안내
    if (editingSerialNo !== null) {
      const group = records.filter((r) => r.serial_no === editingSerialNo)
      if (group.some((r) => r.created_by !== userId)) {
        alert('작성자 본인만 수정할 수 있습니다.')
        return
      }
    }

    if (items.some((it) => !it.test_item.trim())) {
      alert('모든 항목에 시험·검사 종목을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const serialNo = editingSerialNo ?? computeNextSerialNo()
      const original = editingSerialNo !== null ? records.filter((r) => r.serial_no === editingSerialNo) : []
      const keptIds = new Set(items.filter((it) => it._id).map((it) => it._id as string))
      const toDelete = original.filter((r) => !keptIds.has(r.id))

      // 소속 총괄표 결정 — 'new'면 총괄표를 먼저 생성, ''면 미지정(NULL)
      let summaryId: string | null = selectedSummaryId === '' ? null : selectedSummaryId
      if (selectedSummaryId === 'new') {
        const { data: created, error: summaryError } = await (supabase as any)
          .from('quality_summary_reports')
          .insert([
            {
              ...createEmptyQualitySummary({
                construction_period: constructionPeriod,
                progress_rate: currentProgressRate,
                writer_affiliation: ownerCompanyName,
                writer_position: '품질관리자',
                confirmer_affiliation: supervisorBranch,
                confirmer_position: supervisorPosition,
                confirmer_name: supervisorName,
              }),
              project_id: projectId,
              created_by: userId,
            },
          ])
          .select('id')
          .single()
        if (summaryError) throw summaryError
        summaryId = (created as { id: string }).id
      }

      for (const it of items) {
        const rowData = {
          ...commonData,
          summary_id: summaryId,
          test_item: it.test_item,
          test_standard: it.test_standard,
          test_result: it.test_result,
          result_verdict: it.result_verdict,
          quality_engineer_name: it.quality_engineer_name,
          quality_engineer_signature: it.quality_engineer_signature,
          supervision_engineer_name: it.supervision_engineer_name,
          supervision_engineer_signature: it.supervision_engineer_signature,
          serial_no: serialNo,
          project_id: projectId,
          updated_at: new Date().toISOString(),
        }
        if (it._id) {
          const { error } = await (supabase as any).from('quality_test_records').update(rowData).eq('id', it._id)
          if (error) throw error
        } else {
          const { error } = await (supabase as any)
            .from('quality_test_records')
            .insert([{ ...rowData, created_by: userId }])
          if (error) throw error
        }
      }

      if (toDelete.length > 0) {
        const { error } = await (supabase as any)
          .from('quality_test_records')
          .delete()
          .in('id', toDelete.map((r) => r.id))
        if (error) throw error
      }

      resetForm()
      loadRecords()
      loadSummaries()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('저장 실패: ' + message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record: QualityTestRecord) => {
    if (!confirm('정말 삭제하시겠습니까? (같은 일련번호의 모든 항목이 함께 삭제됩니다)')) return
    const { error } = await (supabase as any)
      .from('quality_test_records')
      .delete()
      .eq('project_id', projectId)
      .eq('serial_no', record.serial_no)
    if (!error) {
      if (editingSerialNo === record.serial_no) resetForm()
      loadRecords()
    } else {
      alert('삭제 실패: ' + error.message)
    }
  }

  const handleLedgerDownload = async () => {
    setLedgerDownloading(true)
    try {
      await downloadQualityTestLedgerExcel(records, projectName)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('엑셀 생성 실패: ' + message)
    } finally {
      setLedgerDownloading(false)
    }
  }

  const handlePhotoReportDownload = async () => {
    setPhotoReportDownloading(true)
    try {
      await downloadQualityTestPhotoReport(records, projectName)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('사진대지 생성 실패: ' + message)
    } finally {
      setPhotoReportDownloading(false)
    }
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingPhoto(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `${projectId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { data, error } = await supabase.storage.from('quality-test-photos').upload(fileName, file)
      if (error) throw error
      const { data: urlData } = supabase.storage.from('quality-test-photos').getPublicUrl(data.path)
      setCommon('photo_url', urlData.publicUrl)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('사진 업로드 실패: ' + message)
    } finally {
      setUploadingPhoto(false)
      e.target.value = ''
    }
  }

  const handleRemovePhoto = async () => {
    const photoUrl = commonData?.photo_url
    if (!photoUrl) return
    const path = photoUrl.split('/quality-test-photos/')[1]
    if (path) await supabase.storage.from('quality-test-photos').remove([decodeURIComponent(path)])
    setCommon('photo_url', '')
  }

  const setCommon = <K extends keyof QualityTestCommonFields>(key: K, value: QualityTestCommonFields[K]) => {
    setCommonData((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const setItemField = <K extends keyof QualityTestItemFields>(itemKey: string, field: K, value: QualityTestItemFields[K]) => {
    setItems((prev) => prev.map((it) => (it._key === itemKey ? { ...it, [field]: value } : it)))
  }

  // 총괄표 선택 UI 표시/옵션 계산
  const editingGroupSummaryId =
    editingSerialNo !== null
      ? records.find((r) => r.serial_no === editingSerialNo)?.summary_id ?? ''
      : null
  const isLegacyEditing = editingSerialNo !== null && editingGroupSummaryId === ''
  const showSummarySelect =
    editingSerialNo === null ? summaries.length > 0 : summaries.length >= 1 || selectedSummaryId === ''

  // 미지정 그룹 + 총괄표별 그룹 렌더용 — 로드 정렬(일련번호·created_at 오름차순) 유지
  const unassignedRecords = records.filter((r) => !r.summary_id)
  const renderRecordRow = (record: QualityTestRecord, index: number) => (
    <tr
      key={record.id}
      onClick={() => handleSelectRecord(record)}
      className={`border-t border-gray-100 cursor-pointer hover:bg-amber-50 ${
        editingSerialNo === record.serial_no ? 'bg-amber-50' : ''
      }`}
    >
      <td className="px-2 py-2 text-center text-gray-500">{record.serial_no ?? index + 1}</td>
      <td className="px-2 py-2 text-center whitespace-nowrap">{record.test_date || '-'}</td>
      <td className="px-2 py-2 text-center whitespace-nowrap">{record.test_category || '-'}</td>
      <td className="px-2 py-2 text-center whitespace-nowrap">{record.work_type || '-'}</td>
      <td className="px-2 py-2 text-center">{record.target_material || '-'}</td>
      <td className="px-2 py-2 text-center">{record.test_item || '-'}</td>
      <td className="px-2 py-2 text-center whitespace-nowrap">
        <span
          className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${
            record.result_verdict === '합격'
              ? 'bg-green-100 text-green-700'
              : record.result_verdict === '불합격'
                ? 'bg-red-100 text-red-700'
                : record.result_verdict === '재시험'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-500'
          }`}
        >
          {record.result_verdict || '-'}
        </span>
      </td>
      <td className="px-2 py-2 text-center">
        {record.created_by === userId && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(record)
            }}
            className="p-1 text-gray-400 hover:text-red-600"
            title="삭제"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </td>
    </tr>
  )

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
          <h2 className="font-semibold text-sm sm:text-base truncate">품질검사 실시대장 (별지 제42호서식)</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="https://drive.google.com/uc?export=download&id=1QUNV-8SxYgThRcf5afTo7LyJdaM3xtn_"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium"
              title="품질검사 실시대장 HWP 양식 다운로드"
            >
              <FileDown className="h-4 w-4" />
              HWP 양식
            </a>
            <button
              onClick={handleLedgerDownload}
              disabled={ledgerDownloading || records.length === 0}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium disabled:opacity-50"
              title="품질검사 실시대장 엑셀 출력"
            >
              <Printer className="h-4 w-4" />
              대장 출력
            </button>
            <button
              onClick={handlePhotoReportDownload}
              disabled={photoReportDownloading || !records.some((r) => r.photo_url)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium disabled:opacity-50"
              title="사진대지 PDF 출력"
            >
              <ImageIcon className="h-4 w-4" />
              사진대지
            </button>
            <button
              onClick={handleAddClick}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium"
            >
              <Plus className="h-4 w-4" />
              추가
            </button>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              등록된 시험·검사 기록이 없습니다. 추가 버튼으로 대장 행을 등록합니다.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="px-2 py-2 text-center whitespace-nowrap">일련번호</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">연월일</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">구분</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">공종</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">대상 재료</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">시험·검사 종목</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">판정</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">삭제</th>
                </tr>
              </thead>
              <tbody>
                {unassignedRecords.length > 0 && (
                  <>
                    <tr className="bg-gray-100 text-gray-600">
                      <td colSpan={8} className="px-3 py-2 text-xs font-semibold">
                        총괄표 미지정
                      </td>
                    </tr>
                    {unassignedRecords.map((record) => renderRecordRow(record, records.indexOf(record)))}
                  </>
                )}
                {summaries.map((summary) => {
                  const groupRecords = records.filter((r) => r.summary_id === summary.id)
                  return (
                    <React.Fragment key={summary.id}>
                      <tr
                        onClick={() => onOpenSummary(summary.id)}
                        className="bg-amber-100 text-amber-800 cursor-pointer hover:bg-amber-200"
                        title="총괄표 열기"
                      >
                        <td colSpan={8} className="px-3 py-2 text-xs font-semibold">
                          <span className="inline-flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5" />
                            성과총괄표 — 작성일 {summary.report_date || '-'}
                            {summary.writer_name ? ` · ${summary.writer_name}` : ''}
                          </span>
                        </td>
                      </tr>
                      {groupRecords.map((record) => renderRecordRow(record, records.indexOf(record)))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 작성/수정 폼 */}
      {showForm && commonData && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-amber-600 text-white px-4 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-sm sm:text-base truncate">
              시험·검사 기록 {editingSerialNo !== null ? '수정' : '등록'}
            </h2>
            <button onClick={resetForm} className="text-white hover:text-amber-200 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-3 sm:p-4 space-y-4">
            {/* 공통 항목 — 한 제출건 내 모든 시험 항목이 공유 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {showSummarySelect && (
                <div>
                  <label className={labelCls}>성과총괄표</label>
                  <select
                    value={selectedSummaryId}
                    onChange={(e) => setSelectedSummaryId(e.target.value)}
                    className={inputCls}
                  >
                    {isLegacyEditing && <option value="">총괄표 미지정 유지</option>}
                    {summaries.map((s) => (
                      <option key={s.id} value={s.id}>
                        {`총괄표 (작성일 ${s.report_date || '-'})${s.writer_name ? ` · ${s.writer_name}` : ''}`}
                      </option>
                    ))}
                    <option value="new">새 총괄표 생성</option>
                  </select>
                </div>
              )}
              <div>
                <label className={labelCls}>일련번호</label>
                <input
                  type="text"
                  value={editingSerialNo ?? computeNextSerialNo()}
                  disabled
                  className={`${inputCls} bg-gray-100 text-gray-500`}
                />
              </div>
              <div>
                <label className={labelCls}>연월일</label>
                <input
                  type="date"
                  value={commonData.test_date || ''}
                  onChange={(e) => setCommon('test_date', e.target.value || null)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>시험·검사구분</label>
                <div className="flex gap-1.5">
                  {TEST_CATEGORY_OPTIONS.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setCommon('test_category', opt)}
                      className={`flex-1 px-2 py-1.5 rounded text-xs sm:text-sm font-medium transition-colors ${
                        commonData.test_category === opt
                          ? 'bg-amber-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-amber-100'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelCls}>공종 (총괄표 집계용)</label>
                <input
                  type="text"
                  value={commonData.work_type}
                  onChange={(e) => setCommon('work_type', e.target.value)}
                  placeholder="예: 흙쌓기공"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>품질검사 대상 재료</label>
                <input
                  type="text"
                  value={commonData.target_material}
                  onChange={(e) => setCommon('target_material', e.target.value)}
                  placeholder="예: 레미콘 25-24-150"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>공급받은 공장</label>
                <input
                  type="text"
                  value={commonData.supplier_factory}
                  onChange={(e) => setCommon('supplier_factory', e.target.value)}
                  placeholder="건설자재·부재 공급 공장"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>시험·검사 장소</label>
                <input
                  type="text"
                  value={commonData.test_place}
                  onChange={(e) => setCommon('test_place', e.target.value)}
                  placeholder="예: 현장 시험실"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>사진 (사진대지 출력용)</label>
                {commonData.photo_url ? (
                  <div className="relative inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={commonData.photo_url}
                      alt="시험·검사 사진"
                      className="h-16 rounded border border-gray-200 object-cover"
                    />
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute -top-2 -right-2 p-1 bg-white border border-gray-300 rounded-full text-gray-400 hover:text-red-600 shadow-sm"
                      title="사진 삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-1 border-2 border-dashed border-gray-300 rounded-lg h-16 bg-white hover:bg-gray-50 cursor-pointer text-xs text-gray-500">
                    {uploadingPhoto ? (
                      '업로드중...'
                    ) : (
                      <>
                        <Upload className="h-4 w-4 text-gray-400" />
                        <span>사진 추가</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      disabled={uploadingPhoto}
                    />
                  </label>
                )}
              </div>
            </div>

            {/* 항목별 반복 등록 — 시험·검사 종목 ~ 건설사업관리기술인 확인 */}
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item._key} className="border border-gray-200 rounded-lg p-3 space-y-3 bg-gray-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-amber-700">항목 {idx + 1}</span>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item._key)}
                        className="p-1 text-gray-400 hover:text-red-600"
                        title="이 항목 삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={labelCls}>시험·검사 종목 *</label>
                      <input
                        type="text"
                        value={item.test_item}
                        onChange={(e) => setItemField(item._key, 'test_item', e.target.value)}
                        placeholder="예: 슬럼프, 압축강도"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>시험 기준</label>
                      <input
                        type="text"
                        value={item.test_standard}
                        onChange={(e) => setItemField(item._key, 'test_standard', e.target.value)}
                        placeholder="예: KS F 2402"
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>시험 결과</label>
                      <input
                        type="text"
                        value={item.test_result}
                        onChange={(e) => setItemField(item._key, 'test_result', e.target.value)}
                        placeholder="측정값 등"
                        className={inputCls}
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-4">
                      <label className={labelCls}>시험 결과 판정</label>
                      <select
                        value={item.result_verdict}
                        onChange={(e) => setItemField(item._key, 'result_verdict', e.target.value as TestVerdict)}
                        className={inputCls}
                      >
                        {VERDICT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>품질관리기술인</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.quality_engineer_name}
                          onChange={(e) => setItemField(item._key, 'quality_engineer_name', e.target.value)}
                          placeholder="성명"
                          className={`${inputCls} max-w-[180px]`}
                        />
                        {item.quality_engineer_signature ? (
                          <button
                            type="button"
                            onClick={() => setActiveSign({ itemKey: item._key, field: 'quality_engineer_signature' })}
                            title="다시 서명"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.quality_engineer_signature}
                              alt="품질관리기술인 서명"
                              className="h-9 border rounded cursor-pointer hover:opacity-80"
                            />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveSign({ itemKey: item._key, field: 'quality_engineer_signature' })}
                            className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
                          >
                            서명
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className={labelCls}>건설사업관리기술인 확인</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={item.supervision_engineer_name}
                          onChange={(e) => setItemField(item._key, 'supervision_engineer_name', e.target.value)}
                          placeholder="성명"
                          className={`${inputCls} max-w-[180px]`}
                        />
                        {item.supervision_engineer_signature ? (
                          <button
                            type="button"
                            onClick={() => setActiveSign({ itemKey: item._key, field: 'supervision_engineer_signature' })}
                            title="다시 서명"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.supervision_engineer_signature}
                              alt="건설사업관리기술인 서명"
                              className="h-9 border rounded cursor-pointer hover:opacity-80"
                            />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setActiveSign({ itemKey: item._key, field: 'supervision_engineer_signature' })}
                            className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
                          >
                            서명
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddItem}
                className="w-full flex items-center justify-center gap-1 px-3 py-2 text-sm rounded-lg border border-dashed border-amber-400 text-amber-700 hover:bg-amber-50"
              >
                <Plus className="h-4 w-4" />
                항목 추가
              </button>
            </div>

            <div>
              <label className={labelCls}>비고</label>
              <input
                type="text"
                value={commonData.note}
                onChange={(e) => setCommon('note', e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
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
                {saving ? '저장 중...' : editingSerialNo !== null ? '수정' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={activeSign !== null}
        onClose={() => setActiveSign(null)}
        onSave={(signatureData) => {
          if (activeSign) setItemField(activeSign.itemKey, activeSign.field, signatureData)
          setActiveSign(null)
        }}
      />
    </div>
  )
}
