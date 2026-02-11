import React from 'react'
import { Shield } from 'lucide-react'
import type { PrivacyManager } from './types'

interface ConsentFormsProps {
  siteName: string
  privacyManager: PrivacyManager
  agreePersonalInfo: boolean
  setAgreePersonalInfo: (v: boolean) => void
  agreeUniqueId: boolean
  setAgreeUniqueId: (v: boolean) => void
  agreeSensitiveInfo: boolean
  setAgreeSensitiveInfo: (v: boolean) => void
  agreeCctvCollection: boolean
  setAgreeCctvCollection: (v: boolean) => void
  agreeCctvThirdParty: boolean
  setAgreeCctvThirdParty: (v: boolean) => void
}

export default function ConsentForms({
  siteName,
  privacyManager,
  agreePersonalInfo,
  setAgreePersonalInfo,
  agreeUniqueId,
  setAgreeUniqueId,
  agreeSensitiveInfo,
  setAgreeSensitiveInfo,
  agreeCctvCollection,
  setAgreeCctvCollection,
  agreeCctvThirdParty,
  setAgreeCctvThirdParty,
}: ConsentFormsProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
        <Shield className="h-8 w-8 text-blue-600 flex-shrink-0" />
        <div>
          <p className="font-medium text-gray-900">개인정보 수집 및 활용 동의</p>
          <p className="text-sm text-gray-600">법적 동의서에 동의해주세요</p>
        </div>
      </div>

      {/* 섹션 1: 개인정보 및 고유식별정보 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <p className="font-medium text-gray-900 text-sm">개인정보 수집 및 고유식별정보 제공 활용동의서</p>
        </div>
        <div className="p-3 text-xs text-gray-600 max-h-48 overflow-y-auto space-y-2 leading-relaxed">
          <p className="font-semibold text-gray-800">[개인정보 수집 및 이용 동의]</p>
          <p><strong>1. 수집 목적:</strong> 건설현장 근로자 안전관리, 출입 관리, 안전교육 이수 현황 관리, 산업재해 예방 및 사고 시 비상연락</p>
          <p><strong>2. 수집 항목:</strong> 성명, 생년월일, 연락처, 주소, 안전교육 이수정보, 근로계약 정보, CCTV 영상정보, 신분증 사본, 서명</p>
          <p><strong>3. 보유 기간:</strong> 근로관계 종료 후 3년 (산업안전보건법 시행규칙 근거)</p>
          <p><strong>4. 동의 거부 권리:</strong> 동의를 거부할 수 있으나, 거부 시 건설현장 출입 및 근무가 제한될 수 있습니다.</p>

          <div className="border-t border-gray-200 my-2 pt-2">
            <p className="font-semibold text-gray-800">[고유식별정보 수집 및 이용 동의]</p>
            <p><strong>1. 수집 목적:</strong> 근로자 본인 확인, 산업재해보상보험 처리, 국민건강보험 신고</p>
            <p><strong>2. 수집 항목:</strong> 주민등록번호(또는 외국인등록번호)</p>
            <p><strong>3. 보유 기간:</strong> 근로관계 종료 후 3년</p>
            <p><strong>4. 동의 거부 권리:</strong> 동의를 거부할 수 있으나, 거부 시 건설현장 근무가 제한될 수 있습니다.</p>
          </div>
        </div>

        {/* 관리책임자 정보 */}
        <div className="px-3 py-2 border-t border-gray-100 bg-gray-50">
          <p className="text-[10px] font-medium text-gray-500 mb-1">개인정보 관리책임자</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
            <span>현장명: {siteName || '-'}</span>
            <span>성명: {privacyManager.name || '-'}</span>
            <span>직위: {privacyManager.position || '-'}</span>
            <span>연락처: {privacyManager.phone || '-'}</span>
          </div>
        </div>

        <div className="px-4 py-2.5 border-t border-gray-200 bg-white space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={agreePersonalInfo} onChange={(e) => setAgreePersonalInfo(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-900">개인정보 수집 및 이용에 동의합니다</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={agreeUniqueId} onChange={(e) => setAgreeUniqueId(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-900">고유식별정보 수집 및 이용에 동의합니다</span>
          </label>
        </div>
      </div>

      {/* 섹션 2: 민감정보 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <p className="font-medium text-gray-900 text-sm">민감정보 제공 활용동의서</p>
        </div>
        <div className="p-3 text-xs text-gray-600 max-h-40 overflow-y-auto space-y-2 leading-relaxed">
          <p><strong>1. 수집 목적:</strong> 건설현장 근로자 건강관리, 응급상황 대응, 작업 적합성 판단</p>
          <p><strong>2. 수집 항목:</strong> 건강상태(질환이력, 수술이력, 약물복용), 건강문진표 정보, AED 사용 동의 여부</p>
          <p><strong>3. 보유 기간:</strong> 근로관계 종료 후 3년</p>
          <p><strong>4. 동의 거부 권리:</strong> 동의를 거부할 수 있으나, 거부 시 건강관리 서비스 제공이 제한될 수 있습니다.</p>
          <p className="text-gray-500 italic">* 민감정보는 개인정보보호법 제23조에 따라 별도의 동의를 받아 처리합니다.</p>
        </div>
        <div className="px-4 py-2.5 border-t border-gray-200 bg-white">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={agreeSensitiveInfo} onChange={(e) => setAgreeSensitiveInfo(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-900">민감정보 수집 및 이용에 동의합니다</span>
          </label>
        </div>
      </div>

      {/* 섹션 3: 안전관리CCTV 촬영 및 이용 동의 */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <p className="font-medium text-gray-900 text-sm">안전관리CCTV 촬영 및 이용 협의 및 동의서</p>
        </div>
        <div className="p-3 text-xs text-gray-600 max-h-48 overflow-y-auto space-y-2 leading-relaxed">
          <p>본 <strong>&ldquo;{siteName || '(현장명)'}&rdquo;</strong> 건설현장에서는 근로자의 안전한 작업환경 조성을 위해 주요 작업장 및 이동통로 등에 안전관리 영상정보처리기기(CCTV)를 운영하고 있습니다. 이에 「개인정보보호법」 제15조 제1항 (정보주체의 동의를 받은 경우)에 근거하여, 다음과 같이 영상정보를 수집·이용·제공하는데 협의 및 동의를 받고자 합니다.</p>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="border border-gray-200 rounded-lg p-2">
              <p className="font-semibold text-gray-800 mb-1">개인영상정보 수집 및 이용 동의</p>
              <p><strong>1. 수집이용목적:</strong> 건설현장 내 작업안전 및 위험 예방, 산업재해 예방</p>
              <p><strong>2. 수집항목:</strong> 공사중 개인영상정보</p>
              <p><strong>3. 보유 및 이용기간:</strong> 촬영일로부터 최대 30일</p>
              <p><strong>4. 동의 거부권 및 불이익 안내:</strong> 귀하는 동의를 거부할 권리가 있으나, 동의하지 않으실 경우 안전관리 또는 분쟁 대응에 제한이 있을 수 있습니다.</p>
            </div>
            <div className="border border-gray-200 rounded-lg p-2">
              <p className="font-semibold text-gray-800 mb-1">개인영상정보 제3자 제공 동의</p>
              <p><strong>1. 제공받는 자 및 이용 목적</strong></p>
              <p className="pl-2">가. 제공대상: 발주청 및 한국농어촌공사</p>
              <p className="pl-2">나. 이용목적: 근로자 재해예방</p>
              <p><strong>2. 제공항목:</strong> 공사중 개인영상정보</p>
              <p><strong>3. 보유 및 이용 기간:</strong> 10일 또는 노사간 협의를 통해 조정</p>
              <p><strong>4.</strong> 귀하께서는 개인정보 제공 동의에 대해 거부하실 권리가 있으나, 동의를 거부하실 경우 근로자 재해 예방에 관한 지원이 제한될 수 있습니다.</p>
            </div>
          </div>

          <div className="border-t border-gray-200 mt-2 pt-2">
            <p className="font-semibold text-gray-800">개인영상정보 제3자 제공 동의에 따른 안내</p>
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li>법률 또는 수사 목적 등 정당한 사유 없이 제3자에게 영상정보를 임의로 제공하지 않으며, 고도의 기술적·물리적 보안조치를 통해 영상정보는 안전하게 보호됩니다.</li>
              <li>다만, 법령에 따라 요구될 경우 또는 안전사고 대응, 분쟁 해결 등을 위해 필요한 경우에는 예외적으로 제공될 수 있습니다.</li>
              <li>정보주체의 권리 보장 및 보호를 위해 관련 법령을 철저히 준수합니다.</li>
            </ul>
            <p className="text-gray-500 italic mt-1">※ 귀하는 개인정보에 관하여 열람 또는 존재확인·삭제를 원하는 경우 언제든지 영상정보처리기기 운영자에게 요구할 수 있습니다.</p>
          </div>
        </div>

        <div className="px-4 py-2.5 border-t border-gray-200 bg-white space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={agreeCctvCollection} onChange={(e) => setAgreeCctvCollection(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-900">CCTV 영상정보 수집 및 이용에 동의합니다</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={agreeCctvThirdParty} onChange={(e) => setAgreeCctvThirdParty(e.target.checked)}
              className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
            <span className="text-sm font-medium text-gray-900">CCTV 영상정보 제3자 제공에 동의합니다</span>
          </label>
        </div>
      </div>
    </div>
  )
}
