'use client'

// 확인시험 의뢰서 탭 (별지 제4호서식) — 의뢰서 목록·작성·수정·삭제·엑셀 출력

import React, { useState, useEffect, useCallback } from 'react'
import { Plus, Download, X, Trash2, FileText, FileDown, ChevronDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignatureModal from '@/components/project/SignatureModal'
import { downloadQualityVerificationRequestExcel } from '@/lib/excel/quality-verification-request-export'
import {
  QualityVerificationRequestRecord,
  QualityVerificationRequestFormData,
  createEmptyVerificationRequest,
} from '@/lib/quality/quality-test-types'

interface QualityVerificationRequestsTabProps {
  projectId: string
  userId: string
  projectName: string
  managingBranch: string
  ownerCompanyName: string
  supervisorName: string
  siteAddress: string
}

const inputCls =
  'w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500'
const labelCls = 'block text-xs font-medium text-gray-600 mb-1'
const TEST_ITEM_PRESETS = [
  '콘크리트(슬럼프, 공기량, 염화물, 단위수량)',
  '콘크리트(압축강도(비파괴시험))',
  '토공(현장밀도, 함수비)',
] as const

// 프로젝트명에서 지구명 추출 (첫 단어의 "…지구"까지, 최대 4글자) — 의뢰번호 접두어용
const deriveDistrictPrefix = (projectName?: string): string => {
  if (!projectName) return ''
  const token = projectName.trim().split(/\s+/)[0]
  const idx = token.indexOf('지구')
  const district = idx >= 0 ? token.slice(0, idx + 2) : token
  return district.slice(0, 4)
}

export default function QualityVerificationRequestsTab({
  projectId,
  userId,
  projectName,
  managingBranch,
  ownerCompanyName,
  supervisorName,
  siteAddress,
}: QualityVerificationRequestsTabProps) {
  const [records, setRecords] = useState<QualityVerificationRequestRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<QualityVerificationRequestFormData | null>(null)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [signOpen, setSignOpen] = useState(false)
  const [testItemsOpen, setTestItemsOpen] = useState(false)

  const loadRecords = useCallback(async () => {
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('quality_verification_requests')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    if (!error && data) setRecords(data as QualityVerificationRequestRecord[])
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const resetForm = () => {
    setShowForm(false)
    setFormData(null)
    setEditingRecordId(null)
    setTestItemsOpen(false)
  }

  // 추가 시작 — 프로젝트 정보와 확인시험 의뢰서 기본 문구를 신규 폼에만 채움
  const handleAddClick = () => {
    setEditingRecordId(null)
    const prefix = deriveDistrictPrefix(projectName)
    setFormData(
      createEmptyVerificationRequest({
        request_no: `${prefix}의뢰-${records.length + 1}`,
        receiver: '경기본부 기반사업부장',
        sender: supervisorName,
        reference: '품질담당',
        construction_name: projectName,
        client_name: managingBranch ? `한국농어촌공사 ${managingBranch}` : '한국농어촌공사',
        contractor_name: ownerCompanyName,
        purpose: '공사감독 확인시험',
        etc_note: siteAddress,
      })
    )
    setShowForm(true)
  }

  const handleSelectRecord = (record: QualityVerificationRequestRecord) => {
    const { id, project_id, created_by, created_at, updated_at, ...fields } = record
    void id; void project_id; void created_by; void created_at; void updated_at
    setFormData({ ...createEmptyVerificationRequest(), ...fields })
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

    if (!formData.test_items.trim()) {
      alert('확인시험 항목을 입력해주세요.')
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
          .from('quality_verification_requests')
          .update(dataToSave)
          .eq('id', editingRecordId)
        if (error) throw error
      } else {
        const { error } = await (supabase as any).from('quality_verification_requests').insert([dataToSave])
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

  const handleDelete = async (record: QualityVerificationRequestRecord) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await (supabase as any)
      .from('quality_verification_requests')
      .delete()
      .eq('id', record.id)
    if (!error) {
      if (editingRecordId === record.id) resetForm()
      loadRecords()
    } else {
      alert('삭제 실패: ' + error.message)
    }
  }

  const handleDownload = async (record: QualityVerificationRequestRecord) => {
    setDownloadingId(record.id)
    try {
      await downloadQualityVerificationRequestExcel(record)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('엑셀 생성 실패: ' + message)
    } finally {
      setDownloadingId(null)
    }
  }

  const set = <K extends keyof QualityVerificationRequestFormData>(
    key: K,
    value: QualityVerificationRequestFormData[K]
  ) => {
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
          <h2 className="font-semibold text-sm sm:text-base truncate">확인시험 의뢰서 (별지 제4호서식)</h2>
          <div className="flex items-center gap-1.5 shrink-0">
            <a
              href="https://drive.google.com/uc?export=download&id=1QUNV-8SxYgThRcf5afTo7LyJdaM3xtn_"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-amber-700 rounded-lg hover:bg-amber-50 text-xs sm:text-sm font-medium"
              title="확인시험 의뢰서 HWP 양식 다운로드"
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

        {records.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">등록된 확인시험 의뢰서가 없습니다. 추가 버튼으로 등록합니다.</p>
            <button
              type="button"
              onClick={handleAddClick}
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
            >
              <Plus className="h-4 w-4" />
              추가
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-xs">
                  <th className="px-2 py-2 text-center whitespace-nowrap">의뢰번호</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">의뢰일자</th>
                  <th className="px-2 py-2 text-center">대상공종, 물량</th>
                  <th className="px-2 py-2 text-center">확인시험 항목</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">예정일</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">엑셀</th>
                  <th className="px-2 py-2 text-center whitespace-nowrap">삭제</th>
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => handleSelectRecord(record)}
                    className={`border-t border-gray-100 cursor-pointer hover:bg-amber-50 ${
                      editingRecordId === record.id ? 'bg-amber-50' : ''
                    }`}
                  >
                    <td className="px-2 py-2 text-center whitespace-nowrap">{record.request_no || '-'}</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">{record.request_date || '-'}</td>
                    <td className="px-2 py-2 text-center">{record.target_work || '-'}</td>
                    <td className="px-2 py-2 text-center">{record.test_items || '-'}</td>
                    <td className="px-2 py-2 text-center whitespace-nowrap">{record.planned_date || '-'}</td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownload(record)
                        }}
                        disabled={downloadingId === record.id}
                        className="p-1 text-green-600 hover:text-green-700 disabled:opacity-50"
                        title="엑셀 다운로드"
                      >
                        <Download className="h-4 w-4" />
                      </button>
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
              확인시험 의뢰서 {editingRecordId ? '수정' : '등록'}
            </h2>
            <button onClick={resetForm} className="text-white hover:text-amber-200 shrink-0">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-3 sm:p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>의뢰번호</label>
                <input
                  type="text"
                  value={formData.request_no}
                  onChange={(e) => set('request_no', e.target.value)}
                  placeholder="지구명의뢰-1"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>의뢰일자</label>
                <input
                  type="date"
                  value={formData.request_date || ''}
                  onChange={(e) => set('request_date', e.target.value || null)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>받음</label>
                <input
                  type="text"
                  value={formData.receiver}
                  onChange={(e) => set('receiver', e.target.value)}
                  placeholder="경기본부 기반사업부장"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>보냄 (공사감독명 및 서명)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.sender}
                    onChange={(e) => set('sender', e.target.value)}
                    placeholder="공사감독명"
                    className={`${inputCls} max-w-[180px]`}
                  />
                  {formData.sender_signature ? (
                    <button type="button" onClick={() => setSignOpen(true)} title="다시 서명">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={formData.sender_signature}
                        alt="보냄 서명"
                        className="h-9 border rounded cursor-pointer hover:opacity-80"
                      />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSignOpen(true)}
                      className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 flex-shrink-0"
                    >
                      서명
                    </button>
                  )}
                </div>
              </div>
              <div className="col-span-2">
                <label className={labelCls}>참조</label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => set('reference', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>공사명</label>
                <input
                  type="text"
                  value={formData.construction_name}
                  onChange={(e) => set('construction_name', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>발주자</label>
                <input
                  type="text"
                  value={formData.client_name}
                  onChange={(e) => set('client_name', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2">
                <label className={labelCls}>시공자</label>
                <input
                  type="text"
                  value={formData.contractor_name}
                  onChange={(e) => set('contractor_name', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className={labelCls}>대상공종, 물량</label>
                <input
                  type="text"
                  value={formData.target_work}
                  onChange={(e) => set('target_work', e.target.value)}
                  placeholder="예: 흙쌓기공 12,000㎥"
                  className={inputCls}
                />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className={labelCls}>확인시험 항목 *</label>
                <div
                  className="relative"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setTestItemsOpen(false)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setTestItemsOpen(false)
                  }}
                >
                  <input
                    type="text"
                    role="combobox"
                    aria-expanded={testItemsOpen}
                    aria-controls="quality-test-item-presets"
                    aria-autocomplete="list"
                    value={formData.test_items}
                    onChange={(e) => set('test_items', e.target.value)}
                    onFocus={() => setTestItemsOpen(true)}
                    placeholder="확인시험 항목을 입력하거나 선택"
                    className={`${inputCls} pr-10`}
                  />
                  <button
                    type="button"
                    onClick={() => setTestItemsOpen((open) => !open)}
                    aria-label="확인시험 항목 프리셋 열기"
                    aria-expanded={testItemsOpen}
                    aria-haspopup="listbox"
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-gray-500 hover:text-gray-700"
                  >
                    <ChevronDown className={`h-4 w-4 transition-transform ${testItemsOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {testItemsOpen && (
                    <div
                      id="quality-test-item-presets"
                      role="listbox"
                      className="absolute left-0 right-0 z-20 mt-1 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg"
                    >
                      {TEST_ITEM_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          role="option"
                          aria-selected={formData.test_items === preset}
                          onClick={() => {
                            set('test_items', preset)
                            setTestItemsOpen(false)
                          }}
                          className={`block w-full px-3 py-2 text-left text-sm hover:bg-amber-50 ${
                            formData.test_items === preset ? 'bg-amber-50 font-medium text-amber-700' : 'text-gray-700'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className={labelCls}>확인시험예정일</label>
                <input
                  type="date"
                  value={formData.planned_date || ''}
                  onChange={(e) => set('planned_date', e.target.value || null)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2 sm:col-span-3">
                <label className={labelCls}>시험목적</label>
                <input
                  type="text"
                  value={formData.purpose}
                  onChange={(e) => set('purpose', e.target.value)}
                  className={inputCls}
                />
              </div>
              <div className="col-span-2 sm:col-span-4">
                <label className={labelCls}>기타사항</label>
                <textarea
                  value={formData.etc_note}
                  onChange={(e) => set('etc_note', e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {editingRecordId && (
                <button
                  onClick={() => {
                    const record = records.find((r) => r.id === editingRecordId)
                    if (record) handleDownload(record)
                  }}
                  disabled={downloadingId === editingRecordId}
                  className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 disabled:opacity-50"
                  title="확인시험 의뢰서 엑셀 다운로드"
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
                {saving ? '저장 중...' : editingRecordId ? '수정' : '저장'}
              </button>
            </div>
            {editingRecordId && (
              <p className="text-xs text-gray-400 text-right">
                ※ 엑셀은 마지막 저장된 내용으로 생성됩니다. 변경 후에는 저장을 먼저 해주세요.
              </p>
            )}
          </div>
        </div>
      )}

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={signOpen}
        onClose={() => setSignOpen(false)}
        onSave={(signatureData) => {
          set('sender_signature', signatureData)
          setSignOpen(false)
        }}
      />
    </div>
  )
}
