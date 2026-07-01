'use client'

// 품질검사 실시대장 탭 (별지 제42호서식) — 대장 행 목록·작성·수정·삭제·엑셀 출력

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Printer, X, Trash2, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignatureModal from '@/components/project/SignatureModal'
import { downloadQualityTestLedgerExcel } from '@/lib/excel/quality-test-ledger-export'
import {
  QualityTestRecord,
  QualityTestRecordFormData,
  TestVerdict,
  TEST_CATEGORY_OPTIONS,
  createEmptyQualityTestRecord,
} from '@/lib/quality/quality-test-types'

interface QualityTestRecordsTabProps {
  projectId: string
  userId: string
  projectName: string
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'

const VERDICT_OPTIONS: TestVerdict[] = ['합격', '불합격', '재시험']

export default function QualityTestRecordsTab({ projectId, userId, projectName }: QualityTestRecordsTabProps) {
  const [records, setRecords] = useState<QualityTestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<QualityTestRecordFormData | null>(null)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [ledgerDownloading, setLedgerDownloading] = useState(false)
  const [activeSignType, setActiveSignType] = useState<
    'quality_engineer_signature' | 'supervision_engineer_signature' | null
  >(null)

  // 대장 순서(일련번호)와 동일하게 시험일→작성일 오름차순으로 로드
  const loadRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('quality_test_records')
      .select('*')
      .eq('project_id', projectId)
      .order('test_date', { ascending: true })
      .order('created_at', { ascending: true })
    if (!error && data) setRecords(data as QualityTestRecord[])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const resetForm = () => {
    setShowForm(false)
    setFormData(null)
    setEditingRecordId(null)
  }

  const handleAddClick = () => {
    // 직전 행의 기술인 성명·서명을 기본값으로 이어받아 반복 입력을 줄인다
    const last = records[records.length - 1]
    setEditingRecordId(null)
    setFormData(
      createEmptyQualityTestRecord(
        last
          ? {
              quality_engineer_name: last.quality_engineer_name,
              quality_engineer_signature: last.quality_engineer_signature,
              supervision_engineer_name: last.supervision_engineer_name,
              supervision_engineer_signature: last.supervision_engineer_signature,
            }
          : {}
      )
    )
    setShowForm(true)
  }

  const handleSelectRecord = (record: QualityTestRecord) => {
    const { id, project_id, created_by, created_at, updated_at, ...fields } = record
    void id; void project_id; void created_by; void created_at; void updated_at
    setFormData({ ...createEmptyQualityTestRecord(), ...fields })
    setEditingRecordId(record.id)
    setShowForm(true)
  }

  const handleSave = async () => {
    if (!formData) return

    // RLS상 수정은 작성자 본인만 가능 — 사전에 명확히 안내
    if (editingRecordId) {
      const editingRecord = records.find((r) => r.id === editingRecordId)
      if (editingRecord && editingRecord.created_by !== userId) {
        alert('작성자 본인만 수정할 수 있습니다.')
        return
      }
    }

    if (!formData.test_item.trim()) {
      alert('시험·검사 종목을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const dataToSave = {
        ...formData,
        project_id: projectId,
        created_by: userId,
        updated_at: new Date().toISOString(),
      }
      if (editingRecordId) {
        const { error } = await (supabase as any)
          .from('quality_test_records')
          .update(dataToSave)
          .eq('id', editingRecordId)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from('quality_test_records').insert([dataToSave])
        if (error) throw error
      }
      resetForm()
      loadRecords()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('저장 실패: ' + message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (record: QualityTestRecord) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await (supabase as any).from('quality_test_records').delete().eq('id', record.id)
    if (!error) {
      if (editingRecordId === record.id) resetForm()
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

  const set = <K extends keyof QualityTestRecordFormData>(key: K, value: QualityTestRecordFormData[K]) => {
    if (formData) setFormData({ ...formData, [key]: value })
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
          <h2 className="font-semibold text-sm sm:text-base truncate">품질검사 실시대장 (별지 제42호서식)</h2>
          <div className="flex items-center gap-1.5 shrink-0">
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
                  <th className="px-2 py-2 text-center whitespace-nowrap">번호</th>
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
                {records.map((record, i) => (
                  <tr
                    key={record.id}
                    onClick={() => handleSelectRecord(record)}
                    className={`border-t border-gray-100 cursor-pointer hover:bg-amber-50 ${
                      editingRecordId === record.id ? 'bg-amber-50' : ''
                    }`}
                  >
                    <td className="px-2 py-2 text-center text-gray-500">{i + 1}</td>
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
              시험·검사 기록 {editingRecordId ? '수정' : '등록'}
            </h2>
            <button onClick={resetForm} className="text-white hover:text-amber-200 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-3 sm:p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>연월일</label>
                <input
                  type="date"
                  value={formData.test_date || ''}
                  onChange={(e) => set('test_date', e.target.value || null)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>시험·검사구분</label>
                <input
                  type="text"
                  list="quality-test-category-options"
                  value={formData.test_category}
                  onChange={(e) => set('test_category', e.target.value)}
                  placeholder="자체시험"
                  className={inputCls}
                />
                <datalist id="quality-test-category-options">
                  {TEST_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>공종 (총괄표 집계용)</label>
                <input
                  type="text"
                  value={formData.work_type}
                  onChange={(e) => set('work_type', e.target.value)}
                  placeholder="예: 흙쌓기공"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>시험 결과 판정</label>
                <select
                  value={formData.result_verdict}
                  onChange={(e) => set('result_verdict', e.target.value as TestVerdict)}
                  className={inputCls}
                >
                  {VERDICT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>품질검사 대상 재료</label>
                <input
                  type="text"
                  value={formData.target_material}
                  onChange={(e) => set('target_material', e.target.value)}
                  placeholder="예: 레미콘 25-24-150"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>공급받은 공장</label>
                <input
                  type="text"
                  value={formData.supplier_factory}
                  onChange={(e) => set('supplier_factory', e.target.value)}
                  placeholder="건설자재·부재 공급 공장"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>시험·검사 장소</label>
                <input
                  type="text"
                  value={formData.test_place}
                  onChange={(e) => set('test_place', e.target.value)}
                  placeholder="예: 현장 시험실"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>시험·검사 종목 *</label>
                <input
                  type="text"
                  value={formData.test_item}
                  onChange={(e) => set('test_item', e.target.value)}
                  placeholder="예: 슬럼프, 압축강도"
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>시험 기준</label>
                <input
                  type="text"
                  value={formData.test_standard}
                  onChange={(e) => set('test_standard', e.target.value)}
                  placeholder="예: KS F 2402"
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>시험 결과</label>
                <input
                  type="text"
                  value={formData.test_result}
                  onChange={(e) => set('test_result', e.target.value)}
                  placeholder="측정값 등"
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>품질관리기술인</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.quality_engineer_name}
                    onChange={(e) => set('quality_engineer_name', e.target.value)}
                    placeholder="성명"
                    className={`${inputCls} max-w-[180px]`}
                  />
                  {formData.quality_engineer_signature ? (
                    <button
                      type="button"
                      onClick={() => setActiveSignType('quality_engineer_signature')}
                      title="다시 서명"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={formData.quality_engineer_signature}
                        alt="품질관리기술인 서명"
                        className="h-9 border rounded cursor-pointer hover:opacity-80"
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveSignType('quality_engineer_signature')}
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
                    value={formData.supervision_engineer_name}
                    onChange={(e) => set('supervision_engineer_name', e.target.value)}
                    placeholder="성명"
                    className={`${inputCls} max-w-[180px]`}
                  />
                  {formData.supervision_engineer_signature ? (
                    <button
                      type="button"
                      onClick={() => setActiveSignType('supervision_engineer_signature')}
                      title="다시 서명"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={formData.supervision_engineer_signature}
                        alt="건설사업관리기술인 서명"
                        className="h-9 border rounded cursor-pointer hover:opacity-80"
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveSignType('supervision_engineer_signature')}
                      className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
                    >
                      서명
                    </button>
                  )}
                </div>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className={labelCls}>비고</label>
                <input
                  type="text"
                  value={formData.note}
                  onChange={(e) => set('note', e.target.value)}
                  className={inputCls}
                />
              </div>
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
                {saving ? '저장 중...' : editingRecordId ? '수정' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={activeSignType !== null}
        onClose={() => setActiveSignType(null)}
        onSave={(signatureData) => {
          if (activeSignType) set(activeSignType, signatureData)
          setActiveSignType(null)
        }}
      />
    </div>
  )
}
