'use client'

import { useState, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Plus, FileText, Calendar, User, Building2, CheckCircle, XCircle, Clock, ChevronLeft, ChevronRight, FileDown, Trash2, Phone, Copy, Check, HardHat } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import jsPDF from 'jspdf'
import CopyrightNotice from '@/components/common/CopyrightNotice'

// 체크리스트 항목 표시 순서 및 라벨 정의
const CHECKLIST_DISPLAY_ORDER: { key: string; label: string }[] = [
  // 공사안전보건대장
  { key: '공사안전보건대장.공사안전보건대장 작성', label: '공사안전보건대장 작성' },
  { key: '공사안전보건대장.공사안전보건대장 전문가 적정성 확인', label: '공사안전보건대장 전문가 적정성 확인' },
  { key: '공사안전보건대장.발주자 예방조치 이행확인(3개월당1회)', label: '발주자 예방조치 이행확인(3개월당1회)' },
  // 시공안전계획서
  { key: '시공안전계획서', label: '시공안전계획서' },
  // 안전관리계획서
  { key: '안전관리계획서.안전관리계획서 작성 및 비치', label: '안전관리계획서 작성 및 비치' },
  { key: '안전관리계획서.안전관리실태 확인 회의 실시(월1회)', label: '안전관리실태 확인 회의 실시(월1회)' },
  // 정기안전점검
  { key: '정기안전점검(최소2회 이상)', label: '정기안전점검(최소2회 이상)' },
  // 가설구조물
  { key: '가설구조물 구조적 안전성 검토', label: '가설구조물 구조적 안전성 검토' },
  // 일일안전점검
  { key: '일일안전점검', label: '일일안전점검' },
  // 위험공종 작업허가제
  { key: '위험공종 작업허가제.위험공종 작업허가 이행 여부', label: '위험공종 작업허가 이행 여부' },
  { key: '위험공종 작업허가제.안전실명제 실시 여부', label: '안전실명제 실시 여부' },
  // 작업계획서
  { key: '작업계획서', label: '작업계획서' },
  // 안전보건조정자
  { key: '안전보건조정자 선임 및 회의', label: '안전보건조정자 선임 및 회의' },
  // 안전관리비
  { key: '건진법 안전관리비 사용내역', label: '건진법 안전관리비 사용내역' },
  { key: '산업안전보건관리비 사용내역', label: '산업안전보건관리비 사용내역' },
  // 안전보건교육
  { key: '안전보건교육.안전보건관리책임자 교육(6시간 이상, 신규/보수)', label: '안전보건관리책임자 교육(6시간 이상, 신규/보수)' },
  { key: '안전보건교육.관리감독자 교육(연간 16시간 이상)', label: '관리감독자 교육(연간 16시간 이상)' },
  { key: '안전보건교육.정기교육(사무직 외 근로자, 매반기 12시간 이상)', label: '정기교육(사무직 외 근로자, 매반기 12시간 이상)' },
  { key: '안전보건교육.특별교육 대상자(2/8/16시간 이상)', label: '특별교육 대상자(2/8/16시간 이상)' },
  { key: '안전보건교육.특수형태근로종사자 교육(최초2시간이상)', label: '특수형태근로종사자 교육(최초2시간이상)' },
  { key: '안전보건교육.MSDS(물질안전보건) 교육', label: 'MSDS(물질안전보건) 교육' },
  { key: '안전보건교육.채용시 교육(1/4/8시간 이상)', label: '채용시 교육(1/4/8시간 이상)' },
  { key: '안전보건교육.건설업 기초안전보건교육(4hr) 수료증', label: '건설업 기초안전보건교육(4hr) 수료증' },
  { key: '안전보건교육.신규근로자 둘러보기(공사 자체시행)', label: '신규근로자 둘러보기(공사 자체시행)' },
  // 위험성평가
  { key: '위험성평가.위험성평가 규정서 작성', label: '위험성평가 규정서 작성' },
  { key: '위험성평가.최초 위험성평가 실시', label: '최초 위험성평가 실시' },
  { key: '위험성평가.정기 위험성평가 실시(연1회)', label: '정기 위험성평가 실시(연1회)' },
  { key: '위험성평가.수시 위험성평가 실시(월1회)', label: '수시 위험성평가 실시(월1회)' },
  { key: '위험성평가.위험성평가 회의록 작성여부(월1회)', label: '위험성평가 회의록 작성여부(월1회)' },
  { key: '위험성평가.위험성평가 교육일지(TBM가름)', label: '위험성평가 교육일지(TBM가름)' },
  // TBM
  { key: 'TBM실시(일일안전보건교육)', label: 'TBM실시(일일안전보건교육)' },
  // 작업장 출입
  { key: '근로자 작업장 출입 전,후 체크(일일)', label: '근로자 작업장 출입 전,후 체크(일일)' },
  // 안전보건협의체
  { key: '안전보건협의체(월1회).안전보건협의체 회의 실시 여부(월1회)', label: '안전보건협의체 회의 실시 여부(월1회)' },
  { key: '안전보건협의체(월1회).합동 안전보건점검(2개월 1회)', label: '합동 안전보건점검(2개월 1회)' },
  { key: '안전보건협의체(월1회).작업장 순회점검(2일 1회)', label: '작업장 순회점검(2일 1회)' },
  // 산업안전보건위원회
  { key: '산업안전보건위원회(분기별1회), 노사협의체(2개월1회)', label: '산업안전보건위원회(분기별1회), 노사협의체(2개월1회)' },
  // 재해예방기술지도
  { key: '재해예방기술지도(15일 1회)', label: '재해예방기술지도(15일 1회)' },
  // 유해위험방지계획서
  { key: '유해위험방지계획서', label: '유해위험방지계획서' },
  // 휴게시설
  { key: '휴게시설', label: '휴게시설' },
  // 안전보건총괄책임자
  { key: '안전보건총괄책임자/관리책임자 선임', label: '안전보건총괄책임자/관리책임자 선임' },
  // MSDS
  { key: '작업장내 물질안전보건 자료 게시', label: '작업장내 물질안전보건 자료 게시' },
  // 안전보건표지
  { key: '산업안전보건법령 요지 게시 및 안전보건표지 설치/부착', label: '산업안전보건법령 요지 게시 및 안전보건표지 설치/부착' },
  // 비상대처훈련
  { key: '비상대처훈련 실시 여부.비상 대처훈련 실시여부(반기1회)', label: '비상 대처훈련 실시여부(반기1회)' },
  // 폭염/한파
  { key: '폭염, 한파 안전보건조치', label: '폭염, 한파 안전보건조치' },
]

