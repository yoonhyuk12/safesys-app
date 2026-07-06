'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { HEADQUARTERS_OPTIONS, BRANCH_OPTIONS, PROJECT_CATEGORY_OPTIONS } from '@/lib/constants'
import { updateProject } from '@/lib/projects'
import { Project } from '@/lib/projects'
import { Building, Save, MapPin, ChevronDown, ChevronUp, Send } from 'lucide-react'
import VworldAddressSearch from '@/components/ui/VworldAddressSearch'
import G2bContractLookup, { G2bContractApplyData } from '@/components/project/G2bContractLookup'

interface FormData {
  project_name: string
  managing_hq: string
  managing_branch: string
  site_address: string
  site_address_detail: string
  latitude?: number
  longitude?: number
  // 선택사항
  project_category?: string
  total_budget?: string
  current_year_budget?: string
  supervisor_position?: string
  supervisor_name?: string
  supervisor_phone?: string
  actual_work_address?: string
  construction_law_safety_plan?: boolean
  industrial_law_safety_ledger?: boolean
  disaster_prevention_target?: boolean
  business_card_pdf_url?: string
  client_telegram_id?: string
  contractor_telegram_id?: string
  // 공사기간 (작업일보 공정률 계산: 착공일 0% → 준공일 100%)
  construction_start_date?: string
  construction_end_date?: string
  // 개인정보 관리책임자
  privacy_manager_name?: string
  privacy_manager_position?: string
  privacy_manager_email?: string
  privacy_manager_phone?: string
  // 나라장터 계약 연계
  g2b_cntrct_no?: string
  g2b_ntce_no?: string
}

interface ProjectEditFormProps {
  project: Project
  onCancel?: () => void
}

