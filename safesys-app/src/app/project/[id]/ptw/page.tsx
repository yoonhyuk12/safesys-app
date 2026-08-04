'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Download, Printer, X, PenTool, FileText } from 'lucide-react'
import { Project } from '@/lib/projects'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignatureModal from '@/components/project/SignatureModal'
import PtwPermitList from '@/components/project/ptw/PtwPermitList'
import HighRiskPermitForm from '@/components/project/ptw/HighRiskPermitForm'
import CommonPermitForm from '@/components/project/ptw/CommonPermitForm'
import { downloadPtwPermitExcel, downloadPtwLedgerExcel } from '@/lib/excel/ptw-permit-export'
import {
  PermitType,
  PtwFormData,
  PtwPermitRecord,
  PermitSignatures,
  HighRiskPermitFormData,
  CommonPermitFormData,
  PERMIT_TYPE_CONFIGS,
  PERMIT_TYPE_ORDER,
  createEmptyHighRiskFormData,
  createEmptyCommonFormData,
  createEmptySignatures,
  isHighRiskFormData,
} from '@/lib/ptw/permit-types'

export default function PTWPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [projectOwner, setProjectOwner] = useState<{
    company_name?: string
    full_name?: string
    phone_number?: string
    position?: string
  } | null>(null)
  const [records, setRecords] = useState<PtwPermitRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [isSharedWithMe, setIsSharedWithMe] = useState(false)

  // 작성/수정 상태
  const [showForm, setShowForm] = useState(false)
  const [permitType, setPermitType] = useState<PermitType | null>(null)
  const [formData, setFormData] = useState<PtwFormData | null>(null)
  const [signatures, setSignatures] = useState<PermitSignatures>({})
  const [isCompleted, setIsCompleted] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [ledgerDownloading, setLedgerDownloading] = useState(false)

  // 서명 모달
  const [signatureRole, setSignatureRole] = useState<string | null>(null)

  const handleBack = () => {
    const returnUrl = searchParams.get('returnUrl')
    if (returnUrl) {
      router.push(returnUrl)
    } else {
      router.push(`/project/${projectId}`)
    }
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
        // 현재 사용자가 이 프로젝트를 공유받았는지 확인 (삭제 권한 판정용)
        const { data: shareRows } = await supabase
          .from('project_shares')
          .select('id')
          .eq('project_id', projectId)
          .eq('shared_with', user.id)
          .limit(1)
        setIsSharedWithMe(!!(shareRows && shareRows.length))
        // 프로젝트 소유자 프로필 (수급인/책임자 기본값용)
        const createdBy = (data as Project).created_by
        if (createdBy) {
          const { data: ownerProfile } = await supabase
            .from('user_profiles')
            .select('company_name, full_name, phone_number, position')
            .eq('id', createdBy)
            .single()
          if (ownerProfile) setProjectOwner(ownerProfile)
        }
      }
    }
    loadProject()
  }, [user, projectId])

  // 허가서 목록 로드
  const loadRecords = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    const { data, error } = await (supabase as any)
      .from('ptw_permits')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
    if (!error && data) {
      setRecords(data as PtwPermitRecord[])
    }
    setLoading(false)
  }, [projectId])

  useEffect(() => {
    if (user && projectId) loadRecords()
  }, [user, projectId, loadRecords])

  // 폼 초기화
  const resetForm = () => {
    setShowForm(false)
    setPermitType(null)
    setFormData(null)
    setSignatures({})
    setIsCompleted(false)
    setRemarks('')
    setEditingRecordId(null)
  }

  // 추가 시작 (종류 선택 대기)
  const handleAddClick = () => {
    resetForm()
    setShowForm(true)
  }

  // 종류 선택 → 빈 폼 생성
  const handleTypeSelect = (type: PermitType) => {
    setPermitType(type)
    if (type === 'high_risk') {
      const managingDept = [project?.managing_hq, project?.managing_branch].filter(Boolean).join(' ')
      const manager = projectOwner?.full_name
        ? projectOwner.phone_number
          ? `${projectOwner.full_name}(${projectOwner.phone_number})`
          : projectOwner.full_name
        : ''
      setFormData(
        createEmptyHighRiskFormData({
          projectName: project?.project_name,
          managingDept,
          contractor: projectOwner?.company_name || '',
          manager,
        })
      )
    } else {
      const common = createEmptyCommonFormData(type)
      const ownerFullName = projectOwner?.full_name || ''
      setFormData({
        ...common,
        // 신청인 기본값: 프로젝트 소유자
        applicant: {
          company: projectOwner?.company_name || '',
          position: projectOwner?.position || '',
          name: ownerFullName,
        },
        // 정전작업 점검확인결과 1행 기본값: 확인자=소유자, 현장정비=이상없음
        electrical_devices: common.electrical_devices.map((row, index) =>
          index === 0
            ? { ...row, breaker_confirmer: ownerFullName, electric_manager: ownerFullName, site_maintenance: '이상없음' }
            : row
        ),
      })
    }
    // 서명 이름 기본값: 작성자/신청인 → 프로젝트 소유자명, 허가자/확인자 → 프로젝트 감독명
    const ownerName = projectOwner?.full_name || ''
    const supervisorName = project?.supervisor_name || ''
    setSignatures({
      ...createEmptySignatures(type),
      ...(type === 'high_risk'
        ? { writer: { name: ownerName, signature: '' } }
        : { applicant: { name: ownerName, signature: '' } }),
      permitter: { name: supervisorName, signature: '' },
      confirmer: { name: supervisorName, signature: '' },
    })
  }

  // 목록 항목 클릭 → 수정 모드
  const handleSelectRecord = (record: PtwPermitRecord) => {
    setPermitType(record.permit_type)
    setFormData(record.form_data)
    setSignatures({ ...createEmptySignatures(record.permit_type), ...(record.signatures || {}) })
    setIsCompleted(record.is_completed || false)
    setRemarks(record.remarks || '')
    setEditingRecordId(record.id)
    setShowForm(true)
  }

  // 저장/수정
  const handleSave = async () => {
    if (!user || !permitType || !formData) return

    // RLS상 수정은 작성자 본인만 가능 — 사전에 명확히 안내
    if (editingRecordId) {
      const editingRecord = records.find((r) => r.id === editingRecordId)
      if (editingRecord && editingRecord.created_by !== user.id) {
        alert('작성자 본인만 수정할 수 있습니다.')
        return
      }
    }

    const config = PERMIT_TYPE_CONFIGS[permitType]
    let workContent = ''
    let applicantName = ''
    let permitDate: string | null = null

    if (isHighRiskFormData(formData)) {
      const highRisk = formData as HighRiskPermitFormData
      // 필수항목 검증: 작업기간, 공사비, 작업업체명
      const missing: string[] = []
      if (!highRisk.overview.work_period?.trim()) missing.push('작업기간')
      if (!highRisk.overview.cost?.trim()) missing.push('공사비')
      if (!highRisk.work.sub_contractor?.trim()) missing.push('작업업체명(하도급사)')
      if (missing.length > 0) {
        alert(`필수항목을 입력해주세요: ${missing.join(', ')}`)
        return
      }
      workContent = highRisk.work.work_detail || highRisk.work.work_type
      applicantName = signatures.writer?.name || ''
      permitDate = highRisk.permit_date || null
    } else {
      const common = formData as CommonPermitFormData
      workContent = common.content
      applicantName = common.applicant.name || signatures.applicant?.name || ''
      permitDate = common.permit_date || null
    }

    if (!workContent.trim()) {
      alert('작업내용(또는 작업세부공종)을 입력해주세요.')
      return
    }

    setSaving(true)
    try {
      const dataToSave = {
        project_id: projectId,
        created_by: user.id,
        permit_type: permitType,
        permit_date: permitDate,
        work_content: workContent,
        applicant_name: applicantName,
        is_completed: isCompleted,
        form_data: formData,
        signatures,
        remarks,
        updated_at: new Date().toISOString(),
      }

      if (editingRecordId) {
        const { error } = await (supabase as any)
          .from('ptw_permits')
          .update(dataToSave)
          .eq('id', editingRecordId)
        if (error) throw error
      } else {
        const { error } = await (supabase as any)
          .from('ptw_permits')
          .insert([dataToSave])
        if (error) throw error

        // 텔레그램 알림 발송 (발주청) - 신규 등록 시에만
        try {
          const { data: projectTgData } = await supabase
            .from('projects')
            .select('client_telegram_id, client_app_code')
            .eq('id', projectId)
            .single()

          if (projectTgData?.client_telegram_id || projectTgData?.client_app_code) {
            const telegramMessage =
              `📝 <b>작업허가서(PTW) 등록 알림</b>\n\n` +
              `🏗️ <b>현장:</b> ${project?.project_name || ''}\n` +
              `📅 <b>허가일자:</b> ${permitDate || '(미입력)'}\n` +
              `📋 <b>종류:</b> ${config.label}\n` +
              `🔧 <b>작업내용:</b> ${workContent || '(미입력)'}\n` +
              `👤 <b>신청인:</b> ${applicantName || '(미입력)'}` +
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

      alert(editingRecordId ? '수정되었습니다.' : `${config.short} 허가서가 저장되었습니다.`)
      resetForm()
      loadRecords()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('저장 실패: ' + message)
    } finally {
      setSaving(false)
    }
  }

  // 삭제
  const handleDelete = async (record: PtwPermitRecord) => {
    if (!confirm('정말 삭제하시겠습니까?')) return
    const { error } = await (supabase as any)
      .from('ptw_permits')
      .delete()
      .eq('id', record.id)
    if (!error) {
      if (editingRecordId === record.id) resetForm()
      loadRecords()
    } else {
      alert('삭제 실패: ' + error.message)
    }
  }

  // 엑셀 다운로드
  const handleDownload = async (record: PtwPermitRecord) => {
    setDownloadingId(record.id)
    try {
      await downloadPtwPermitExcel(record, project?.project_name || '')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('엑셀 생성 실패: ' + message)
    } finally {
      setDownloadingId(null)
    }
  }

  // 승인대장 전체 엑셀 출력 (붙임3 서식)
  const handleLedgerDownload = async () => {
    setLedgerDownloading(true)
    try {
      // 승인대장 번호는 작성 순서(오래된 것부터 1번)
      await downloadPtwLedgerExcel(
        [...records].reverse(),
        project?.project_name || '',
        project?.managing_branch || ''
      )
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '알 수 없는 오류'
      alert('엑셀 생성 실패: ' + message)
    } finally {
      setLedgerDownloading(false)
    }
  }

  // 서명 저장
  const handleSignatureSave = (signatureData: string) => {
    if (!signatureRole) return
    setSignatures({
      ...signatures,
      [signatureRole]: { ...(signatures[signatureRole] || { name: '' }), signature: signatureData },
    })
    setSignatureRole(null)
  }

  const setSignatureName = (role: string, name: string) => {
    setSignatures({
      ...signatures,
      [role]: { ...(signatures[role] || { signature: '' }), name },
    })
  }

  // 관리감독자(부장) 서명 행 추가/삭제
  const extraSignKeys = Object.keys(signatures)
    .filter((key) => key.startsWith('extra_'))
    .sort()

  const addExtraSigner = () => {
    const maxIndex = extraSignKeys.reduce((max, key) => {
      const n = parseInt(key.replace('extra_', ''), 10)
      return Number.isNaN(n) ? max : Math.max(max, n)
    }, -1)
    setSignatures({
      ...signatures,
      [`extra_${maxIndex + 1}`]: { name: '', signature: '' },
    })
  }

  const removeExtraSigner = (key: string) => {
    const next = { ...signatures }
    delete next[key]
    setSignatures(next)
  }

  // 삭제 권한: 작성자 본인 외에 프로젝트 소유자·공유받은자·발주청도 삭제 가능
  const canManageAll =
    userProfile?.role === '발주청' ||
    (!!project?.created_by && project.created_by === user?.id) ||
    isSharedWithMe

  const config = permitType ? PERMIT_TYPE_CONFIGS[permitType] : null

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
              위험공종 작업허가제(PTW)
            </h1>
            <a
              href="/ptw/ptw-manual-2026.pdf"
              download="안전작업허가제 운영 매뉴얼(26년).pdf"
              className="flex items-center gap-1 px-2.5 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg text-xs sm:text-sm shrink-0"
              title="안전작업허가제 운영 매뉴얼(26년) 다운로드"
            >
              <Download className="h-4 w-4" />
              <span className="whitespace-nowrap">운영 매뉴얼</span>
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
          /* 등록된 허가서가 없으면 가운데 추가 버튼만 표시 */
          <div className="flex justify-center py-20">
            <button
              onClick={handleAddClick}
              className="flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-base font-semibold shadow-lg"
            >
              <Plus className="h-5 w-5" />
              허가서 추가
            </button>
          </div>
        ) : (
        <div className="flex flex-col lg:flex-row gap-4 lg:items-start">
          {/* 목록 (데스크톱: 좌측 / 모바일: 상단) — 허가서가 있을 때만 표시 */}
          {records.length > 0 && (
          <div className="w-full lg:flex-1 lg:min-w-0 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold text-sm sm:text-base truncate">안전작업허가 승인대장</h2>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={handleLedgerDownload}
                  disabled={ledgerDownloading}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-700 rounded-lg hover:bg-blue-50 text-xs sm:text-sm font-medium disabled:opacity-50"
                  title="승인대장 엑셀 출력"
                >
                  <Printer className="h-4 w-4" />
                  프린트
                </button>
                <button
                  onClick={handleAddClick}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-white text-blue-700 rounded-lg hover:bg-blue-50 text-xs sm:text-sm font-medium"
                >
                  <Plus className="h-4 w-4" />
                  추가
                </button>
              </div>
            </div>
            {loading ? (
              <div className="flex justify-center py-10">
                <LoadingSpinner />
              </div>
            ) : (
              <PtwPermitList
                records={records}
                selectedId={editingRecordId}
                currentUserId={user.id}
                canDelete={canManageAll}
                onSelect={handleSelectRecord}
                onDelete={handleDelete}
                onDownload={handleDownload}
                downloadingId={downloadingId}
              />
            )}
          </div>
          )}

          {/* 작성/수정 영역 (데스크톱: 우측 / 모바일: 하단) — 목록이 없으면 가운데 단독 표시 */}
          <div className={records.length > 0 ? 'w-full lg:flex-1 lg:min-w-0' : 'w-full max-w-3xl mx-auto'}>
            {!showForm ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
                <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 mb-4">
                  목록에서 허가서를 선택하면 수정할 수 있고,
                  <br />
                  추가 버튼으로 새 허가서를 작성합니다.
                </p>
                <button
                  onClick={handleAddClick}
                  className="flex items-center gap-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm mx-auto"
                >
                  <Plus className="h-4 w-4" />
                  허가서 추가
                </button>
              </div>
            ) : !permitType || !formData ? (
              /* 종류 선택 */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
                  <h2 className="font-semibold text-sm sm:text-base">허가서 종류 선택</h2>
                  <button onClick={resetForm} className="text-white hover:text-blue-200">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {PERMIT_TYPE_ORDER.map((type) => {
                    const typeConfig = PERMIT_TYPE_CONFIGS[type]
                    return (
                      <button
                        key={type}
                        onClick={() => handleTypeSelect(type)}
                        className="border border-gray-300 rounded-lg p-4 text-left hover:border-blue-500 hover:bg-blue-50 transition-colors"
                      >
                        <div className="font-semibold text-gray-900 text-sm sm:text-base">
                          {typeConfig.label}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          {type === 'high_risk'
                            ? '고소·굴착·철골 등 위험공종 작업 허가'
                            : `${typeConfig.short} 작업 허가 ${typeConfig.suffix}`}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* 작성/수정 폼 */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                <div className="bg-blue-600 text-white px-4 py-3 flex items-center justify-between">
                  <h2 className="font-semibold text-sm sm:text-base truncate">
                    {config?.label}
                    {config?.suffix} {editingRecordId ? '수정' : '작성'}
                  </h2>
                  <button onClick={resetForm} className="text-white hover:text-blue-200 shrink-0">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="p-3 sm:p-4 space-y-4">
                  {permitType === 'high_risk' ? (
                    <HighRiskPermitForm
                      formData={formData as HighRiskPermitFormData}
                      onChange={(data) => setFormData(data)}
                      projectId={projectId}
                      projectName={project?.project_name}
                    />
                  ) : (
                    config && (
                      <CommonPermitForm
                        config={config}
                        formData={formData as CommonPermitFormData}
                        onChange={(data) => setFormData(data)}
                        projectId={projectId}
                        projectName={project?.project_name}
                      />
                    )
                  )}

                  {/* 서명 영역 */}
                  <div className="border border-gray-300 rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-3 py-2 font-semibold text-sm border-b border-gray-300 flex items-center gap-2">
                      <PenTool className="h-4 w-4" />
                      서명
                    </div>
                    <div className="p-3 space-y-2.5">
                      {config?.signRoles.map((role) => (
                        <div key={role.key} className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-sm font-medium min-w-[130px] text-right">
                            {role.label}
                            {role.sublabel && (
                              <span className="text-xs text-gray-500 block">{role.sublabel}</span>
                            )}
                          </span>
                          <input
                            type="text"
                            value={signatures[role.key]?.name || ''}
                            onChange={(e) => setSignatureName(role.key, e.target.value)}
                            placeholder="성명"
                            className="border border-gray-300 rounded px-2 py-1 text-sm w-28"
                          />
                          {signatures[role.key]?.signature ? (
                            <button type="button" onClick={() => setSignatureRole(role.key)}>
                              <img
                                src={signatures[role.key].signature}
                                alt="서명"
                                className="h-8 border rounded cursor-pointer hover:opacity-80"
                              />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSignatureRole(role.key)}
                              className="px-3 py-1 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                            >
                              서명
                            </button>
                          )}
                        </div>
                      ))}

                      {/* 관리감독자(부장) 추가 서명 */}
                      {extraSignKeys.map((key) => (
                        <div key={key} className="flex flex-wrap items-center justify-end gap-2">
                          <span className="text-sm font-medium min-w-[130px] text-right">
                            관리감독자
                            <span className="text-xs text-gray-500 block">부장</span>
                          </span>
                          <input
                            type="text"
                            value={signatures[key]?.name || ''}
                            onChange={(e) => setSignatureName(key, e.target.value)}
                            placeholder="성명"
                            className="border border-gray-300 rounded px-2 py-1 text-sm w-28"
                          />
                          {signatures[key]?.signature ? (
                            <button type="button" onClick={() => setSignatureRole(key)}>
                              <img
                                src={signatures[key].signature}
                                alt="서명"
                                className="h-8 border rounded cursor-pointer hover:opacity-80"
                              />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setSignatureRole(key)}
                              className="px-3 py-1 text-sm rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                            >
                              서명
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeExtraSigner(key)}
                            className="p-1 text-red-400 hover:text-red-600"
                            title="삭제"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}

                      <div className="pt-1 border-t border-gray-200 flex justify-end">
                        <button
                          type="button"
                          onClick={addExtraSigner}
                          className="flex items-center gap-1 px-3 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                        >
                          <Plus className="h-4 w-4" />
                          관리감독자(부장) 추가
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 버튼 */}
                  <div className="flex justify-end gap-2 pt-1">
                    {editingRecordId && (
                      <button
                        onClick={() => {
                          const record = records.find((r) => r.id === editingRecordId)
                          if (record) handleDownload(record)
                        }}
                        disabled={downloadingId === editingRecordId}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-green-700 bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 disabled:opacity-50"
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
                      className="px-6 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
          </div>
        </div>
        )}
      </main>

      {/* 서명 모달 */}
      <SignatureModal
        isOpen={signatureRole !== null}
        onClose={() => setSignatureRole(null)}
        onSave={handleSignatureSave}
      />
    </div>
  )
}