// SafetyCheckForm을 동적으로 불러오기 (SSR 비활성화)
const SafetyCheckForm = dynamic(() => import('./components/SafetyCheckForm'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
    </div>
  )
})

interface SafeDocumentRecord {
  id: string
  project_id: string
  inspection_date: string
  inspector_name: string
  inspector_affiliation: string
  construction_status: string
  construction_cost: string
  has_special_construction1: string
  has_special_construction2: string
  checklist_items: Record<string, string>
  compliant_items: number
  non_compliant_items: number
  not_applicable_items: number
  created_by: string
  created_at: string
  updated_at: string
}

export default function SafeDocumentsPage() {
  const params = useParams()
  const router = useRouter()
  const { userProfile } = useAuth()
  const projectId = params.id as string

  const [showCheckForm, setShowCheckForm] = useState(false)
  const [records, setRecords] = useState<SafeDocumentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState<any>(null)
  const [isPrintMode, setIsPrintMode] = useState(false) // 보고서 출력 모드
  const [isDeleteMode, setIsDeleteMode] = useState(false) // 삭제 모드
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set()) // 삭제 선택된 항목들

  // 전화 모달 관련 상태
  const [showContactSelectModal, setShowContactSelectModal] = useState(false)
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [phoneModalData, setPhoneModalData] = useState<{ name: string; phone: string; title: string } | null>(null)
  const [phoneCopied, setPhoneCopied] = useState(false)

  // PDF 보고서 생성 함수 (원본 SafetyCheckForm의 generatePDF와 동일한 형식)
  const generateReportPDF = async (record: SafeDocumentRecord) => {
    if (typeof window === 'undefined') return

    try {
      const doc = new jsPDF()
      const canvas = document.createElement('canvas')
      const context = canvas.getContext('2d')
      if (!context) {
        throw new Error('Canvas context creation failed')
      }

      canvas.width = 2480 // A4 width at 300 DPI
      canvas.height = 3508 // A4 height at 300 DPI

      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.fillStyle = '#000000'
      context.textBaseline = 'middle'

      // 로고 로드 시도 (없으면 텍스트로 대체)
      try {
        const logoImg = new Image()
        logoImg.src = '/KRCPNG.png'

        await new Promise((resolve, reject) => {
          logoImg.onload = resolve
          logoImg.onerror = reject
          setTimeout(reject, 3000)
        })

        const logoWidth = 200
        const logoHeight = (logoWidth * logoImg.height) / logoImg.width
        context.drawImage(logoImg, 200, 150, logoWidth, logoHeight)
      } catch {
        // 로고 없으면 텍스트로 대체
        context.font = 'bold 50px sans-serif'
        context.fillStyle = '#3b82f6'
        context.textAlign = 'left'
        context.fillText('🛡️', 200, 200)
      }

      // 제목
      context.font = 'bold 80px sans-serif'
      context.textAlign = 'left'
      context.fillStyle = '#000000'
      context.fillText('안전서류 점검 결과', 450, 200)

      // 프로젝트명 박스
      const projectNameText = `[${project?.project_name || ''}]`
      context.font = 'bold 70px sans-serif'
      const projectNameWidth = context.measureText(projectNameText).width
      const boxPadding = 40
      const boxWidth = projectNameWidth + (boxPadding * 2)
      const boxHeight = 100
      const boxX = (canvas.width - boxWidth) / 2
      const boxY = 350

      context.fillStyle = '#f8f9fa'
      context.strokeStyle = '#e5e7eb'
      context.lineWidth = 3
      context.beginPath()
      context.roundRect(boxX, boxY, boxWidth, boxHeight, 10)
      context.fill()
      context.stroke()

      context.fillStyle = '#000000'
      context.textAlign = 'center'
      context.fillText(projectNameText, canvas.width / 2, boxY + (boxHeight / 2) + 10)

      // 테이블 그리기 함수
      const drawTable = (x: number, y: number, title: string, rows: Array<[string, string]>) => {
        const padding = 60
        const minTableWidth = 900
        const maxTableWidth = 1000
        const finalTableWidth = minTableWidth
        const rowHeight = 80
        const cellPadding = 30

        if (title) {
          context.font = 'bold 50px sans-serif'
          context.textAlign = 'left'
          context.fillStyle = '#000000'
          context.fillText(`■ ${title}`, x, y)
          y += 80
        }

        rows.forEach(([label, value], index) => {
          context.fillStyle = index % 2 === 0 ? '#f8f9fa' : '#ffffff'
          context.fillRect(x, y, finalTableWidth, rowHeight)

          context.strokeStyle = '#e5e7eb'
          context.lineWidth = 2
          context.strokeRect(x, y, finalTableWidth, rowHeight)

          context.fillStyle = value === '불이행' ? '#ff0000' : '#000000'
          context.font = '45px sans-serif'
          context.textAlign = 'left'

          const labelX = x + cellPadding
          const valueX = x + finalTableWidth * 0.50

          context.fillText(`• ${label} :`, labelX, y + rowHeight / 2)
          context.fillText(` ${value}`, valueX, y + rowHeight / 2)

          y += rowHeight
        })

        return y + 30
      }

      // 공사 여건 데이터
      const constructionData: Array<[string, string]> = [
        ['공사 상태', record.construction_status || ''],
        ['총공사비 규모', record.construction_cost || ''],
        ['유해위험방지계획서', record.has_special_construction1 || ''],
        ['안전관리계획서', record.has_special_construction2 || '']
      ]

      // 점검자 정보 데이터
      const inspectorData: Array<[string, string]> = [
        ['본부', project?.managing_hq || ''],
        ['지사', project?.managing_branch || ''],
        ['점검자 소속', record.inspector_affiliation || ''],
        ['점검자명', record.inspector_name || ''],
        ['점검일자', record.inspection_date || '']
      ]

      const startX = 200
      let currentY = 550

      // 공사 여건과 점검자 정보 테이블 그리기
      drawTable(startX, currentY, '공사 여건', constructionData)
      drawTable(startX + 1200, currentY, '점검자 정보', inspectorData)

      currentY += 700

      // 체크리스트 결과 제목 및 요약
      const checklistTitle = '■ 체크리스트 결과'
      const summaryText = `(이행: ${record.compliant_items}건, 불이행: ${record.non_compliant_items}건, 해당없음: ${record.not_applicable_items}건)`

      context.font = 'bold 50px sans-serif'
      context.textAlign = 'left'
      context.fillStyle = '#000000'
      context.fillText(checklistTitle, 200, currentY)

      context.font = '40px sans-serif'
      context.fillStyle = '#666666'
      const titleWidth = context.measureText(checklistTitle).width
      context.fillText(summaryText, 200 + titleWidth + 40, currentY)

      // 체크리스트 데이터 준비
      const checklistItems = record.checklist_items || {}
      const checklistData: Array<[string, string]> = []

      let itemIndex = 1
      for (const item of CHECKLIST_DISPLAY_ORDER) {
        const value = checklistItems[item.key]
        if (value) {
          checklistData.push([`${itemIndex}. ${item.label}`, value])
          itemIndex++
        }
      }

      // 체크리스트 테이블 그리기
      const pageMargin = 200
      const maxChecklistWidth = canvas.width - (pageMargin * 2)
      const rowHeight = 80
      const maxY = canvas.height - 200
      currentY += 80

      checklistData.forEach(([label, value], index) => {
        if (currentY + rowHeight > maxY) {
          // 현재 페이지 저장
          const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
          doc.addImage(dataUrl, 'JPEG', 0, 0, 210, 297)
          doc.addPage()

          // 새 페이지 초기화
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
          currentY = 100

          context.font = 'bold 50px sans-serif'
          context.textAlign = 'left'
          context.fillStyle = '#000000'
          context.fillText('■ 체크리스트 결과 (계속)', 200, currentY)
          currentY += 80
        }

        // 행 배경
        context.fillStyle = index % 2 === 0 ? '#f8f9fa' : '#ffffff'
        context.fillRect(pageMargin, currentY, maxChecklistWidth, rowHeight)

        // 행 테두리
        context.strokeStyle = '#e5e7eb'
        context.lineWidth = 2
        context.strokeRect(pageMargin, currentY, maxChecklistWidth, rowHeight)

        // 텍스트
        context.fillStyle = value === '불이행' ? '#ff0000' : '#000000'
        context.font = '45px sans-serif'
        context.textAlign = 'left'

        const labelX = pageMargin + 30
        const valueX = pageMargin + maxChecklistWidth - 300

        context.fillText(label, labelX, currentY + rowHeight / 2)
        context.fillText(`: ${value}`, valueX, currentY + rowHeight / 2)

        currentY += rowHeight
      })

      // 마지막 페이지 저장
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      doc.addImage(dataUrl, 'JPEG', 0, 0, 210, 297)

      // 다운로드
      doc.save(`안전서류_점검결과_${project?.project_name || ''}.pdf`)

      // 출력 모드 해제
      setIsPrintMode(false)
    } catch (error) {
      console.error('PDF 생성 오류:', error)
      alert('PDF 생성 중 오류가 발생했습니다.')
    }
  }

  // 프로젝트 정보 조회
  useEffect(() => {
    const fetchProject = async () => {
      try {
        const { data, error } = await supabase
          .from('projects')
          .select('*, user_profiles:created_by(full_name, company_name, phone_number)')
          .eq('id', projectId)
          .single()

        if (error) throw error
        setProject(data)
      } catch (error) {
        console.error('프로젝트 조회 오류:', error)
      }
    }

    if (projectId) {
      fetchProject()
    }
  }, [projectId])

  // 안전서류 점검 기록 조회 (테이블이 없으면 빈 배열)
  useEffect(() => {
    const fetchRecords = async () => {
      try {
        setLoading(true)
        // 테이블이 없을 수 있으므로 try-catch로 처리
        const { data, error } = await supabase
          .from('safe_document_inspections')
          .select('*')
          .eq('project_id', projectId)
          .order('inspection_date', { ascending: false })

        if (error) {
          // 테이블이 없는 경우 빈 배열로 처리
          console.log('안전서류 점검 테이블이 없거나 오류:', error.message)
          setRecords([])
        } else {
          setRecords(data || [])
        }
      } catch (error) {
        console.error('기록 조회 오류:', error)
        setRecords([])
      } finally {
        setLoading(false)
      }
    }

    if (projectId) {
      fetchRecords()
    }
  }, [projectId])

  const handleBack = () => {
    if (showCheckForm) {
      setShowCheckForm(false)
      return
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
      return
    }
    router.push(`/project/${projectId}`)
  }

  // 삭제 실행 처리
  const handleDeleteButtonClick = async () => {
    if (selectedRecordIds.size === 0) return

    // 선택된 항목 삭제 확인
    const confirmDelete = window.confirm(`선택한 ${selectedRecordIds.size}건의 점검 기록을 삭제하시겠습니까?`)
    if (!confirmDelete) return

    try {
      // 선택된 항목들 삭제
      const { error } = await supabase
        .from('safe_document_inspections')
        .delete()
        .in('id', Array.from(selectedRecordIds))

      if (error) throw error

      // 목록에서 삭제된 항목 제거
      setRecords(prev => prev.filter(r => !selectedRecordIds.has(r.id)))
      setSelectedRecordIds(new Set())
      setIsDeleteMode(false)

      alert('삭제되었습니다.')
    } catch (error) {
      console.error('삭제 오류:', error)
      alert('삭제 중 오류가 발생했습니다.')
    }
  }

  // 행 선택 토글 (삭제 모드에서)
  const handleRowSelectForDelete = (recordId: string) => {
    setSelectedRecordIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(recordId)) {
        newSet.delete(recordId)
      } else {
        newSet.add(recordId)
      }
      return newSet
    })
  }

  return (
    <div className="min-h-screen relative bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900 flex flex-col">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center flex-1 min-w-0">
              <button
                onClick={handleBack}
                className="mr-2 lg:mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 flex-shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-sm lg:text-xl font-bold text-gray-900 truncate">
                {project?.project_name ? `${project.project_name} - ${showCheckForm ? '안전서류 점검 작성' : '안전서류 점검'}` : (showCheckForm ? '안전서류 점검 작성' : '안전서류 점검')}
              </h1>
            </div>
            <div className="flex items-center space-x-2 lg:space-x-4">
              <div className="text-xs lg:text-sm text-gray-700 flex-shrink-0">
                <span className="font-medium hidden sm:inline">{userProfile?.full_name}</span>
                <span className="text-gray-500">({userProfile?.role === '시공사' ? '시' : userProfile?.role === '발주청' ? '발' : userProfile?.role === '감리단' ? '감' : userProfile?.role})</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="flex-1 w-full max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* 파일철 외곽 */}
        <div className="p-2 lg:p-6 rounded-lg shadow-lg" style={{ backgroundColor: 'rgb(88, 190, 213)' }}>
          {/* 파일철 내부 */}
          <div className="bg-white rounded-lg shadow-inner min-h-[600px] relative">

            {showCheckForm ? (
              /* 점검 폼 - 파일철 내부에 표시 */
              <div className="h-full">
                <SafetyCheckForm
                  onBack={() => setShowCheckForm(false)}
                  embedded={true}
                  projectId={projectId}
                  onSaveSuccess={() => {
                    setShowCheckForm(false)
                    // 목록 새로고침
                    const refreshRecords = async () => {
                      const { data } = await supabase
                        .from('safe_document_inspections')
                        .select('*')
                        .eq('project_id', projectId)
                        .order('inspection_date', { ascending: false })
                      if (data) setRecords(data)
                    }
                    refreshRecords()
                  }}
                />
              </div>
            ) : (
              /* 전체 화면 점검 내역 */
              <div className="h-full p-2 lg:p-4">
                {/* 헤더 - 제목과 버튼들 */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
                  <div className="flex items-center">
                    <FileText className="h-6 w-6 text-blue-600 mr-3" />
                    <h2 className="text-xl font-semibold text-gray-900">안전서류 점검 내역</h2>
                  </div>

                  <div className="flex items-center gap-3 justify-end">
                    {isDeleteMode ? (
                      /* 삭제 모드일 때: 취소 버튼, 삭제 버튼 */
                      <>
                        {/* 취소 버튼 */}
                        <button
                          onClick={() => {
                            setIsDeleteMode(false)
                            setSelectedRecordIds(new Set())
                          }}
                          className="p-3 rounded-full shadow-lg transition-colors bg-gray-500 hover:bg-gray-600 text-white"
                          title="취소"
                        >
                          <XCircle className="h-6 w-6" />
                        </button>
                        {/* 삭제 실행 버튼 */}
                        <button
                          onClick={handleDeleteButtonClick}
                          disabled={selectedRecordIds.size === 0}
                          className={`p-3 rounded-full shadow-lg transition-colors ${selectedRecordIds.size > 0
                              ? 'bg-red-600 text-white ring-2 ring-red-300 animate-pulse hover:bg-red-700'
                              : 'bg-red-300 text-white cursor-not-allowed'
                            }`}
                          title={selectedRecordIds.size > 0 ? `${selectedRecordIds.size}건 삭제` : '삭제할 항목을 선택하세요'}
                        >
                          <Trash2 className="h-6 w-6" />
                        </button>
                      </>
                    ) : (
                      /* 일반 모드일 때: 전화, 다운로드, 삭제모드, 추가 버튼 */
                      <>
                        {/* 연락처 선택 버튼 */}
                        <button
                          onClick={() => setShowContactSelectModal(true)}
                          className="p-3 rounded-full shadow-lg transition-colors bg-white text-blue-600 border border-blue-300 hover:bg-blue-50"
                          title="연락처 보기"
                        >
                          <Phone className="h-6 w-6" />
                        </button>
                        {/* 보고서 출력 버튼 */}
                        <button
                          onClick={() => setIsPrintMode(!isPrintMode)}
                          className={`p-3 rounded-full shadow-lg transition-colors ${isPrintMode
                              ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                              : 'bg-white text-blue-600 border border-blue-300 hover:bg-blue-50'
                            }`}
                          title="보고서 출력"
                        >
                          <FileDown className="h-6 w-6" />
                        </button>
                        {/* 삭제 모드 버튼 */}
                        <button
                          onClick={() => {
                            setIsDeleteMode(true)
                            setIsPrintMode(false)
                            setSelectedRecordIds(new Set())
                          }}
                          className="p-3 rounded-full shadow-lg transition-colors bg-white text-red-600 border border-red-300 hover:bg-red-50"
                          title="삭제 모드"
                        >
                          <Trash2 className="h-6 w-6" />
                        </button>
                        {/* 등록 버튼 */}
                        <button
                          onClick={() => setShowCheckForm(true)}
                          className="bg-green-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg transition-colors group"
                          title="점검 등록하기"
                        >
                          <Plus className="h-6 w-6" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center min-h-[400px]">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
                  </div>
                ) : records.length === 0 ? (
                  /* 빈 상태 */
                  <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
                    <FileText className="h-16 w-16 text-gray-300 mb-4" />
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">점검 기록이 없습니다</h3>
                    <p className="text-gray-500 mb-6">
                      우측 상단의 <Plus className="inline-block h-4 w-4 text-green-600" /> 버튼을 눌러<br />
                      안전서류 점검을 시작하세요.
                    </p>
                    <button
                      onClick={() => setShowCheckForm(true)}
                      className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg shadow-lg transition-colors"
                    >
                      <Plus className="h-5 w-5" />
                      점검 시작하기
                    </button>
                  </div>
                ) : (
                  /* 점검 기록 테이블 뷰 */
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-gray-500">
                        총 {records.length}건의 점검 기록
                      </p>
                      {isPrintMode ? (
                        <p className="text-sm text-yellow-600 font-medium animate-pulse">
                          📄 출력할 행을 클릭하세요 (클릭 시 PDF 다운로드)
                        </p>
                      ) : isDeleteMode ? (
                        <p className="text-sm text-red-600 font-medium animate-pulse">
                          🗑️ 삭제할 행을 클릭하세요 {selectedRecordIds.size > 0 && `(${selectedRecordIds.size}건 선택됨)`}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400">
                          ← 좌우 스크롤로 모든 항목 확인 →
                        </p>
                      )}
                    </div>

                    {/* 가로 스크롤 테이블 */}
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="min-w-max w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            {/* 고정 컬럼들 */}
                            <th className="sticky left-0 z-10 bg-gray-100 px-3 py-2 text-left font-semibold text-gray-700 border-r border-gray-300 min-w-[100px]">
                              일자
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700 border-r border-gray-200 min-w-[60px]">
                              소속
                            </th>
                            <th className="px-3 py-2 text-left font-semibold text-gray-700 border-r border-gray-200 min-w-[80px]">
                              점검자
                            </th>
                            <th className="px-3 py-2 text-center font-semibold text-gray-700 border-r border-gray-300 min-w-[70px] bg-red-50">
                              불이행
                            </th>
                            {/* 동적 체크리스트 항목 컬럼들 */}
                            {CHECKLIST_DISPLAY_ORDER.map((item) => (
                              <th
                                key={item.key}
                                className="px-2 py-2 text-center font-medium text-gray-600 border-r border-gray-200 min-w-[80px] text-xs whitespace-nowrap"
                                title={item.key}
                              >
                                {item.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {records.map((record) => (
                            <tr
                              key={record.id}
                              className={`transition-colors ${isDeleteMode
                                  ? selectedRecordIds.has(record.id)
                                    ? 'bg-red-100 hover:bg-red-200 cursor-pointer'
                                    : 'hover:bg-red-50 cursor-pointer'
                                  : isPrintMode
                                    ? 'hover:bg-yellow-100 cursor-pointer'
                                    : 'hover:bg-blue-50'
                                }`}
                              onClick={() => {
                                if (isDeleteMode) {
                                  handleRowSelectForDelete(record.id)
                                } else if (isPrintMode) {
                                  generateReportPDF(record)
                                }
                              }}
                            >
                              {/* 고정 컬럼들 */}
                              <td className={`sticky left-0 z-10 px-3 py-2 border-r border-gray-300 font-medium text-gray-900 ${isDeleteMode && selectedRecordIds.has(record.id) ? 'bg-red-100' : 'bg-white'
                                }`}>
                                {record.inspection_date}
                              </td>
                              <td className="px-3 py-2 border-r border-gray-200 text-gray-600">
                                {record.inspector_affiliation}
                              </td>
                              <td className="px-3 py-2 border-r border-gray-200 text-gray-900">
                                {record.inspector_name}
                              </td>
                              <td className={`px-3 py-2 text-center border-r border-gray-300 font-bold ${record.non_compliant_items > 0 ? 'text-red-600 bg-red-50' : 'text-green-600'
                                }`}>
                                {record.non_compliant_items}건
                              </td>
                              {/* 동적 체크리스트 항목 셀들 */}
                              {CHECKLIST_DISPLAY_ORDER.map((item) => {
                                const value = record.checklist_items?.[item.key]
                                return (
                                  <td
                                    key={item.key}
                                    className={`px-2 py-2 text-center border-r border-gray-200 text-xs ${value === '이행' ? 'text-green-600 bg-green-50' :
                                        value === '불이행' ? 'text-red-600 bg-red-50 font-bold' :
                                          value === '해당없음' ? 'text-gray-400 bg-gray-50' :
                                            'text-gray-300'
                                      }`}
                                  >
                                    {value === '이행' ? '○' :
                                      value === '불이행' ? '✕' :
                                        value === '해당없음' ? '-' :
                                          ''}
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* 범례 */}
                    <div className="flex items-center gap-4 text-xs text-gray-500 mt-2">
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-4 h-4 bg-green-50 text-green-600 text-center rounded">○</span>
                        이행
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-4 h-4 bg-red-50 text-red-600 text-center rounded font-bold">✕</span>
                        불이행
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="inline-block w-4 h-4 bg-gray-50 text-gray-400 text-center rounded">-</span>
                        해당없음
                      </span>
                    </div>
                  </div>
                )}

                {/* 건설공사 안전관리 지침 */}
                <div className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-amber-800 mb-2">건설공사 안전관리 지침</p>
                  <p className="text-sm font-medium text-amber-700 mb-1">제25조(안전교육 내용의 기록·관리)</p>
                  <p className="text-xs text-amber-700 leading-relaxed">
                    2) 수급인은 안전교육의 내용을 기록·관리하여야 하고, 정기적으로 감독원에게 제23조 1호에 따른 종류별 안전교육 실적을 보고하여야 하며, 준공 후 안전교육의 결과를 사업부서장에게 서면으로 제출하여야 한다.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 연락처 선택 모달 */}
        {showContactSelectModal && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowContactSelectModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">연락처 선택</h3>
                <p className="text-sm text-gray-500 mt-1">전화할 대상을 선택하세요</p>
              </div>

              <div className="space-y-3">
                {/* 공사감독 */}
                {project?.supervisor_phone ? (
                  <button
                    onClick={() => {
                      setShowContactSelectModal(false)
                      setPhoneModalData({
                        name: project?.supervisor_name || '공사감독',
                        phone: project.supervisor_phone,
                        title: '공사감독 연락처'
                      })
                      setPhoneCopied(false)
                      setShowPhoneModal(true)
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">공사감독</p>
                      <p className="text-sm text-gray-500 truncate">{project?.supervisor_name || '이름 미등록'} · {project.supervisor_phone}</p>
                    </div>
                    <Phone className="h-5 w-5 text-gray-400" />
                  </button>
                ) : (
                  <div className="w-full flex items-center gap-4 px-4 py-3 bg-gray-100 rounded-lg text-left opacity-60">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-500">공사감독</p>
                      <p className="text-sm text-gray-400">연락처 미등록</p>
                    </div>
                  </div>
                )}

                {/* 현장소장 */}
                {project?.user_profiles?.phone_number ? (
                  <button
                    onClick={() => {
                      setShowContactSelectModal(false)
                      setPhoneModalData({
                        name: project?.user_profiles?.full_name || '현장소장',
                        phone: project.user_profiles.phone_number,
                        title: '현장소장 연락처'
                      })
                      setPhoneCopied(false)
                      setShowPhoneModal(true)
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3 bg-gray-50 hover:bg-blue-50 rounded-lg transition-colors text-left"
                  >
                    <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <HardHat className="h-5 w-5 text-orange-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">현장소장</p>
                      <p className="text-sm text-gray-500 truncate">{project?.user_profiles?.full_name || '이름 미등록'} · {project.user_profiles.phone_number}</p>
                    </div>
                    <Phone className="h-5 w-5 text-gray-400" />
                  </button>
                ) : (
                  <div className="w-full flex items-center gap-4 px-4 py-3 bg-gray-100 rounded-lg text-left opacity-60">
                    <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center flex-shrink-0">
                      <HardHat className="h-5 w-5 text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-500">현장소장</p>
                      <p className="text-sm text-gray-400">연락처 미등록</p>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowContactSelectModal(false)}
                className="w-full mt-4 px-4 py-3 text-gray-500 hover:text-gray-700 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        {/* 전화/복사 모달 */}
        {showPhoneModal && phoneModalData && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
            onClick={() => setShowPhoneModal(false)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Phone className="h-8 w-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{phoneModalData.title}</h3>
                <p className="text-gray-600">{phoneModalData.name}</p>
                <p className="text-xl font-bold text-gray-900 mt-2">{phoneModalData.phone}</p>
              </div>

              <div className="space-y-3">
                <a
                  href={`tel:${phoneModalData.phone}`}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Phone className="h-5 w-5" />
                  전화하기
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(phoneModalData.phone)
                      setPhoneCopied(true)
                      setTimeout(() => setPhoneCopied(false), 2000)
                    } catch (err) {
                      console.error('전화번호 복사 실패:', err)
                    }
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {phoneCopied ? (
                    <>
                      <Check className="h-5 w-5 text-green-600" />
                      <span className="text-green-600">복사됨!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-5 w-5" />
                      복사하기
                    </>
                  )}
                </button>
                <button
                  onClick={() => setShowPhoneModal(false)}
                  className="w-full px-4 py-3 text-gray-500 hover:text-gray-700 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="w-full px-4 py-6 [&_p]:!text-blue-200/70 [&_p:first-child]:!text-blue-100">
        <CopyrightNotice withDivider={false} />
      </footer>
    </div>
  )
}