const ProjectEditForm: React.FC<ProjectEditFormProps> = ({ project, onCancel }) => {
  const router = useRouter()
  const { user, userProfile } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isOptionalExpanded, setIsOptionalExpanded] = useState(false)
  const [telegramTestLoading, setTelegramTestLoading] = useState<'client' | 'contractor' | null>(null)
  const [telegramTestResult, setTelegramTestResult] = useState<{ type: 'client' | 'contractor', success: boolean, message: string } | null>(null)
  const [formData, setFormData] = useState<FormData>({
    project_name: project.project_name || '',
    managing_hq: project.managing_hq || '',
    managing_branch: project.managing_branch || '',
    site_address: project.site_address || '',
    site_address_detail: project.site_address_detail || '',
    latitude: project.latitude || undefined,
    longitude: project.longitude || undefined,
    project_category: project.project_category || '',
    total_budget: project.total_budget || '',
    current_year_budget: project.current_year_budget || '',
    supervisor_position: project.supervisor_position || '',
    supervisor_name: project.supervisor_name || '',
    supervisor_phone: (project as any).supervisor_phone || '',
    actual_work_address: project.actual_work_address || '',
    construction_law_safety_plan: project.construction_law_safety_plan || false,
    industrial_law_safety_ledger: project.industrial_law_safety_ledger || false,
    disaster_prevention_target: project.disaster_prevention_target || false,
    business_card_pdf_url: project.business_card_pdf_url || '',
    client_telegram_id: (project as any).client_telegram_id || '',
    contractor_telegram_id: (project as any).contractor_telegram_id || '',
    construction_start_date: project.construction_start_date || '',
    construction_end_date: project.construction_end_date || '',
    privacy_manager_name: project.privacy_manager_name || '',
    privacy_manager_position: project.privacy_manager_position || '',
    privacy_manager_email: project.privacy_manager_email || '',
    privacy_manager_phone: project.privacy_manager_phone || '',
    g2b_cntrct_no: project.g2b_cntrct_no || '',
    g2b_ntce_no: project.g2b_ntce_no || ''
  })

  // 천단위 쉼표 포맷팅 함수
  const formatNumberWithCommas = (value: string): string => {
    // 숫자와 쉼표만 남기고 제거
    const numericValue = value.replace(/[^\d]/g, '')
    if (!numericValue) return ''
    // 천단위 쉼표 추가
    return Number(numericValue).toLocaleString('ko-KR')
  }

  // 초기 값 포맷팅 (마운트 시)
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      total_budget: formatNumberWithCommas(prev.total_budget || ''),
      current_year_budget: formatNumberWithCommas(prev.current_year_budget || '')
    }))
  }, [])

  // 선택된 본부에 따른 지사 옵션 필터링
  const filteredBranches = formData.managing_hq
    ? BRANCH_OPTIONS[formData.managing_hq] || []
    : []

  // 쉼표 제거하여 순수 숫자 반환
  const removeCommas = (value: string): string => {
    return value.replace(/,/g, '')
  }

  // 나라장터 계약 조회 결과를 폼에 적용 (총계약금액 원 → 총사업비 백만원, 수요기관 → 본부·지사)
  const handleG2bApply = (data: G2bContractApplyData) => {
    setFormData(prev => ({
      ...prev,
      project_name: data.projectName || prev.project_name,
      total_budget: data.totalBudget > 0
        ? formatNumberWithCommas(String(Math.round(data.totalBudget / 1_000_000)))
        : prev.total_budget,
      construction_start_date: data.startDate || prev.construction_start_date,
      construction_end_date: data.endDate || prev.construction_end_date,
      managing_hq: data.managingHq || prev.managing_hq,
      managing_branch: data.managingBranch || (data.managingHq ? '' : prev.managing_branch),
      g2b_cntrct_no: data.cntrctNo,
      g2b_ntce_no: data.ntceNo
    }))
  }

  // 전화번호 포맷팅 (010-1234-5678 형식)
  const formatPhoneNumber = (value: string): string => {
    // 숫자만 추출
    const numbers = value.replace(/[^\d]/g, '')

    // 11자리 이상이면 앞 11자리만 사용
    const trimmed = numbers.slice(0, 11)

    // 하이픈 자동 삽입
    if (trimmed.length <= 3) {
      return trimmed
    } else if (trimmed.length <= 7) {
      return `${trimmed.slice(0, 3)}-${trimmed.slice(3)}`
    } else {
      return `${trimmed.slice(0, 3)}-${trimmed.slice(3, 7)}-${trimmed.slice(7)}`
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target

    if (name === 'managing_hq') {
      // 본부가 변경되면 지사 초기화
      setFormData(prev => ({
        ...prev,
        [name]: value,
        managing_branch: ''
      }))
    } else if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked
      setFormData(prev => ({
        ...prev,
        [name]: checked
      }))
    } else if (name === 'total_budget' || name === 'current_year_budget') {
      // 금액 필드는 쉼표 포맷팅 적용
      const formattedValue = formatNumberWithCommas(value)
      setFormData(prev => ({
        ...prev,
        [name]: formattedValue
      }))
    } else if (name === 'supervisor_phone' || name === 'privacy_manager_phone') {
      // 전화번호는 하이픈 자동 포맷팅 적용
      const formattedPhone = formatPhoneNumber(value)
      setFormData(prev => ({
        ...prev,
        [name]: formattedPhone
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  // 텔레그램 테스트 발송
  const handleTelegramTest = async (type: 'client' | 'contractor') => {
    const chatId = type === 'client' ? formData.client_telegram_id : formData.contractor_telegram_id
    const label = type === 'client' ? '발주청' : '시공사'

    if (!chatId?.trim()) {
      setTelegramTestResult({
        type,
        success: false,
        message: `${label} 텔레그램 ID를 입력해주세요.`
      })
      return
    }

    setTelegramTestLoading(type)
    setTelegramTestResult(null)

    try {
      const response = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'direct',
          chatId: chatId.trim(),
          message: `✅ <b>SafeSys 테스트 메시지</b>\n\n🏗️ 현장: ${formData.project_name || '(미입력)'}\n👤 수신자: ${label}\n\n이 메시지가 정상적으로 수신되었다면 텔레그램 알림 설정이 완료된 것입니다.`
        })
      })

      const result = await response.json()

      if (result.ok) {
        const idCount = chatId.trim().split(',').filter((id: string) => id.trim()).length
        setTelegramTestResult({
          type,
          success: true,
          message: idCount > 1 ? `${label} ${idCount}명 테스트 발송 성공!` : `${label} 테스트 발송 성공!`
        })
      } else {
        setTelegramTestResult({
          type,
          success: false,
          message: result.description || '발송 실패. ID를 확인해주세요.'
        })
      }
    } catch (err) {
      setTelegramTestResult({
        type,
        success: false,
        message: '네트워크 오류가 발생했습니다.'
      })
    } finally {
      setTelegramTestLoading(null)
    }
  }

  const handleAddressSelect = (address: string, roadAddress: string, coords?: { lat: number, lng: number }) => {
    setFormData(prev => ({
      ...prev,
      site_address: roadAddress || address, // 도로명주소 우선, 없으면 지번주소
      latitude: coords?.lat,
      longitude: coords?.lng
    }))

    // 좌표 정보 저장 확인
    if (coords) {
      console.log('선택된 주소 좌표 저장:', coords)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    // 유효성 검사
    if (!formData.project_name.trim()) {
      setError('사업명을 입력해주세요.')
      setLoading(false)
      return
    }

    if (!formData.managing_hq) {
      setError('관할 본부를 선택해주세요.')
      setLoading(false)
      return
    }

    if (!formData.managing_branch) {
      setError('관할 지사를 선택해주세요.')
      setLoading(false)
      return
    }

    if (!user) {
      setError('로그인이 필요합니다.')
      setLoading(false)
      return
    }

    if (formData.construction_start_date && formData.construction_end_date &&
        formData.construction_start_date > formData.construction_end_date) {
      setError('착공일이 준공일보다 늦을 수 없습니다.')
      setLoading(false)
      return
    }

    try {
      await updateProject(project.id, {
        project_name: formData.project_name.trim(),
        managing_hq: formData.managing_hq,
        managing_branch: formData.managing_branch,
        site_address: formData.site_address,
        site_address_detail: formData.site_address_detail.trim(),
        latitude: formData.latitude,
        longitude: formData.longitude,
        // 선택사항
        project_category: formData.project_category?.trim() || undefined,
        total_budget: removeCommas(formData.total_budget || '') || undefined,
        current_year_budget: removeCommas(formData.current_year_budget || '') || undefined,
        supervisor_position: formData.supervisor_position?.trim() || undefined,
        supervisor_name: formData.supervisor_name?.trim() || undefined,
        supervisor_phone: formData.supervisor_phone?.trim() || undefined,
        actual_work_address: formData.actual_work_address?.trim() || undefined,
        construction_law_safety_plan: formData.construction_law_safety_plan,
        industrial_law_safety_ledger: formData.industrial_law_safety_ledger,
        disaster_prevention_target: formData.disaster_prevention_target,
        business_card_pdf_url: formData.business_card_pdf_url?.trim() || undefined,
        client_telegram_id: formData.client_telegram_id?.trim() || null,
        contractor_telegram_id: formData.contractor_telegram_id?.trim() || null,
        construction_start_date: formData.construction_start_date || null,
        construction_end_date: formData.construction_end_date || null,
        privacy_manager_name: formData.privacy_manager_name?.trim() || undefined,
        privacy_manager_position: formData.privacy_manager_position?.trim() || undefined,
        privacy_manager_email: formData.privacy_manager_email?.trim() || undefined,
        privacy_manager_phone: formData.privacy_manager_phone?.trim() || undefined,
        // 빈 값이면 필드 자체를 생략 — DB 컬럼(마이그레이션) 적용 전에도 기존 수정이 깨지지 않도록
        g2b_cntrct_no: formData.g2b_cntrct_no?.trim() || undefined,
        g2b_ntce_no: formData.g2b_ntce_no?.trim() || undefined
      })

      alert('프로젝트가 성공적으로 수정되었습니다!')
      // 저장 후 이전 화면으로 복귀.
      // 대시보드에서 진입한 경우 저장된 경로로 이동(스크롤 위치도 복원), 그 외(프로젝트 상세 등)는 직전 화면으로 돌아간다.
      const returnPath = typeof window !== 'undefined'
        ? sessionStorage.getItem('dashboard-return-path')
        : null
      if (returnPath) {
        router.push(returnPath)
      } else {
        router.back()
      }
    } catch (err: any) {
      console.error('Project update error:', err)
      setError(err.message || '프로젝트 수정에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 오류 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                오류가 발생했습니다
              </h3>
              <div className="mt-2 text-sm text-red-700">
                {error}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 나라장터 계약 연계 */}
      <G2bContractLookup
        initialNo={project.g2b_cntrct_no || project.g2b_ntce_no || ''}
        disabled={loading}
        onApply={handleG2bApply}
      />

      {/* 사업명 */}
      <div>
        <label htmlFor="project_name" className="block text-sm font-medium text-gray-700 mb-2">
          사업명 <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Building className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
          <input
            type="text"
            id="project_name"
            name="project_name"
            value={formData.project_name}
            onChange={handleInputChange}
            placeholder="예: 강남 아파트 건설공사"
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={loading}
          />
        </div>
      </div>

      {/* 현장 주소 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          현장 주소
        </label>
        <div className="space-y-3">
          <VworldAddressSearch
            onAddressSelect={handleAddressSelect}
            placeholder="주소를 검색해주세요"
            value={formData.site_address}
            disabled={loading}
          />
          {formData.site_address && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start">
                <MapPin className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-blue-900">선택된 주소</p>
                  <p className="text-sm text-blue-700">{formData.site_address}</p>
                </div>
              </div>
            </div>
          )}
          <input
            type="text"
            name="site_address_detail"
            value={formData.site_address_detail}
            onChange={handleInputChange}
            placeholder="상세주소 (동, 호수 등)"
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={loading}
          />
        </div>
      </div>

      {/* 관할 본부/지사 */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* 관할 본부 */}
        <div>
          <label htmlFor="managing_hq" className="block text-sm font-medium text-gray-700 mb-2">
            관할 본부 <span className="text-red-500">*</span>
          </label>
          <select
            id="managing_hq"
            name="managing_hq"
            value={formData.managing_hq}
            onChange={handleInputChange}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={loading}
          >
            <option value="">본부를 선택해주세요</option>
            {HEADQUARTERS_OPTIONS.map((hq) => (
              <option key={hq} value={hq}>
                {hq}
              </option>
            ))}
          </select>
        </div>

        {/* 관할 지사 */}
        <div>
          <label htmlFor="managing_branch" className="block text-sm font-medium text-gray-700 mb-2">
            관할 지사 <span className="text-red-500">*</span>
          </label>
          <select
            id="managing_branch"
            name="managing_branch"
            value={formData.managing_branch}
            onChange={handleInputChange}
            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            disabled={loading || !formData.managing_hq}
          >
            <option value="">
              {formData.managing_hq ? '지사를 선택해주세요' : '먼저 본부를 선택해주세요'}
            </option>
            {filteredBranches.map((branch) => (
              <option key={branch} value={branch}>
                {branch}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 선택사항 섹션 */}
      <div className="border-t border-gray-200 pt-6">
        <button
          type="button"
          onClick={() => setIsOptionalExpanded(!isOptionalExpanded)}
          className="flex items-center justify-between w-full text-left mb-4 bg-gradient-to-r from-yellow-100 to-yellow-50 hover:from-yellow-200 hover:to-yellow-100 p-4 rounded-lg border-2 border-yellow-400 shadow-sm transition-all"
        >
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-yellow-400 text-yellow-900 text-sm font-bold rounded-md shadow-sm">
              선택사항
            </span>
            <span className="text-sm text-yellow-800 font-medium">
              {isOptionalExpanded ? '접기' : '추가 정보 입력 (클릭하여 펼치기)'}
            </span>
          </div>
          {isOptionalExpanded ? (
            <ChevronUp className="h-6 w-6 text-yellow-700" />
          ) : (
            <ChevronDown className="h-6 w-6 text-yellow-700" />
          )}
        </button>

        {isOptionalExpanded && (
          <div className="space-y-4 p-4 bg-yellow-50/50 border-l-4 border-yellow-400 rounded-r-lg">
            {/* 착공일/준공일 — 작업일보 공정률 자동 계산 기준 (착공일 0% → 준공일 100%) */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label htmlFor="construction_start_date" className="block text-sm font-medium text-gray-700 mb-2">
                  착공일 <span className="text-xs text-gray-500 font-normal">(공정률 0%)</span>
                </label>
                <input
                  type="date"
                  id="construction_start_date"
                  name="construction_start_date"
                  value={formData.construction_start_date || ''}
                  onChange={handleInputChange}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="construction_end_date" className="block text-sm font-medium text-gray-700 mb-2">
                  준공일 <span className="text-xs text-gray-500 font-normal">(공정률 100%)</span>
                </label>
                <input
                  type="date"
                  id="construction_end_date"
                  name="construction_end_date"
                  value={formData.construction_end_date || ''}
                  onChange={handleInputChange}
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={loading}
                />
              </div>
            </div>
            <p className="text-xs text-gray-500 -mt-2">
              작업일보의 공정률이 공사기간 기준으로 자동 계산됩니다.
            </p>

            {/* 사업분류 */}
            <div>
              <label htmlFor="project_category" className="block text-sm font-medium text-gray-700 mb-2">
                사업분류
              </label>
              <select
                id="project_category"
                name="project_category"
                value={formData.project_category || ''}
                onChange={handleInputChange}
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                disabled={loading}
              >
                <option value="">사업분류를 선택해주세요</option>
                {PROJECT_CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            {/* 총사업비/당해년도사업비 */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label htmlFor="total_budget" className="block text-sm font-medium text-gray-700 mb-2">
                  총사업비 (백만원)
                </label>
                <input
                  type="text"
                  id="total_budget"
                  name="total_budget"
                  value={formData.total_budget}
                  onChange={handleInputChange}
                  placeholder="예: 5,000"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="current_year_budget" className="block text-sm font-medium text-gray-700 mb-2">
                  당해년도사업비 (백만원)
                </label>
                <input
                  type="text"
                  id="current_year_budget"
                  name="current_year_budget"
                  value={formData.current_year_budget}
                  onChange={handleInputChange}
                  placeholder="예: 1,200"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            {/* 공사감독 - 직급(좁게), 이름, 연락처 */}
            <div className="grid grid-cols-[80px_1fr_1fr] gap-3 sm:gap-4">
              <div>
                <label htmlFor="supervisor_position" className="block text-sm font-medium text-gray-700 mb-2">
                  직급
                </label>
                <select
                  id="supervisor_position"
                  name="supervisor_position"
                  value={formData.supervisor_position}
                  onChange={handleInputChange}
                  className="block w-full px-2 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={loading}
                >
                  <option value="">선택</option>
                  <option value="1급">1급</option>
                  <option value="2급">2급</option>
                  <option value="3급">3급</option>
                  <option value="4급">4급</option>
                  <option value="5급">5급</option>
                  <option value="6급">6급</option>
                  <option value="7급">7급</option>
                </select>
              </div>
              <div>
                <label htmlFor="supervisor_name" className="block text-sm font-medium text-gray-700 mb-2">
                  공사감독 이름
                </label>
                <input
                  type="text"
                  id="supervisor_name"
                  name="supervisor_name"
                  value={formData.supervisor_name}
                  onChange={handleInputChange}
                  placeholder="예: 홍길동"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={loading}
                />
              </div>
              <div>
                <label htmlFor="supervisor_phone" className="block text-sm font-medium text-gray-700 mb-2">
                  연락처
                </label>
                <input
                  type="tel"
                  id="supervisor_phone"
                  name="supervisor_phone"
                  value={formData.supervisor_phone}
                  onChange={handleInputChange}
                  placeholder="010-1234-5678"
                  className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={loading}
                />
              </div>
            </div>

            {/* 실제작업주소 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                실제작업주소
              </label>
              <VworldAddressSearch
                onAddressSelect={(address: string, roadAddress: string) => {
                  setFormData(prev => ({
                    ...prev,
                    actual_work_address: roadAddress || address
                  }))
                }}
                placeholder="현장주소와 다른 경우 검색"
                value={formData.actual_work_address || ''}
                disabled={loading}
              />
              {formData.actual_work_address && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="flex items-start">
                    <MapPin className="h-5 w-5 text-blue-600 mr-2 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900">선택된 실제작업주소</p>
                      <p className="text-sm text-blue-700">{formData.actual_work_address}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 체크박스 항목들 */}
            <div className="space-y-3 mb-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="construction_law_safety_plan"
                  name="construction_law_safety_plan"
                  checked={formData.construction_law_safety_plan}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled={loading}
                />
                <label htmlFor="construction_law_safety_plan" className="ml-2 block text-sm text-gray-700">
                  건진법 안전관리계획 작성대상
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="industrial_law_safety_ledger"
                  name="industrial_law_safety_ledger"
                  checked={formData.industrial_law_safety_ledger}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled={loading}
                />
                <label htmlFor="industrial_law_safety_ledger" className="ml-2 block text-sm text-gray-700">
                  산안법 공사안전보건대장 작성대상
                </label>
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="disaster_prevention_target"
                  name="disaster_prevention_target"
                  checked={formData.disaster_prevention_target}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  disabled={loading}
                />
                <label htmlFor="disaster_prevention_target" className="ml-2 block text-sm text-gray-700">
                  재해예방기술지도 대상
                </label>
              </div>
            </div>

            {/* 사업카드(PDF) 링크 */}
            <div>
              <label htmlFor="business_card_pdf_url" className="block text-sm font-medium text-gray-700 mb-2">
                사업카드(PDF) 링크
              </label>
              <input
                type="url"
                id="business_card_pdf_url"
                name="business_card_pdf_url"
                value={formData.business_card_pdf_url}
                onChange={handleInputChange}
                placeholder="예: https://example.com/business-card.pdf"
                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
                disabled={loading}
              />
              <p className="mt-1 text-xs text-gray-500">
                사업카드 PDF 문서의 링크 URL을 입력하세요
              </p>
              {formData.business_card_pdf_url?.trim() && (
                <a
                  href={formData.business_card_pdf_url.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block text-xs text-blue-600 hover:text-blue-800 hover:underline"
                >
                  📄 사업카드 PDF 열기
                </a>
              )}
            </div>

            {/* 텔레그램 정보 수신용 아이디 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                텔레그램 정보 수신용 아이디
              </label>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label htmlFor="client_telegram_id" className="block text-xs text-gray-500 mb-1">
                    발주청
                  </label>
                  <input
                    type="text"
                    id="client_telegram_id"
                    name="client_telegram_id"
                    value={formData.client_telegram_id}
                    onChange={handleInputChange}
                    placeholder="발주청 텔레그램 ID (복수: 쉼표 구분)"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => handleTelegramTest('client')}
                    disabled={telegramTestLoading === 'client' || !formData.client_telegram_id?.trim()}
                    className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {telegramTestLoading === 'client' ? (
                      <div className="animate-spin h-3 w-3 border-2 border-blue-700 border-t-transparent rounded-full mr-1"></div>
                    ) : (
                      <Send className="h-3 w-3 mr-1" />
                    )}
                    테스트 발송
                  </button>
                </div>
                <div>
                  <label htmlFor="contractor_telegram_id" className="block text-xs text-gray-500 mb-1">
                    시공사
                  </label>
                  <input
                    type="text"
                    id="contractor_telegram_id"
                    name="contractor_telegram_id"
                    value={formData.contractor_telegram_id}
                    onChange={handleInputChange}
                    placeholder="시공사 텔레그램 ID (복수: 쉼표 구분)"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => handleTelegramTest('contractor')}
                    disabled={telegramTestLoading === 'contractor' || !formData.contractor_telegram_id?.trim()}
                    className="mt-2 inline-flex items-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-100 border border-blue-300 rounded-md hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {telegramTestLoading === 'contractor' ? (
                      <div className="animate-spin h-3 w-3 border-2 border-blue-700 border-t-transparent rounded-full mr-1"></div>
                    ) : (
                      <Send className="h-3 w-3 mr-1" />
                    )}
                    테스트 발송
                  </button>
                </div>
              </div>
              {telegramTestResult && (
                <div className={`mt-2 p-2 rounded-md text-xs ${telegramTestResult.success
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                  {telegramTestResult.success ? '✅' : '❌'} {telegramTestResult.message}
                </div>
              )}
              <p className="mt-1 text-xs text-gray-500">
                안전점검 알림을 받을 텔레그램 채팅 ID를 입력하세요 (복수 입력 시 쉼표로 구분)
              </p>
              <div className="mt-1 flex flex-col gap-1">
                <a href="https://t.me/KRCSafe_bot" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:text-blue-800 hover:underline">
                  🔔 안전알림 봇 등록하기 (t.me/KRCSafe_bot) — 사전에 텔레그램 설치 필요
                </a>
              </div>
            </div>

            {/* 개인정보 관리책임자 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                개인정보 관리책임자 (근로자 동의서에 표시)
              </label>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label htmlFor="privacy_manager_name" className="block text-xs text-gray-500 mb-1">
                    성명
                  </label>
                  <input
                    type="text"
                    id="privacy_manager_name"
                    name="privacy_manager_name"
                    value={formData.privacy_manager_name}
                    onChange={handleInputChange}
                    placeholder="관리책임자 성명"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="privacy_manager_position" className="block text-xs text-gray-500 mb-1">
                    직위
                  </label>
                  <input
                    type="text"
                    id="privacy_manager_position"
                    name="privacy_manager_position"
                    value={formData.privacy_manager_position}
                    onChange={handleInputChange}
                    placeholder="예: 현장소장"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="privacy_manager_email" className="block text-xs text-gray-500 mb-1">
                    이메일
                  </label>
                  <input
                    type="email"
                    id="privacy_manager_email"
                    name="privacy_manager_email"
                    value={formData.privacy_manager_email}
                    onChange={handleInputChange}
                    placeholder="example@company.com"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                </div>
                <div>
                  <label htmlFor="privacy_manager_phone" className="block text-xs text-gray-500 mb-1">
                    연락처
                  </label>
                  <input
                    type="tel"
                    id="privacy_manager_phone"
                    name="privacy_manager_phone"
                    value={formData.privacy_manager_phone}
                    onChange={handleInputChange}
                    placeholder="010-1234-5678"
                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    disabled={loading}
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                근로자 등록 시 동의서에 표시되는 관리책임자 정보입니다
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 수정자 정보 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">수정자 정보</h3>
        <div className="text-sm text-gray-600">
          <div>성명: {userProfile?.full_name}</div>
          <div>역할: {userProfile?.role}</div>
          {userProfile?.company_name && (
            <div>회사명: {userProfile.company_name}</div>
          )}
        </div>
      </div>

      {/* 버튼 */}
      <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
        <button
          type="button"
          onClick={() => onCancel ? onCancel() : router.back()}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          disabled={loading}
        >
          취소
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <div className="animate-spin -ml-1 mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
              수정 중...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              프로젝트 수정
            </>
          )}
        </button>
      </div>
    </form>
  )
}

export default ProjectEditForm 