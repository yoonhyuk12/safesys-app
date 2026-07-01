'use client'

import React, { useState } from 'react'
import { ChevronLeft, Download, CheckCircle, ArrowLeft, PenTool, Loader2 } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import SignaturePad from '@/components/ui/SignaturePad'
import type { Project, ManagerInspection } from '@/lib/projects'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS } from '@/lib/constants'

// 위험요인 카드 사진 업로드 기능 도입 시점(2026-05-22). 이 날짜 이전에 시행된 점검은
// 사진 업로드 기능 자체가 없었으므로 '사진 미업로드' 집계에서 제외한다.
// inspection_date는 'YYYY-MM-DD' 형식이라 문자열 비교로 안전하게 판정한다.
const PHOTO_UPLOAD_FEATURE_START_DATE = '2026-05-22'

const isAfterPhotoFeature = (inspectionDate?: string): boolean =>
  !!inspectionDate && inspectionDate >= PHOTO_UPLOAD_FEATURE_START_DATE

// 점검에 실제 재해예방 항목이 등록되었는지 판정한다(위험요인이 비어있지 않고 '해당없음'이 아님).
// 재해예방 항목이 없으면 재해예방 보고서 사진이 없어도 미완성으로 보지 않는다.
const hasRealDisasterContent = (inspection: ManagerInspection): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr = (inspection as any)?.disaster_prevention_risk_factors_json
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return Array.isArray(arr) && arr.some((f: any) => {
    const rf = (f?.risk_factor || '').trim()
    return rf !== '' && rf !== '해당없음'
  })
}

interface SafetyManagerViewProps {
  loading: boolean
  projects: Project[]
  managerInspections: ManagerInspection[]
  selectedSafetyHq: string | null
  selectedSafetyBranch: string | null
  selectedHq: string
  selectedBranch: string
  selectedQuarter: string
  isHqDownloadMode: boolean
  selectedBranchesForReport: string[]
  selectedProjectIdsForReport: string[]
  isGeneratingReport: boolean
  reportProgress?: { current: number; total: number } | null
  onBack: () => void
  onBackToHqLevel: () => void
  onBackToAllBranches: () => void
  onQuarterChange: (q: string) => void
  onToggleDownloadMode: (on: boolean) => void
  onGenerateReport: () => Promise<void>
  onCancelReport: () => void
  onProjectToggleForReport: (projectId: string) => void
  onBranchToggleForReport: (branch: string) => void
  onSelectSafetyHq: (hq: string) => void
  onSelectSafetyBranch: (branch: string) => void
  onRowClick: (projectId: string) => void
}

