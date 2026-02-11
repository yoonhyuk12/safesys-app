'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { ArrowLeft, Plus, Users, Trash2, X, Printer } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import WorkerRegistrationModal from '@/components/project/WorkerRegistrationModal'
import { generateConsentFormPage1HTML, generateConsentFormPage2HTML, generateHealthQuestionnaireHTML, generateSafetyPledgeHTML } from '@/lib/reports/worker-documents'

interface Worker {
  id: string
  project_id: string
  name: string
  birth_date: string
  registration_number: string
  completion_date: string
  contract_start_date: string | null
  contract_end_date: string | null
  is_foreigner: boolean
  visa_type: string | null
  id_card_url: string | null
  certificate_card_url: string | null
  signature_url: string | null
  phone: string | null
  address: string | null
  agree_personal_info: boolean
  agree_unique_id: boolean
  agree_sensitive_info: boolean
  agree_cctv_collection: boolean
  agree_cctv_third_party: boolean
  agree_safety_pledge: boolean
  health_questionnaire: Record<string, unknown> | null
  safety_equipment: Record<string, unknown> | null
  created_at: string
}

// 만나이 계산 함수
function calculateAge(birthDate: string): number {
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }

  return age
}

// 날짜 포맷 함수
function formatDate(dateString: string): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function WorkerManagementPage() {
  const { user, userProfile, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const projectId = params.id as string
  const returnUrl = searchParams.get('returnUrl')

  const [project, setProject] = useState<any>(null)
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [deleteMode, setDeleteMode] = useState(false)
  const [printMode, setPrintMode] = useState(false)
  const [selectedWorkers, setSelectedWorkers] = useState<Set<string>>(new Set())
  const [selectedForPrint, setSelectedForPrint] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null)

  useEffect(() => {
    if (user && projectId) {
      loadData()
    }
  }, [user, projectId])

  const loadData = async () => {
    try {
      setLoading(true)
      setError('')

      // 프로젝트 정보 조회
      const { data: projectData, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError) throw new Error(projectError.message)
      setProject(projectData)

      // 근로자 목록 조회
      const { data: workersData, error: workersError } = await supabase
        .from('workers')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (workersError) {
        // 테이블이 없을 수 있음
        console.error('Workers load error:', workersError)
        setWorkers([])
      } else {
        setWorkers((workersData || []) as unknown as Worker[])
      }
    } catch (err: any) {
      console.error('데이터 로드 실패:', err)
      setError(err.message || '데이터를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    if (returnUrl) {
      router.push(returnUrl)
    } else {
      router.push(`/project/${projectId}`)
    }
  }

  const handleAddWorker = () => {
    setSelectedWorker(null)
    setIsModalOpen(true)
  }

  const handleEditWorker = (worker: Worker) => {
    if (deleteMode || printMode) return
    setSelectedWorker(worker)
    setIsModalOpen(true)
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
  }

  const handleWorkerAdded = () => {
    setIsModalOpen(false)
    setSelectedWorker(null)
    loadData()
  }

  const toggleDeleteMode = () => {
    if (deleteMode) {
      setSelectedWorkers(new Set())
    }
    setDeleteMode(!deleteMode)
  }

  const toggleWorkerSelection = (workerId: string) => {
    const newSelected = new Set(selectedWorkers)
    if (newSelected.has(workerId)) {
      newSelected.delete(workerId)
    } else {
      newSelected.add(workerId)
    }
    setSelectedWorkers(newSelected)
  }

  const toggleAllWorkers = () => {
    if (selectedWorkers.size === workers.length) {
      setSelectedWorkers(new Set())
    } else {
      setSelectedWorkers(new Set(workers.map(w => w.id)))
    }
  }

  // 프린트 모드 토글
  const togglePrintMode = () => {
    if (printMode) {
      setSelectedForPrint(new Set())
    }
    setPrintMode(!printMode)
  }

  const togglePrintSelection = (workerId: string) => {
    const newSelected = new Set(selectedForPrint)
    if (newSelected.has(workerId)) {
      newSelected.delete(workerId)
    } else {
      newSelected.add(workerId)
    }
    setSelectedForPrint(newSelected)
  }

  const toggleAllForPrint = () => {
    if (selectedForPrint.size === workers.length) {
      setSelectedForPrint(new Set())
    } else {
      setSelectedForPrint(new Set(workers.map(w => w.id)))
    }
  }

  const handleDeleteWorkers = async () => {
    if (selectedWorkers.size === 0) return

    const confirmMessage = `선택한 ${selectedWorkers.size}명의 근로자를 삭제하시겠습니까?`
    if (!confirm(confirmMessage)) return

    try {
      setDeleting(true)

      // 삭제할 근로자들의 정보 가져오기
      const workersToDelete = workers.filter(w => selectedWorkers.has(w.id))

      // Storage에서 파일 삭제
      const filesToDelete: string[] = []
      for (const worker of workersToDelete) {
        // 신분증 파일 경로 추출
        if (worker.id_card_url) {
          const idCardPath = extractStoragePath(worker.id_card_url)
          if (idCardPath) filesToDelete.push(idCardPath)
        }
        // 이수증 파일 경로 추출
        if (worker.certificate_card_url) {
          const certPath = extractStoragePath(worker.certificate_card_url)
          if (certPath) filesToDelete.push(certPath)
        }
        // 서명 파일 경로 추출
        if (worker.signature_url) {
          const sigPath = extractStoragePath(worker.signature_url)
          if (sigPath) filesToDelete.push(sigPath)
        }
      }

      // Storage 파일 삭제
      if (filesToDelete.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('worker-id-cards')
          .remove(filesToDelete)

        if (storageError) {
          console.error('Storage 파일 삭제 실패:', storageError)
          // Storage 삭제 실패해도 계속 진행 (DB 레코드는 삭제)
        } else {
          console.log(`${filesToDelete.length}개의 파일 삭제 완료`)
        }
      }

      // DB에서 근로자 레코드 삭제
      const { error: deleteError } = await supabase
        .from('workers')
        .delete()
        .in('id', Array.from(selectedWorkers))

      if (deleteError) throw deleteError

      setSelectedWorkers(new Set())
      setDeleteMode(false)
      loadData()
    } catch (err: any) {
      console.error('근로자 삭제 실패:', err)
      alert('삭제에 실패했습니다: ' + (err.message || '알 수 없는 오류'))
    } finally {
      setDeleting(false)
    }
  }

  // Storage URL에서 파일 경로 추출 헬퍼 함수
  const extractStoragePath = (url: string): string | null => {
    try {
      // URL 형식: https://[project_ref].supabase.co/storage/v1/object/public/worker-id-cards/[path]
      const match = url.match(/\/worker-id-cards\/(.+)$/)
      return match ? match[1] : null
    } catch (err) {
      console.error('URL 파싱 실패:', err)
      return null
    }
  }

  // PDF 출력 함수
  const handleExportPDF = async () => {
    if (selectedForPrint.size === 0) {
      alert('출력할 근로자를 선택해주세요.')
      return
    }

    const selectedWorkersList = workers.filter(w => selectedForPrint.has(w.id))

    try {
      setExporting(true)

      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      // 이미지 로드 대기 함수
      const waitForImages = async (container: HTMLElement) => {
        const images = Array.from(container.querySelectorAll('img'))
        await Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve()
          return new Promise(resolve => {
            img.onload = resolve
            img.onerror = resolve
          })
        }))
      }

      // HTML을 캡처하여 PDF 페이지로 추가하는 헬퍼
      const addHTMLPage = async (pdf: InstanceType<typeof jsPDF>, html: string, isFirstPage: boolean) => {
        const container = document.createElement('div')
        container.style.position = 'fixed'
        container.style.left = '-9999px'
        container.style.top = '0'
        container.innerHTML = html
        document.body.appendChild(container)

        await waitForImages(container)

        const canvas = await html2canvas(container, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff'
        })

        const imgData = canvas.toDataURL('image/jpeg', 1.0)
        const imgWidth = 210
        const imgHeight = (canvas.height * imgWidth) / canvas.width

        if (!isFirstPage) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, imgHeight)

        document.body.removeChild(container)
      }

      // 프로젝트 데이터 (관리책임자 포함)
      const projectData = {
        project_name: project?.project_name || '',
        privacy_manager_name: project?.privacy_manager_name || null,
        privacy_manager_position: project?.privacy_manager_position || null,
        privacy_manager_email: project?.privacy_manager_email || null,
        privacy_manager_phone: project?.privacy_manager_phone || null,
      }

      const pdf = new jsPDF('p', 'mm', 'a4')
      let isFirstPage = true

      for (let i = 0; i < selectedWorkersList.length; i++) {
        const worker = selectedWorkersList[i]

        // === 페이지 1: 인원등록부 ===
        const registrationHTML = `
          <div style="width: 794px; padding: 40px; background-color: white; font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;">
            <div style="border: 2px solid #334155; padding: 20px; position: relative;">
              <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #334155; padding-bottom: 15px;">
                <h1 style="font-size: 28px; font-weight: 800; color: #1e293b; margin: 0; letter-spacing: 5px;">인 원 등 록 부</h1>
              </div>

              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; margin-bottom: 20px; font-weight: 600;">
                현장명: <span style="color: #2563eb; margin-left: 8px;">${project?.project_name || '-'}</span>
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 25px;">
                <div>
                  <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-size: 13px; font-weight: 700; border-bottom: none;">기초안전보건교육 이수증</div>
                  <div style="border: 1px solid #cbd5e1; height: 180px; display: flex; align-items: center; justify-content: center; overflow: hidden; background-color: #fcfcfc;">
                    ${worker.certificate_card_url
            ? `<img src="${worker.certificate_card_url}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`
            : '<span style="color: #94a3b8; font-size: 12px;">미등록</span>'}
                  </div>
                </div>
                <div>
                  <div style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px; text-align: center; font-size: 13px; font-weight: 700; border-bottom: none;">신분증 사진</div>
                  <div style="border: 1px solid #cbd5e1; height: 180px; display: flex; align-items: center; justify-content: center; overflow: hidden; background-color: #fcfcfc;">
                    ${worker.id_card_url
            ? `<img src="${worker.id_card_url}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />`
            : '<span style="color: #94a3b8; font-size: 12px;">미등록</span>'}
                  </div>
                </div>
              </div>

              <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; table-layout: fixed;">
                <tr>
                  <th style="width: 20%; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">성 명</th>
                  <td style="width: 30%; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px;">${worker.name}</td>
                  <th style="width: 20%; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">구 분</th>
                  <td style="width: 30%; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px;">${worker.is_foreigner ? '외국인' : '내국인'}${worker.is_foreigner && worker.visa_type ? ` (${worker.visa_type})` : ''}</td>
                </tr>
                <tr>
                  <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">생년월일</th>
                  <td style="border: 1px solid #cbd5e1; padding: 10px; font-size: 13px;">${formatDate(worker.birth_date)}</td>
                  <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">나이(만)</th>
                  <td style="border: 1px solid #cbd5e1; padding: 10px; font-size: 13px;">${worker.birth_date ? calculateAge(worker.birth_date) + '세' : '-'}</td>
                </tr>
                <tr>
                  <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">등록번호</th>
                  <td colspan="3" style="border: 1px solid #cbd5e1; padding: 10px; font-size: 13px;">${worker.registration_number || '-'}</td>
                </tr>
                <tr>
                  <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">이수일자</th>
                  <td colspan="3" style="border: 1px solid #cbd5e1; padding: 10px; font-size: 13px;">${formatDate(worker.completion_date)}</td>
                </tr>
                <tr>
                  <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">근로계약기간</th>
                  <td colspan="3" style="border: 1px solid #cbd5e1; padding: 10px; font-size: 13px;">${formatDate(worker.contract_start_date || '')} ~ ${formatDate(worker.contract_end_date || '')}</td>
                </tr>
                <tr>
                  <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">등록일자</th>
                  <td colspan="3" style="border: 1px solid #cbd5e1; padding: 10px; font-size: 13px;">${formatDate(worker.created_at)}</td>
                </tr>
                <tr>
                  <th style="height: 80px; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">서 명</th>
                  <td colspan="3" style="border: 1px solid #cbd5e1; padding: 10px; vertical-align: middle;">
                    ${worker.signature_url
            ? `<img src="${worker.signature_url}" style="height: 60px; object-fit: contain;" />`
            : '<span style="color: #94a3b8; font-size: 12px;">서명 없음</span>'}
                  </td>
                </tr>
                <tr>
                  <th style="height: 80px; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; font-size: 13px; text-align: center; font-weight: 700;">비 고</th>
                  <td colspan="3" style="border: 1px solid #cbd5e1; padding: 10px;"></td>
                </tr>
              </table>

            </div>
          </div>
        `

        await addHTMLPage(pdf, registrationHTML, isFirstPage)
        isFirstPage = false

        // === 페이지 2: 동의서 (1/2) - 개인정보·고유식별·민감정보 ===
        const consentPage1HTML = generateConsentFormPage1HTML(worker, projectData)
        await addHTMLPage(pdf, consentPage1HTML, false)

        // === 페이지 3: 동의서 (2/2) - CCTV ===
        const consentPage2HTML = generateConsentFormPage2HTML(worker, projectData)
        await addHTMLPage(pdf, consentPage2HTML, false)

        // === 페이지 4: 건강문진표 ===
        const healthHTML = generateHealthQuestionnaireHTML(worker, projectData)
        await addHTMLPage(pdf, healthHTML, false)

        // === 페이지 5: 안전서약서 ===
        const pledgeHTML = generateSafetyPledgeHTML(worker, projectData)
        await addHTMLPage(pdf, pledgeHTML, false)
      }

      const fileName = selectedWorkersList.length === 1
        ? `근로자서류_${selectedWorkersList[0].name}_${new Date().toISOString().split('T')[0]}.pdf`
        : `근로자서류_일괄_${selectedWorkersList.length}명_${new Date().toISOString().split('T')[0]}.pdf`

      pdf.save(fileName)

      alert(`${selectedWorkersList.length}명의 근로자 서류(5종)가 다운로드되었습니다.`)

      setSelectedForPrint(new Set())
      setPrintMode(false)

    } catch (err: any) {
      console.error('PDF 출력 실패:', err)
      alert('PDF 출력에 실패했습니다.')
    } finally {
      setExporting(false)
    }
  }

  // 초기 로딩 시에만 로딩 스피너 표시 (모달이 열려있으면 유지)
  if ((authLoading || loading) && !isModalOpen) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (!user && !authLoading) {
    router.push('/login')
    return null
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex items-center h-16">
              <button
                onClick={handleBack}
                className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h1 className="text-xl font-bold text-gray-900">근로자 관리대장</h1>
            </div>
          </div>
        </header>
        <main className="max-w-7xl mx-auto py-6 px-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="text-sm text-red-700">{error}</div>
            <button
              onClick={loadData}
              className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
            >
              다시 시도
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900">
      {/* 헤더 */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-4">
          <div className="flex items-center h-16">
            <button
              onClick={handleBack}
              className="mr-4 p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <Users className="h-6 w-6 text-blue-600 mr-3" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">근로자 관리대장</h1>
              <p className="text-sm text-gray-500">{project?.project_name}</p>
            </div>
          </div>
        </div>
      </header>

      {/* 메인 콘텐츠 */}
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          {/* 테이블 헤더 영역 */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              근로자 목록 <span className="text-gray-500 font-normal">({workers.length}명)</span>
              {deleteMode && selectedWorkers.size > 0 && (
                <span className="ml-2 text-red-600 font-normal">({selectedWorkers.size}명 선택됨)</span>
              )}
              {printMode && selectedForPrint.size > 0 && (
                <span className="ml-2 text-green-600 font-normal">({selectedForPrint.size}명 선택됨)</span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {deleteMode ? (
                <>
                  <button
                    onClick={toggleDeleteMode}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <X className="h-5 w-5" />
                    <span>취소</span>
                  </button>
                  <button
                    onClick={handleDeleteWorkers}
                    disabled={selectedWorkers.size === 0 || deleting}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Trash2 className="h-5 w-5" />
                    <span>{deleting ? '삭제 중...' : '삭제'}</span>
                  </button>
                </>
              ) : printMode ? (
                <>
                  <button
                    onClick={togglePrintMode}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <X className="h-5 w-5" />
                    <span>취소</span>
                  </button>
                  <button
                    onClick={handleExportPDF}
                    disabled={selectedForPrint.size === 0 || exporting}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Printer className="h-5 w-5" />
                    <span>{exporting ? '출력 중...' : '출력'}</span>
                  </button>
                </>
              ) : (
                <>
                  {workers.length > 0 && (
                    <>
                      <button
                        onClick={togglePrintMode}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                        title="엑셀 출력"
                      >
                        <Printer className="h-5 w-5" />
                      </button>
                      <button
                        onClick={toggleDeleteMode}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleAddWorker}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </div>
          {workers.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-4">등록된 근로자가 없습니다.</p>
              <button
                onClick={handleAddWorker}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-5 w-5" />
                근로자 등록하기
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {deleteMode && (
                      <th className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedWorkers.size === workers.length && workers.length > 0}
                          onChange={toggleAllWorkers}
                          className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                        />
                      </th>
                    )}
                    {printMode && (
                      <th className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedForPrint.size === workers.length && workers.length > 0}
                          onChange={toggleAllForPrint}
                          className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                        />
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      이름
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      구분
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      생년월일
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      나이(만)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      등록번호
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      이수일자
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      근로계약 기간
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {workers.map((worker) => (
                    <tr
                      key={worker.id}
                      className={`hover:bg-gray-50 ${deleteMode && selectedWorkers.has(worker.id) ? 'bg-red-50' :
                        printMode && selectedForPrint.has(worker.id) ? 'bg-green-50' : ''
                        }`}
                      onClick={
                        deleteMode ? () => toggleWorkerSelection(worker.id) :
                          printMode ? () => togglePrintSelection(worker.id) :
                            () => handleEditWorker(worker)
                      }
                      style={{ cursor: 'pointer' }}
                    >
                      {deleteMode && (
                        <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedWorkers.has(worker.id)}
                            onChange={() => toggleWorkerSelection(worker.id)}
                            className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                          />
                        </td>
                      )}
                      {printMode && (
                        <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedForPrint.has(worker.id)}
                            onChange={() => togglePrintSelection(worker.id)}
                            className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <span className="flex items-center gap-1.5">
                          {worker.name}
                          {worker.birth_date && calculateAge(worker.birth_date) >= 65 && (
                            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 border border-red-300 rounded">고령</span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <span className={`px-2 py-1 text-xs rounded-full ${worker.is_foreigner ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                            {worker.is_foreigner ? '외국인' : '내국인'}
                          </span>
                          {worker.is_foreigner && worker.visa_type && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700 rounded">
                              {worker.visa_type}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(worker.birth_date)}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm ${worker.birth_date && calculateAge(worker.birth_date) >= 65 ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                        {worker.birth_date ? `${calculateAge(worker.birth_date)}세` : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {worker.registration_number || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(worker.completion_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {worker.contract_start_date || worker.contract_end_date
                          ? `${formatDate(worker.contract_start_date || '')} ~ ${formatDate(worker.contract_end_date || '')}`
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* 근로자 등록 모달 */}
      <WorkerRegistrationModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSuccess={handleWorkerAdded}
        projectId={projectId}
        projectName={project?.project_name || ''}
        privacyManager={{
          name: project?.privacy_manager_name || '',
          position: project?.privacy_manager_position || '',
          email: project?.privacy_manager_email || '',
          phone: project?.privacy_manager_phone || '',
        }}
        workerToEdit={selectedWorker}
      />
    </div>
  )
}
