'use client'

// 품질시험 월례보고서 페이지 — 월별 목록 + 작성/수정 폼 + PDF 양식 출력 (별지 제3호서식)

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Download, X, FileText } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import QualityMonthlyReportForm from '@/components/project/QualityMonthlyReportForm'
import { downloadQualityMonthlyReportPdf } from '@/lib/reports/quality-monthly-report'
import {
  QualityMonthlyReportFormData,
  QualityMonthlyReportRecord,
  QualityMonthlyTestActualSource,
  applyQualityTestActuals,
  carryOverRows,
  createEmptyRow,
  normalizeRows,
  reconcileQualityMonthlyReports,
} from '@/lib/quality/quality-monthly-types'

export default function QualityMonthlyReportPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [projectOwner, setProjectOwner] = useState<{ full_name?: string } | null>(null)
  const [records, setRecords] = useState<QualityMonthlyReportRecord[]>([])
  const [qualityTestRecords, setQualityTestRecords] = useState<QualityMonthlyTestActualSource[]>([])
  const [qualityTestError, setQualityTestError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState<QualityMonthlyReportFormData | null>(null)
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleBack = () => {
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) {
      router.push(returnUrl)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(`/project/${projectId}`)
  }

  // 프로젝트 로드
  useEffect(() => {
    if (!user || !projectId) return
    const loadProject = async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      if (data) {
        setProject(data as Project)
        const createdBy = (data as Project).created_by
        if (createdBy) {
          const { data: ownerProfile } = await supabase
            .from('user_profiles')
            .select('full_name')
            .eq('id', createdBy)
            .single()
          if (ownerProfile) setProjectOwner(ownerProfile)
        }
      }
    }
    loadProject()
  }, [user, projectId])

  // 월례보고서 목록 로드 (최신 연월 우선)
  const loadRecords = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const [monthlyResult, qualityTestResult] = await Promise.all([
      (supabase as any)
        .from('quality_monthly_reports')
        .select('*')
        .eq('project_id', projectId)
        .order('report_year', { ascending: false })
        .order('report_month', { ascending: false }),
      (supabase as any)
        .from('quality_test_records')
        .select('id, serial_no, test_date, test_category, work_type, test_item')
        .eq('project_id', projectId)
        .order('test_date', { ascending: true })
        .order('serial_no', { ascending: true }),
    ])
    const loadedQualityTests = qualityTestResult.error
      ? []
      : (qualityTestResult.data as QualityMonthlyTestActualSource[] | null) ?? []
    setQualityTestRecords(loadedQualityTests)
    setQualityTestError(
      qualityTestResult.error
        ? '품질시험 실시대장을 불러오지 못해 시험실적을 자동 반영할 수 없습니다. 새로고침 후 다시 시도해주세요.'
        : null
    )
    if (!monthlyResult.error && monthlyResult.data) {
      const reconciledRecords = reconcileQualityMonthlyReports(
        (monthlyResult.data as QualityMonthlyReportRecord[]).map((record) => ({
          ...record,
          report_rows: normalizeRows(record.report_rows),
        }))
      )
      setRecords(
        reconciledRecords.map((record) => {
          return {
            ...record,
            report_rows: qualityTestResult.error
              ? record.report_rows
              : applyQualityTestActuals(
                  record.report_rows,
                  loadedQualityTests,
                  record.report_year,
                  record.report_month
                ),
          }
        })
      )
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    if (user && projectId) loadRecords()
  }, [user, projectId, loadRecords])

  const resetForm = () => {
    setShowForm(false)
    setFormData(null)
    setEditingRecordId(null)
  }

  // 추가 시작 — 직전 보고서가 있으면 다음 달로 이월(공종/시험항목/년계획 복사 + 누계 자동)
  const handleAddClick = () => {
    setEditingRecordId(null)
    const latest = records[0]
    const now = new Date()
    let year = now.getFullYear()
    let month = now.getMonth() + 1
    if (latest) {
      year = latest.report_month === 12 ? latest.report_year + 1 : latest.report_year
      month = latest.report_month === 12 ? 1 : latest.report_month + 1
    }
    const reportRows = latest ? carryOverRows(latest.report_rows) : [createEmptyRow()]
    setFormData({
      report_year: year,
      report_month: month,
      district_name: project?.project_name || latest?.district_name || '',
      author_name: latest?.author_name || projectOwner?.full_name || '',
      confirmer_name: latest?.confirmer_name || project?.supervisor_name || '',
      report_rows: qualityTestError
        ? reportRows
        : applyQualityTestActuals(reportRows, qualityTestRecords, year, month),
    })
    setShowForm(true)
  }

  // 목록 항목 클릭 → 수정 모드
  const handleSelectRecord = (record: QualityMonthlyReportRecord) => {
    const reportRows = normalizeRows(record.report_rows)
    setFormData({
      report_year: record.report_year,
      report_month: record.report_month,
      district_name: record.district_name || '',
      author_name: record.author_name || '',
      confirmer_name: record.confirmer_name || '',
      report_rows: qualityTestError
        ? reportRows
        : applyQualityTestActuals(
            reportRows,
            qualityTestRecords,
            record.report_year,
            record.report_month
          ),
    })
    setEditingRecordId(record.id)
    setShowForm(true)
  }

  // 저장/수정
  const handleSave = async () => {
    if (!user || !formData) return
    if (qualityTestError) {
      alert(qualityTestError)
      return
    }

    // 프로젝트별 월 1건 — 클라이언트 사전 중복 확인 (DB UNIQUE 제약과 동일 규칙)
    const duplicate = records.find(
      (r) =>
        r.id !== editingRecordId &&
        r.report_year === formData.report_year &&
        r.report_month === formData.report_month
    )
    if (duplicate) {
      alert(`${formData.report_year}년 ${formData.report_month}월 보고서가 이미 있습니다. 목록에서 선택해 수정해주세요.`)
      return
    }

    setSaving(true)
    try {
      if (editingRecordId) {
        const { error } = await (supabase as any)
          .from('quality_monthly_reports')
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq('id', editingRecordId)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('quality_monthly_reports')
          .insert([{ ...formData, project_id: projectId, created_by: user.id }])
        if (error) throw error
      }

      alert(editingRecordId ? '수정되었습니다.' : '월례보고서가 등록되었습니다.')
      resetForm()
      loadRecords()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('저장 실패: ' + message)
    } finally {
      setSaving(false)
    }
  }

  const handleFormChange = (nextFormData: QualityMonthlyReportFormData) => {
    setFormData(
      qualityTestError
        ? nextFormData
        : {
            ...nextFormData,
            report_rows: applyQualityTestActuals(
              nextFormData.report_rows,
              qualityTestRecords,
              nextFormData.report_year,
              nextFormData.report_month
            ),
          }
    )
  }

  // 삭제
  const handleDelete = async (record: QualityMonthlyReportRecord) => {
    if (!confirm(`${record.report_year}년 ${record.report_month}월 보고서를 삭제하시겠습니까?`)) return
    const { error } = await (supabase as any)
      .from('quality_monthly_reports')
      .delete()
      .eq('id', record.id)
    if (!error) {
      if (editingRecordId === record.id) resetForm()
      loadRecords()
    } else {
      alert('삭제 실패: ' + error.message)
    }
  }

  // PDF 양식 다운로드
  const handleDownload = async (record: QualityMonthlyReportRecord) => {
    setDownloadingId(record.id)
    try {
      await downloadQualityMonthlyReportPdf(record, project?.project_name || '')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('PDF 생성 실패: ' + message)
    } finally {
      setDownloadingId(null)
    }
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user) {
    router.push('/login')
    return null
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl lg:max-w-none mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center h-16">
            <button
              onClick={handleBack}
              className="mr-3 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate flex-1">
              품질시험 월례보고서
            </h1>
            <a
              href="https://drive.google.com/uc?export=download&id=1O_t3c16DVdSqm2JQbWpzORT91y0AgJz_"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 text-xs sm:text-sm shrink-0"
              title="품질시험 월례보고서 양식(hwp) 다운로드"
            >
              <Download className="h-4 w-4" />
              <span className="whitespace-nowrap">양식(hwp)</span>
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-none mx-auto py-4 px-2 sm:px-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : records.length === 0 && !showForm ? (
          /* 등록된 보고서가 없으면 가운데 추가 버튼만 표시 */
          <div className="flex justify-center py-20">
            <button
              onClick={handleAddClick}
              className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-base font-semibold shadow-lg"
            >
              <Plus className="h-5 w-5" />
              월례보고서 등록
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* 월별 목록 */}
            {records.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-sm sm:text-base truncate">월례보고서 목록</h2>
                  <button
                    onClick={handleAddClick}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-700 rounded-lg hover:bg-blue-50 text-xs sm:text-sm font-medium shrink-0"
                  >
                    <Plus className="h-4 w-4" />
                    추가
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs">
                        <th className="px-3 py-2 text-left font-medium">보고 연월</th>
                        <th className="px-3 py-2 text-center font-medium">공종 행수</th>
                        <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">작성자</th>
                        <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">확인자</th>
                        <th className="px-3 py-2 text-center font-medium">양식 출력</th>
                        <th className="px-3 py-2 text-center font-medium">삭제</th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((record) => (
                        <tr
                          key={record.id}
                          onClick={() => handleSelectRecord(record)}
                          className={`border-t border-gray-100 cursor-pointer hover:bg-blue-50 ${
                            editingRecordId === record.id ? 'bg-blue-50' : ''
                          }`}
                        >
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {record.report_year}년 {record.report_month}월
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{record.report_rows.length}</td>
                          <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">{record.author_name}</td>
                          <td className="px-3 py-2 text-gray-600 hidden sm:table-cell">{record.confirmer_name}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDownload(record)
                              }}
                              disabled={downloadingId === record.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-700 bg-green-50 border border-green-300 rounded hover:bg-green-100 disabled:opacity-50"
                              title="품질시험 월례보고서 PDF (별지 제3호서식)"
                            >
                              <Download className="h-3.5 w-3.5" />
                              PDF
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(record)
                              }}
                              className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                              title="삭제"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 작성/수정 영역 */}
            {!showForm || !formData ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">
                  목록에서 월을 선택하면 수정할 수 있고,
                  <br />
                  추가 버튼으로 새 달 보고서를 작성합니다. 직전 달 보고서의 공종·누계가 자동으로 이월됩니다.
                </p>
                <button
                  onClick={handleAddClick}
                  className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  월례보고서 등록
                </button>
              </div>
            ) : (
              /* 데스크탑에선 내용물 맞춤 폭으로 가운데 배치 */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden lg:w-fit lg:mx-auto">
                <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
                  <h2 className="font-semibold text-sm sm:text-base truncate">
                    {formData.report_year}년 {formData.report_month}월 보고서 {editingRecordId ? '수정' : '작성'}
                  </h2>
                  <button onClick={resetForm} className="text-white hover:text-blue-200 shrink-0">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-3 sm:p-4 space-y-4">
                  {qualityTestError && (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                      {qualityTestError}
                    </div>
                  )}
                  <QualityMonthlyReportForm
                    formData={formData}
                    onChange={handleFormChange}
                    isEditing={!!editingRecordId}
                  />

                  <div className="flex justify-end gap-2 pt-1">
                    {editingRecordId && (
                      <button
                        onClick={() => {
                          const record = records.find((r) => r.id === editingRecordId)
                          if (record) handleDownload(record)
                        }}
                        disabled={downloadingId === editingRecordId}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 disabled:opacity-50"
                        title="품질시험 월례보고서 PDF (별지 제3호서식)"
                      >
                        <Download className="h-4 w-4" />
                        PDF
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
                      disabled={saving || !!qualityTestError}
                      className="px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? '저장 중...' : editingRecordId ? '수정' : '저장'}
                    </button>
                  </div>
                  {editingRecordId && (
                    <p className="text-xs text-gray-400 text-right">
                      ※ PDF는 마지막 저장된 내용으로 생성됩니다. 변경 후에는 저장을 먼저 해주세요.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