const SafetyManagerView: React.FC<SafetyManagerViewProps> = ({
  loading,
  projects,
  managerInspections,
  selectedSafetyHq,
  selectedSafetyBranch,
  selectedHq,
  selectedBranch,
  selectedQuarter,
  isHqDownloadMode,
  selectedBranchesForReport,
  selectedProjectIdsForReport,
  isGeneratingReport,
  reportProgress,
  onBack,
  onBackToHqLevel,
  onBackToAllBranches,
  onQuarterChange,
  onToggleDownloadMode,
  onGenerateReport,
  onCancelReport,
  onProjectToggleForReport,
  onBranchToggleForReport,
  onSelectSafetyHq,
  onSelectSafetyBranch,
  onRowClick
}) => {
  const [isBulkSignMode, setIsBulkSignMode] = useState(() => {
    // 새로고침 후 일괄서명 모드 복원
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bulkSignMode') === 'true'
    }
    return false
  })
  const [selectedInspectionIds, setSelectedInspectionIds] = useState<string[]>([])
  const [showSignaturePad, setShowSignaturePad] = useState(false)
  const [isSavingSignature, setIsSavingSignature] = useState(false)
  const [showYearModal, setShowYearModal] = useState(false)
  const [tempYear, setTempYear] = useState(new Date().getFullYear())

  // 디버깅용 로그
  console.log('SafetyManagerView 렌더링:', {
    isBulkSignMode,
    selectedInspectionIds,
    showSignaturePad
  })
  const getQuarterNumber = (q: string) => {
    const parts = (q || '').split('Q')
    const num = parseInt(parts[1] || '0', 10)
    if (Number.isNaN(num) || num < 1 || num > 4) {
      const m = new Date().getMonth() + 1
      return Math.ceil(m / 3)
    }
    return num
  }

  const quarterNum = getQuarterNumber(selectedQuarter)

  // 년도와 분기 파싱 (예: "2026Q1" -> year: 2026, quarter: 1)
  const parseQuarter = (q: string) => {
    const match = q.match(/^(\d{4})Q([1-4])$/)
    if (match) {
      return { year: parseInt(match[1], 10), quarter: parseInt(match[2], 10) }
    }
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    let currentQuarter = 1
    if (currentMonth >= 4 && currentMonth <= 6) currentQuarter = 2
    else if (currentMonth >= 7 && currentMonth <= 9) currentQuarter = 3
    else if (currentMonth >= 10) currentQuarter = 4
    return { year: now.getFullYear(), quarter: currentQuarter }
  }

  const { year: selectedYear, quarter: selectedQ } = parseQuarter(selectedQuarter)

  // 년도 변경 핸들러
  const handleYearChange = (newYear: number) => {
    if (newYear < 2000 || newYear > 2100 || isNaN(newYear)) return
    onQuarterChange(`${newYear}Q${selectedQ}`)
  }

  // 분기 변경 핸들러
  const handleQuarterDropdownChange = (newQ: number) => {
    onQuarterChange(`${selectedYear}Q${newQ}`)
  }

  const handleSignatureSave = async (signatureData: string) => {
    try {
      setIsSavingSignature(true)
      console.log('📝 서명 저장 시작')
      console.log('선택된 점검 ID:', selectedInspectionIds)
      console.log('서명 데이터 길이:', signatureData.length)

      const requestBody = {
        inspection_ids: selectedInspectionIds,
        signature_data: signatureData
      }
      console.log('API 요청 본문:', requestBody)

      const response = await fetch('/api/manager-inspections/bulk-sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      })

      console.log('API 응답 상태:', response.status, response.statusText)

      const result = await response.json()
      console.log('API 응답 본문:', result)

      if (!response.ok || result?.success === false) {
        const updatedCount = result?.updated_count ?? 0
        const missingIds: string[] = result?.missing_ids ?? []
        console.warn('서명 업데이트 실패/부분성공:', { updatedCount, missingIds })
        throw new Error(
          result?.error ||
          (updatedCount === 0
            ? `업데이트 0건. RLS/권한 또는 존재하지 않는 ID 여부를 확인하세요. 누락 ID: ${missingIds.join(', ') || '없음'}`
            : '일부 항목만 업데이트되었습니다.')
        )
      }

      alert(result?.message || '서명이 완료되었습니다.')
      setShowSignaturePad(false)
      setSelectedInspectionIds([])
      // isBulkSignMode는 유지 - localStorage에 저장되어 있어서 새로고침 후에도 유지됨

      // 페이지 새로고침하여 업데이트된 데이터 가져오기
      window.location.reload()
    } catch (error: any) {
      console.error('❌ 서명 저장 오류:', error)
      console.error('에러 메시지:', error.message)
      console.error('에러 스택:', error.stack)
      alert(`서명 저장에 실패했습니다: ${error.message}`)
    } finally {
      setIsSavingSignature(false)
    }
  }

  if (selectedSafetyBranch) {
    const branchProjects = projects
      .filter((p) => (!selectedHq || p.managing_hq === selectedHq) && p.managing_branch === selectedSafetyBranch)
      .sort((a, b) => {
        // display_order로 정렬 (지사 내에서만)
        const aOrder = typeof a.display_order === 'number' ? a.display_order : Number.POSITIVE_INFINITY
        const bOrder = typeof b.display_order === 'number' ? b.display_order : Number.POSITIVE_INFINITY

        if (aOrder !== bOrder) {
          return aOrder - bOrder
        }

        // display_order가 같거나 둘 다 없는 경우 프로젝트명으로 정렬
        return (a.project_name || '').localeCompare(b.project_name || '', 'ko-KR')
      })
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              (지사) 관리자 점검 현황
            </h3>
            <div className="flex items-center space-x-2">
              {!isHqDownloadMode ? (
                <button
                  type="button"
                  onClick={() => onToggleDownloadMode(true)}
                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  aria-label="보고서 선택 모드"
                  title="보고서 선택 모드"
                >
                  <Download className="h-5 w-5" />
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onGenerateReport}
                    className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                    disabled={isGeneratingReport}
                    aria-busy={isGeneratingReport}
                    aria-label="보고서 생성"
                    title="보고서 생성"
                  >
                    {isGeneratingReport ? (
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                    ) : (
                      <span>프린터</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onCancelReport}
                    className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    취소
                  </button>
                </>
              )}
              {/* 년도 선택 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setTempYear(selectedYear)
                  setShowYearModal(true)
                }}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm bg-white hover:bg-gray-50 transition-colors"
              >
                {selectedYear}년
              </button>
              {/* 분기 선택 */}
              <select
                value={selectedQ}
                onChange={(e) => handleQuarterDropdownChange(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value={1}>1분기</option>
                <option value={2}>2분기</option>
                <option value={3}>3분기</option>
                <option value={4}>4분기</option>
              </select>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => onBackToHqLevel()}
              className="inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm"
              title={selectedSafetyHq ? `${selectedSafetyHq} 지사로 돌아가기` : '전체 지사로 돌아가기'}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                const newMode = !isBulkSignMode
                setIsBulkSignMode(newMode)
                setSelectedInspectionIds([])
                // localStorage에 상태 저장
                if (typeof window !== 'undefined') {
                  if (newMode) {
                    localStorage.setItem('bulkSignMode', 'true')
                  } else {
                    localStorage.removeItem('bulkSignMode')
                  }
                }
              }}
              className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${isBulkSignMode
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              <PenTool className="h-4 w-4 mr-2" />
              일괄서명
            </button>
          </div>
          {branchProjects.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h4 className="text-lg font-medium text-gray-900 mb-2">프로젝트가 없습니다</h4>
              <p className="text-gray-600">선택한 지사에 등록된 프로젝트가 없습니다.</p>
            </div>
          ) : isBulkSignMode ? (
            <>
              {/* 서명하기 버튼 */}
              <div className="mb-4 flex justify-between items-center">
                <button
                  onClick={() => {
                    console.log('🔵 서명하기 버튼 클릭됨')
                    console.log('선택된 ID 개수:', selectedInspectionIds.length)
                    console.log('선택된 ID 목록:', selectedInspectionIds)

                    if (selectedInspectionIds.length === 0) {
                      console.log('❌ 선택된 내역 없음 - 알림 표시')
                      alert('서명할 점검 내역을 선택해주세요.')
                      return
                    }

                    console.log('✅ 서명 패드 표시 시작')
                    setShowSignaturePad(true)
                    console.log('setShowSignaturePad(true) 호출 완료')
                  }}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2"
                  disabled={selectedInspectionIds.length === 0 || isSavingSignature}
                  aria-busy={isSavingSignature}
                >
                  {isSavingSignature ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>서명 업로드 중...</span>
                    </>
                  ) : (
                    `서명하기 (${selectedInspectionIds.length}건)`
                  )}
                </button>
              </div>

              {/* 일괄서명 테이블 */}
              <div className="overflow-x-auto -mx-6 sm:mx-0">
                <table className="divide-y divide-gray-200 sm:w-full" style={{ minWidth: '550px' }}>
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap sticky left-0 z-20 bg-gray-50 sm:static">프로젝트명</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검 대상</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검일자</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검자</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">비고</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {managerInspections
                      .filter((inspection) => inspection.managing_branch === selectedSafetyBranch)
                      .sort((a, b) => {
                        // 프로젝트의 display_order로 정렬
                        const projectA = projects.find((p) => p.id === a.project_id)
                        const projectB = projects.find((p) => p.id === b.project_id)
                        const aOrder = typeof projectA?.display_order === 'number' ? projectA.display_order : Number.POSITIVE_INFINITY
                        const bOrder = typeof projectB?.display_order === 'number' ? projectB.display_order : Number.POSITIVE_INFINITY

                        if (aOrder !== bOrder) {
                          return aOrder - bOrder
                        }

                        // display_order가 같거나 둘 다 없는 경우 프로젝트명으로 정렬
                        return (projectA?.project_name || '').localeCompare(projectB?.project_name || '', 'ko-KR')
                      })
                      .map((inspection) => {
                        const project = projects.find((p) => p.id === inspection.project_id)
                        const ia: any = (project as any)?.is_active
                        const isTarget = ia && typeof ia === 'object' ? !!ia[`q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'] : false
                        const hasSignature = !!inspection.has_signature
                        const isSelected = selectedInspectionIds.includes(inspection.id)

                        return (
                          <tr
                            key={inspection.id}
                            onClick={() => {
                              if (isSelected) {
                                setSelectedInspectionIds(selectedInspectionIds.filter((id) => id !== inspection.id))
                              } else {
                                setSelectedInspectionIds([...selectedInspectionIds, inspection.id])
                              }
                            }}
                            className={`cursor-pointer transition-colors ${isSelected
                              ? 'bg-blue-100 hover:bg-blue-200'
                              : 'hover:bg-gray-50'
                              }`}
                          >
                            <td className={`px-3 py-2 sm:px-6 sm:py-4 text-sm font-medium text-gray-900 border-r border-gray-200 text-center whitespace-nowrap sticky left-0 z-20 sm:static ${isSelected ? 'bg-blue-100 hover:bg-blue-200' : 'bg-white hover:bg-gray-50'
                              }`}>
                              <span className="sm:hidden">
                                {(project?.project_name || '미지정').length > 5
                                  ? `${(project?.project_name || '미지정').substring(0, 5)}...`
                                  : (project?.project_name || '미지정')}
                              </span>
                              <span className="hidden sm:inline">{project?.project_name || '미지정'}</span>
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center border-r border-gray-200">
                              {isTarget ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">대상</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200 text-center">
                              {new Date(inspection.inspection_date).toLocaleDateString('ko-KR')}
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200 text-center">
                              {inspection.inspector_name || '-'}
                            </td>
                            <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center">
                              {hasSignature ? (
                                <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">서명 완료</span>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="overflow-x-auto -mx-6 sm:mx-0">
              <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
                <table className="divide-y divide-gray-200 sm:w-full" style={{ minWidth: '550px' }}>
                  <thead className="bg-gray-50 sticky top-0 z-30">
                    <tr>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap sticky left-0 z-40 bg-gray-50 sm:static">프로젝트명</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검 대상</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">재해예방 대상</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검 횟수</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">미점검</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">미완성</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">사진 미업로드<br/>점검 건수</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">최근점검자</th>
                      <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">비고</th>
                    </tr>
                    {/* 소계 행 */}
                    {(() => {
                      const totalTargetCount = branchProjects.filter(p => {
                        const ia: any = (p as any).is_active
                        return ia && typeof ia === 'object' ? !!ia[`q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'] : false
                      }).length
                      const totalInspectionCount = branchProjects.reduce((sum, p) =>
                        sum + managerInspections.filter(i => i.project_id === p.id).length, 0
                      )
                      // 미점검: 이번 분기 점검 대상이지만 점검 내역이 없는 프로젝트 수
                      const totalNotInspectedCount = branchProjects.filter(p => {
                        const ia: any = (p as any).is_active
                        const isTarget = ia && typeof ia === 'object' ? !!ia[`q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'] : false
                        const hasInspections = managerInspections.some(i => i.project_id === p.id)
                        return isTarget && !hasInspections
                      }).length
                      const totalIncompleteCount = branchProjects.reduce((sum, p) => {
                        const projectInspections = managerInspections.filter(i => i.project_id === p.id)
                        const incompleteCount = projectInspections.filter(i => {
                          // 위험성평가 사진 확인 (상위 필드 또는 form_data)
                          const hasRiskPhoto = !!(i.risk_assessment_photo && i.risk_assessment_photo.trim() !== '') ||
                            !!(i.form_data?.risk_assessment_photo && i.form_data.risk_assessment_photo.trim() !== '')

                          // 재해예방 대상인 경우 재해예방 보고서 사진 확인
                          const isDisasterPreventionTarget = !!(p as any).disaster_prevention_target
                          const hasDisasterPhoto = !!((i as any).disaster_prevention_report_photo && (i as any).disaster_prevention_report_photo.trim() !== '') ||
                            !!(i.form_data?.disaster_prevention_report_photo && i.form_data.disaster_prevention_report_photo.trim() !== '')

                          // 서명 확인 (상위 필드 또는 form_data)
                          const hasSignature = !!i.has_signature || !!(i.form_data?.signature && i.form_data.signature.trim() !== '')

                          // 재해예방: 대상 프로젝트에서 내용·보고서 사진 중 하나만 있으면 미완성(둘 다 또는 둘 다 없음만 완성)
                          const disasterIncomplete = isDisasterPreventionTarget && (hasRealDisasterContent(i) !== hasDisasterPhoto)

                          // 미완성 조건: 서명 없음 / 위험성평가 사진 없음 / 재해예방 내용·사진 불일치
                          return !hasSignature || !hasRiskPhoto || disasterIncomplete
                        }).length
                        return sum + incompleteCount
                      }, 0)

                      // 사진 미업로드 점검 건수: 위험요인 카드의 photo_1/photo_2가 전혀 없는 점검
                      const countFactorPhotos = (arr: any) => Array.isArray(arr)
                        ? arr.reduce((s: number, f: any) => s + (f?.photo_1 && String(f.photo_1).trim() ? 1 : 0) + (f?.photo_2 && String(f.photo_2).trim() ? 1 : 0), 0)
                        : 0
                      const totalNoPhotoCount = branchProjects.reduce((sum, p) => {
                        const projectInspections = managerInspections.filter(i => i.project_id === p.id)
                        const noPhotoCount = projectInspections.filter(i =>
                          isAfterPhotoFeature(i.inspection_date) &&
                          countFactorPhotos((i as any).risk_factors_json) + countFactorPhotos((i as any).disaster_prevention_risk_factors_json) === 0
                        ).length
                        return sum + noPhotoCount
                      }, 0)

                      const totalDisasterPreventionCount = branchProjects.filter(p => p.disaster_prevention_target).length

                      return (
                        <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap sticky left-0 z-40 bg-blue-50 sm:static">
                            소계 ({branchProjects.length}개 프로젝트)
                          </th>
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                            {totalTargetCount}개
                          </th>
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                            {totalDisasterPreventionCount}개
                          </th>
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                            {totalInspectionCount}건
                          </th>
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                            {totalNotInspectedCount > 0 ? <span className="text-red-600">{totalNotInspectedCount}건</span> : '-'}
                          </th>
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                            {totalIncompleteCount > 0 ? <span className="text-red-600">{totalIncompleteCount}건</span> : '-'}
                          </th>
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                            {totalNoPhotoCount > 0 ? <span className="text-red-600">{totalNoPhotoCount}건</span> : '-'}
                          </th>
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                            -
                          </th>
                          <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 text-center whitespace-nowrap">
                            -
                          </th>
                        </tr>
                      )
                    })()}
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {branchProjects.map((project) => {
                      const projectInspections = managerInspections.filter((i) => i.project_id === project.id)
                      const latestInspection = projectInspections.sort((a, b) => new Date(b.inspection_date).getTime() - new Date(a.inspection_date).getTime())[0]
                      const lastInspector = latestInspection ? `${latestInspection.inspector_name || '-'} (${new Date(latestInspection.inspection_date).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })})` : '-'
                      const inspectionCount = projectInspections.length
                      const incompleteCount = projectInspections.filter(i => {
                        // 위험성평가 사진 확인 (상위 필드 또는 form_data)
                        const hasRiskPhoto = !!(i.risk_assessment_photo && i.risk_assessment_photo.trim() !== '') ||
                          !!(i.form_data?.risk_assessment_photo && i.form_data.risk_assessment_photo.trim() !== '')

                        // 재해예방 대상인 경우 재해예방 보고서 사진 확인
                        const isDisasterPreventionTarget = !!(project as any).disaster_prevention_target
                        const hasDisasterPhoto = !!((i as any).disaster_prevention_report_photo && (i as any).disaster_prevention_report_photo.trim() !== '') ||
                          !!(i.form_data?.disaster_prevention_report_photo && i.form_data.disaster_prevention_report_photo.trim() !== '')

                        // 서명 확인 (상위 필드 또는 form_data)
                        const hasSignature = !!i.has_signature || !!(i.form_data?.signature && i.form_data.signature.trim() !== '')

                        // 재해예방: 대상 프로젝트에서 내용·보고서 사진 중 하나만 있으면 미완성(둘 다 또는 둘 다 없음만 완성)
                        const disasterIncomplete = isDisasterPreventionTarget && (hasRealDisasterContent(i) !== hasDisasterPhoto)

                        // 미완성 조건: 서명 없음 / 위험성평가 사진 없음 / 재해예방 내용·사진 불일치
                        return !hasSignature || !hasRiskPhoto || disasterIncomplete
                      }).length
                      // 사진 미업로드 점검 건수: 위험요인 카드 photo_1/photo_2가 전혀 없는 점검
                      const countFactorPhotosRow = (arr: any) => Array.isArray(arr)
                        ? arr.reduce((s: number, f: any) => s + (f?.photo_1 && String(f.photo_1).trim() ? 1 : 0) + (f?.photo_2 && String(f.photo_2).trim() ? 1 : 0), 0)
                        : 0
                      const noPhotoCount = projectInspections.filter(i =>
                        isAfterPhotoFeature(i.inspection_date) &&
                        countFactorPhotosRow((i as any).risk_factors_json) + countFactorPhotosRow((i as any).disaster_prevention_risk_factors_json) === 0
                      ).length
                      const ia: any = (project as any).is_active
                      const isTarget = ia && typeof ia === 'object' ? !!ia[`q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'] : false
                      const hasInspections = inspectionCount > 0
                      return (
                        <tr
                          key={project.id}
                          className="hover:bg-gray-50 cursor-pointer group"
                          onClick={() => {
                            onRowClick(project.id)
                          }}
                        >
                          <td className="px-3 py-2 sm:px-6 sm:py-4 text-sm font-medium text-blue-600 hover:text-blue-800 border-r border-gray-200 text-center whitespace-nowrap sticky left-0 z-20 bg-white group-hover:bg-gray-50 sm:static">
                            <span className="sm:hidden">
                              {(project.project_name || '미지정').length > 5
                                ? `${(project.project_name || '미지정').substring(0, 5)}...`
                                : (project.project_name || '미지정')}
                            </span>
                            <span className="hidden sm:inline">{project.project_name || '미지정'}</span>
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center border-r border-gray-200">
                            {isTarget ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">대상</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-center border-r border-gray-200">
                            {project.disaster_prevention_target ? (
                              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">대상</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${inspectionCount > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{inspectionCount > 0 ? `${inspectionCount}건` : '-'}</span>
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                            {isTarget && inspectionCount === 0 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">미점검</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                            {incompleteCount > 0 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{incompleteCount}건</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                            {noPhotoCount > 0 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{noPhotoCount}건</span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200 text-center">{lastInspector}</td>
                          <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-sm">
                            {isHqDownloadMode ? (
                              <input
                                type="checkbox"
                                className={`w-4 h-4 text-blue-600 border-gray-300 rounded ${!hasInspections ? 'opacity-40 cursor-not-allowed' : ''}`}
                                disabled={!hasInspections}
                                title={!hasInspections ? '점검 내역이 없습니다' : undefined}
                                onClick={(e) => {
                                  if (!hasInspections) {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    alert('해당 프로젝트는 점검 내역이 없습니다.')
                                    return
                                  }
                                  e.stopPropagation()
                                  onProjectToggleForReport(project.id)
                                }}
                                checked={selectedProjectIdsForReport.includes(project.id)}
                                readOnly
                              />
                            ) : null}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* 서명 패드 모달 */}
        {showSignaturePad && (
          <>
            {console.log('🟢 서명 패드 렌더링 중 (selectedSafetyBranch 블록 내)')}
            <SignaturePad
              onSave={handleSignatureSave}
              onCancel={() => setShowSignaturePad(false)}
              selectedCount={selectedInspectionIds.length}
              isSaving={isSavingSignature}
            />
          </>
        )}

        {/* 년도 선택 팝업 모달 (지사 레벨) */}
        {showYearModal && (
          <div
            className="fixed inset-0 flex items-center justify-center z-50"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            onClick={() => setShowYearModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl p-6 w-64"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center space-y-4">
                {/* + 버튼 */}
                <button
                  type="button"
                  onClick={() => setTempYear(prev => Math.min(prev + 1, 2100))}
                  className="w-16 h-16 rounded-full bg-blue-600 text-white text-3xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center"
                >
                  +
                </button>

                {/* 년도 표시 */}
                <div className="text-4xl font-bold text-gray-900 py-2">
                  {tempYear}
                </div>

                {/* - 버튼 */}
                <button
                  type="button"
                  onClick={() => setTempYear(prev => Math.max(prev - 1, 2000))}
                  className="w-16 h-16 rounded-full bg-blue-600 text-white text-3xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center"
                >
                  −
                </button>

                {/* 취소 / 확인 버튼 */}
                <div className="flex space-x-3 w-full mt-4">
                  <button
                    type="button"
                    onClick={() => setShowYearModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleYearChange(tempYear)
                      setShowYearModal(false)
                    }}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  >
                    확인
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // 본부 단위 또는 전체: 지사별 집계 또는 지사 선택 시 프로젝트 리스트
  return (
    <>
      {/* 보고서 생성 진행 상황 모달 */}
      {isGeneratingReport && reportProgress && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">보고서 제작중</h3>
            <div className="mb-4">
              <p className="text-sm text-gray-600 mb-2">
                {reportProgress.total}건 중 {reportProgress.current}건 작성중...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300 ease-out rounded-full"
                  style={{ width: `${(reportProgress.current / reportProgress.total) * 100}%` }}
                >
                  <div className="h-full w-full bg-gradient-to-r from-blue-500 to-blue-600"></div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-right">
                {Math.round((reportProgress.current / reportProgress.total) * 100)}%
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={onCancelReport}
                className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-2 py-2 sm:px-6 sm:py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <button onClick={onBack} className="flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors">
              <ChevronLeft className="h-4 w-4 mr-1" />
              안전현황으로 돌아가기
            </button>
            <div className="flex items-center space-x-2">
              {!isHqDownloadMode ? (
                <button type="button" onClick={() => onToggleDownloadMode(true)} className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" aria-label="보고서 선택 모드" title="보고서 선택 모드">
                  <Download className="h-5 w-5" />
                </button>
              ) : (
                <>
                  <button type="button" onClick={onGenerateReport} className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 inline-flex items-center gap-2" disabled={isGeneratingReport} aria-busy={isGeneratingReport} aria-label="보고서 생성" title="보고서 생성">
                    {isGeneratingReport ? (
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                    ) : (
                      <span>프린터</span>
                    )}
                  </button>
                  <button type="button" onClick={onCancelReport} className="px-3 py-2 bg-gray-500 text-white text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors">
                    취소
                  </button>
                </>
              )}
              {/* 년도 선택 버튼 */}
              <button
                type="button"
                onClick={() => {
                  setTempYear(selectedYear)
                  setShowYearModal(true)
                }}
                className="border border-gray-300 rounded-md px-3 py-1 text-sm bg-white hover:bg-gray-50 transition-colors"
              >
                {selectedYear}년
              </button>
              {/* 분기 선택 */}
              <select
                value={selectedQ}
                onChange={(e) => handleQuarterDropdownChange(parseInt(e.target.value, 10))}
                className="border border-gray-300 rounded-md px-2 py-1 text-sm focus:ring-blue-500 focus:border-blue-500 bg-white"
              >
                <option value={1}>1분기</option>
                <option value={2}>2분기</option>
                <option value={3}>3분기</option>
                <option value={4}>4분기</option>
              </select>
            </div>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              (지사) 관리자 점검 현황
            </h3>
          </div>
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <LoadingSpinner />
            </div>
          ) : selectedSafetyHq ? (
            // 특정 본부 선택 시: 해당 본부의 지사별 점검 통계
            (() => {
              const branchStats = new Map<string, { projectCount: number; targetCount: number; inspectionCount: number; targetInspectionCount: number; notInspectedCount: number; incompleteCount: number; noPhotoCount: number; lastInspector: string; lastInspectionDate: Date | null }>()

              const filteredProjects = projects.filter((p) => p.managing_hq === selectedSafetyHq)

              // 프로젝트 ID로 프로젝트 정보를 빠르게 조회하기 위한 Map 생성 (전체 프로젝트 사용)
              const projectMap = new Map<string, Project>()
              projects.forEach((p) => {
                projectMap.set(p.id, p)
              })

              const targetProjectIds = new Set<string>()
              const inspectedProjectIds = new Set<string>()
              filteredProjects.forEach((p) => {
                const ia: any = (p as any).is_active
                if (ia && typeof ia === 'object' && ia.completed) return

                const branch = p.managing_branch
                if (!branchStats.has(branch)) {
                  branchStats.set(branch, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, notInspectedCount: 0, incompleteCount: 0, noPhotoCount: 0, lastInspector: '-', lastInspectionDate: null })
                }
                const entry = branchStats.get(branch)!
                entry.projectCount++
                if (ia && typeof ia === 'object') {
                  const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                  const activeThisQuarter = !!ia[key] && !ia.completed
                  if (activeThisQuarter) {
                    entry.targetCount++
                    targetProjectIds.add(p.id)
                  }
                }
              })

              managerInspections.forEach((ins) => {
                if (ins.project_id) inspectedProjectIds.add(ins.project_id)
                const branch = ins.managing_branch || '미지정'
                if (branchStats.has(branch)) {
                  const entry = branchStats.get(branch)!
                  entry.inspectionCount++
                  if (ins.project_id && targetProjectIds.has(ins.project_id)) {
                    entry.targetInspectionCount++
                  }
                  // 미완성 카운트 로직 수정
                  const project = ins.project_id ? projectMap.get(ins.project_id) : null
                  const isDisasterPreventionTarget = project ? !!(project as any).disaster_prevention_target : false

                  // 위험성평가 사진 확인 (상위 필드 또는 form_data)
                  const riskPhotoFromField = ins.risk_assessment_photo && ins.risk_assessment_photo.trim() !== ''
                  const riskPhotoFromFormData = ins.form_data?.risk_assessment_photo && ins.form_data.risk_assessment_photo.trim() !== ''
                  const hasRiskPhoto = !!(riskPhotoFromField || riskPhotoFromFormData)

                  // 재해예방 보고서 사진 확인 (상위 필드 또는 form_data)
                  const disasterPhotoFromField = (ins as any).disaster_prevention_report_photo && (ins as any).disaster_prevention_report_photo.trim() !== ''
                  const disasterPhotoFromFormData = ins.form_data?.disaster_prevention_report_photo && ins.form_data.disaster_prevention_report_photo.trim() !== ''
                  const hasDisasterPhoto = !!(disasterPhotoFromField || disasterPhotoFromFormData)

                  // 미완성 조건:
                  // 1. 위험성평가 사진이 없으면 미완성
                  // 2. 재해예방 항목이 등록된 대상 점검에 재해예방 보고서 사진이 없으면 미완성
                  // 서명 확인 (상위 필드 또는 form_data)
                  const hasSignature = !!ins.has_signature || !!(ins.form_data?.signature && ins.form_data.signature.trim() !== '')
                  // 재해예방: 대상 프로젝트에서 내용·보고서 사진 중 하나만 있으면 미완성(둘 다 또는 둘 다 없음만 완성)
                  const disasterIncomplete = isDisasterPreventionTarget && (hasRealDisasterContent(ins) !== hasDisasterPhoto)
                  // 미완성: 서명 없음 / 위험성평가 사진 없음 / 재해예방 내용·사진 불일치
                  const isIncomplete = !hasSignature || !hasRiskPhoto || disasterIncomplete

                  if (isIncomplete) {
                    entry.incompleteCount++
                  }

                  // 위험요인 카드 사진(photo_1/photo_2) 1장도 없는 점검 카운트
                  const countFactorPhotos = (arr: any) => Array.isArray(arr)
                    ? arr.reduce((sum: number, f: any) => sum + (f?.photo_1 && String(f.photo_1).trim() ? 1 : 0) + (f?.photo_2 && String(f.photo_2).trim() ? 1 : 0), 0)
                    : 0
                  const totalFactorPhotos = countFactorPhotos((ins as any).risk_factors_json) + countFactorPhotos((ins as any).disaster_prevention_risk_factors_json)
                  if (isAfterPhotoFeature(ins.inspection_date) && totalFactorPhotos === 0) {
                    entry.noPhotoCount++
                  }

                  // 최근 점검자 업데이트
                  const insDate = new Date(ins.inspection_date)
                  if (!entry.lastInspectionDate || insDate > entry.lastInspectionDate) {
                    entry.lastInspectionDate = insDate
                    entry.lastInspector = ins.inspector_name || '-'
                  }
                }
              })

              // 미점검: 이번 분기 점검 대상이지만 점검 내역이 없는 프로젝트를 지사별로 집계
              targetProjectIds.forEach((pid) => {
                if (inspectedProjectIds.has(pid)) return
                const proj = projectMap.get(pid)
                const entry = proj ? branchStats.get(proj.managing_branch) : null
                if (entry) entry.notInspectedCount++
              })

              const orderedBranches: string[] = selectedHq ? (BRANCH_OPTIONS[selectedHq] || []) : Object.keys(HEADQUARTERS_OPTIONS).flatMap((hq) => BRANCH_OPTIONS[hq] || [])
              const filteredBranches = orderedBranches.filter((b) => branchStats.has(b))
              const total = filteredBranches.reduce(
                (acc, b) => {
                  const s = branchStats.get(b)!
                  acc.projectCount += s.projectCount
                  acc.targetCount += s.targetCount
                  acc.inspectionCount += s.inspectionCount
                  acc.targetInspectionCount += s.targetInspectionCount
                  acc.notInspectedCount += s.notInspectedCount
                  acc.incompleteCount += s.incompleteCount
                  acc.noPhotoCount += s.noPhotoCount
                  return acc
                },
                { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, notInspectedCount: 0, incompleteCount: 0, noPhotoCount: 0 }
              )
              const totalRate = total.targetCount > 0 ? (total.inspectionCount / total.targetCount) * 100 : 0

              return (
                <div className="overflow-x-auto -mx-6 sm:mx-0">
                  <div className="inline-block align-middle sm:w-full">
                    <div className="overflow-y-auto" style={{ maxHeight: '70vh' }}>
                      <table className="divide-y divide-gray-200 sm:w-full">
                        <thead className="bg-gray-50 sticky top-0 z-30">
                          <tr>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap sticky left-0 z-40 bg-gray-50 sm:static">지사명</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">총 프로젝트 수</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검대상 수</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검횟수(대상)</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">미점검</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">미완성</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">사진 미업로드<br/>점검 건수</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">최근점검자</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검률</th>
                            <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">비고</th>
                          </tr>
                          {/* 소계 행 */}
                          <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap sticky left-0 z-40 bg-blue-50 sm:static">소계 ({filteredBranches.length}개 지사)</th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{total.projectCount}개</th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{total.targetCount}개</th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{total.inspectionCount}건 ({total.targetInspectionCount})</th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                              {total.notInspectedCount > 0 ? <span className="text-red-600">{total.notInspectedCount}건</span> : '-'}
                            </th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                              {total.incompleteCount > 0 ? <span className="text-red-600">{total.incompleteCount}건</span> : '-'}
                            </th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                              {total.noPhotoCount > 0 ? <span className="text-red-600">{total.noPhotoCount}건</span> : '-'}
                            </th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">-</th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{totalRate.toFixed(1)}%</th>
                            <th className="px-3 py-3 sm:px-6 sm:py-4 text-center text-sm font-bold text-blue-900 whitespace-nowrap">-</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredBranches.map((branch) => {
                            const s = branchStats.get(branch)!
                            const rate = s.targetCount > 0 ? (s.inspectionCount / s.targetCount) * 100 : 0
                            return (
                              <tr key={branch} className="hover:bg-gray-50 cursor-pointer" onClick={() => onSelectSafetyBranch(branch)}>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-800 border-r border-gray-200 text-center sticky left-0 z-10 bg-white hover:bg-gray-50 sm:static">{branch}</td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-200 text-center">{s.projectCount > 0 ? s.projectCount : '-'}</td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-blue-600 font-medium border-r border-gray-200 text-center">{s.targetCount > 0 ? s.targetCount : '-'}</td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200 text-center">{s.inspectionCount > 0 ? s.inspectionCount : '-'} <span className="text-gray-500">({s.targetInspectionCount || 0})</span></td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                                  {s.notInspectedCount > 0 ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{s.notInspectedCount}건</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                                  {s.incompleteCount > 0 ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{s.incompleteCount}건</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                                  {s.noPhotoCount > 0 ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">{s.noPhotoCount}건</span>
                                  ) : (
                                    <span className="text-gray-400">-</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-700 border-r border-gray-200 text-center">
                                  {s.lastInspector !== '-' ? (
                                    <span>{s.lastInspector} <span className="text-gray-500">({s.lastInspectionDate ? new Date(s.lastInspectionDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'})</span></span>
                                  ) : '-'}
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${rate >= 80 ? 'bg-green-100 text-green-800' : rate >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rate.toFixed(1)}%</span>
                                </td>
                                <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-sm">
                                  {isHqDownloadMode ? (
                                    <input type="checkbox" className="w-4 h-4 text-blue-600 border-gray-300 rounded" onClick={(e) => { e.stopPropagation(); onBranchToggleForReport(branch) }} checked={selectedBranchesForReport.includes(branch)} readOnly />
                                  ) : null}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })()
          ) : (
            // 전체 본부 테이블
            (() => {
              const hqStats = new Map<string, { projectCount: number; targetCount: number; inspectionCount: number; targetInspectionCount: number; lastInspector: string; lastInspectionDate: Date | null }>()

              const targetProjectIds = new Set<string>()
              projects.forEach((project: Project) => {
                if (selectedHq && project.managing_hq !== selectedHq) return
                if (selectedBranch && project.managing_branch !== selectedBranch) return

                const ia: any = (project as any).is_active
                if (ia && typeof ia === 'object' && ia.completed) return

                const hq = project.managing_hq || '미지정'
                if (!hqStats.has(hq)) {
                  hqStats.set(hq, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, lastInspector: '-', lastInspectionDate: null })
                }
                const entry = hqStats.get(hq)!
                entry.projectCount++


                let isActiveThisQuarter = false
                if (ia && typeof ia === 'object') {
                  const key = `q${quarterNum}` as 'q1' | 'q2' | 'q3' | 'q4'
                  isActiveThisQuarter = !!ia[key] && !ia.completed
                }
                if (isActiveThisQuarter) {
                  entry.targetCount++
                  targetProjectIds.add(project.id)
                }
              })

              managerInspections.forEach((inspection: ManagerInspection) => {
                if (selectedHq && inspection.managing_hq !== selectedHq) return
                if (selectedBranch && inspection.managing_branch !== selectedBranch) return

                const hq = inspection.managing_hq || '미지정'
                if (!hqStats.has(hq)) {
                  hqStats.set(hq, { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, lastInspector: '-', lastInspectionDate: null })
                }

                const entry = hqStats.get(hq)!
                entry.inspectionCount++
                if (inspection.project_id && targetProjectIds.has(inspection.project_id)) {
                  entry.targetInspectionCount++
                }

                const insDate = new Date(inspection.inspection_date)
                if (!entry.lastInspectionDate || insDate > entry.lastInspectionDate) {
                  entry.lastInspectionDate = insDate
                  entry.lastInspector = inspection.inspector_name || '-'
                }
              })

              return hqStats.size === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">점검 데이터가 없습니다</h4>
                  <p className="text-gray-600">선택한 분기에 등록된 관리자 점검 결과가 없습니다.</p>
                </div>
              ) : (
                <div className="overflow-x-auto -mx-6 sm:mx-0">
                  <table className="divide-y divide-gray-200 sm:w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">본부명</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">총 프로젝트 수</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검대상 수</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검횟수(대상)</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">최근점검자</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 whitespace-nowrap">점검률</th>
                        <th className="px-3 py-2 sm:px-6 sm:py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">비고</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(() => {
                        const orderedHqs: string[] = [...HEADQUARTERS_OPTIONS]
                        if (hqStats.has('미지정')) {
                          orderedHqs.push('미지정')
                        }

                        const subtotal = orderedHqs.reduce(
                          (acc, hq) => {
                            const s = hqStats.get(hq)
                            if (s) {
                              acc.projectCount += s.projectCount
                              acc.targetCount += s.targetCount
                              acc.inspectionCount += s.inspectionCount
                              acc.targetInspectionCount += s.targetInspectionCount
                            }
                            return acc
                          },
                          { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0 }
                        )
                        const subtotalRate = subtotal.targetCount > 0 ? (subtotal.targetInspectionCount / subtotal.targetCount) * 100 : 0

                        return (
                          <>
                            <tr className="bg-blue-50 font-semibold border-b-2 border-blue-200">
                              <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                                소계 ({orderedHqs.length}개 본부)
                              </td>
                              <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{subtotal.projectCount === 0 ? '-' : subtotal.projectCount}</td>
                              <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{subtotal.targetCount === 0 ? '-' : subtotal.targetCount}</td>
                              <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">
                                {subtotal.inspectionCount === 0 ? '-' : (<><span>{subtotal.inspectionCount}</span> <span className="text-gray-500 font-normal">({subtotal.targetInspectionCount})</span></>)}
                              </td>
                              <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">-</td>
                              <td className="px-3 py-3 sm:px-6 sm:py-4 text-sm font-bold text-blue-900 border-r border-blue-200 text-center whitespace-nowrap">{subtotalRate.toFixed(1)}%</td>
                              <td className="px-3 py-3 sm:px-6 sm:py-4 text-center text-sm font-bold text-blue-900 whitespace-nowrap">-</td>
                            </tr>

                            {orderedHqs.map(hq => {
                              const stats = hqStats.get(hq) || { projectCount: 0, targetCount: 0, inspectionCount: 0, targetInspectionCount: 0, lastInspector: '-', lastInspectionDate: null }
                              const rate = stats.targetCount > 0 ? (stats.targetInspectionCount / stats.targetCount) * 100 : 0
                              return (
                                <tr
                                  key={hq}
                                  className="hover:bg-gray-50 cursor-pointer"
                                  onClick={() => onSelectSafetyHq(hq)}
                                >
                                  <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm font-medium text-blue-600 hover:text-blue-800 border-r border-gray-200 text-center">{hq}</td>
                                  <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200 text-center">{stats.projectCount === 0 ? '-' : stats.projectCount}</td>
                                  <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-200 text-center">{stats.targetCount === 0 ? '-' : stats.targetCount}</td>
                                  <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm text-blue-600 font-semibold border-r border-gray-200 text-center">{stats.inspectionCount === 0 ? '-' : (<><span>{stats.inspectionCount}</span> <span className="text-gray-500 font-normal">({stats.targetInspectionCount})</span></>)}</td>
                                  <td className="px-3 py-2 sm:px-6 sm:py-4 text-sm text-gray-700 border-r border-gray-200 text-center">
                                    {stats.lastInspector !== '-' ? (
                                      <span>{stats.lastInspector} <span className="text-gray-500">({stats.lastInspectionDate ? new Date(stats.lastInspectionDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }) : '-'})</span></span>
                                    ) : '-'}
                                  </td>
                                  <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-sm border-r border-gray-200 text-center">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${rate >= 80 ? 'bg-green-100 text-green-800' : rate >= 60 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>{rate.toFixed(1)}%</span>
                                  </td>
                                  <td className="px-3 py-2 sm:px-6 sm:py-4 whitespace-nowrap text-center text-sm text-gray-400">-</td>
                                </tr>
                              )
                            })}
                          </>
                        )
                      })()}
                    </tbody>
                  </table>
                </div>
              )
            })()
          )}
        </div>
      </div>

      {/* 년도 선택 팝업 모달 */}
      {showYearModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          onClick={() => setShowYearModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl p-6 w-64"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center space-y-4">
              {/* + 버튼 */}
              <button
                type="button"
                onClick={() => setTempYear(prev => Math.min(prev + 1, 2100))}
                className="w-16 h-16 rounded-full bg-blue-600 text-white text-3xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                +
              </button>

              {/* 년도 표시 */}
              <div className="text-4xl font-bold text-gray-900 py-2">
                {tempYear}
              </div>

              {/* - 버튼 */}
              <button
                type="button"
                onClick={() => setTempYear(prev => Math.max(prev - 1, 2000))}
                className="w-16 h-16 rounded-full bg-blue-600 text-white text-3xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center"
              >
                −
              </button>

              {/* 취소 / 확인 버튼 */}
              <div className="flex space-x-3 w-full mt-4">
                <button
                  type="button"
                  onClick={() => setShowYearModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleYearChange(tempYear)
                    setShowYearModal(false)
                  }}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default SafetyManagerView


