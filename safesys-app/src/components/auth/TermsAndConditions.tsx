'use client'

import React, { useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'

interface TermsAndConditionsProps {
  onAgree: (agreed: boolean) => void
}

const TermsAndConditions: React.FC<TermsAndConditionsProps> = ({ onAgree }) => {
  const [allAgreed, setAllAgreed] = useState(false)
  const [betaNoticeAgreed, setBetaNoticeAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [cctvAgreed, setCctvAgreed] = useState(false)
  const [operatorAgreed, setOperatorAgreed] = useState(false)
  const [showBetaDetails, setShowBetaDetails] = useState(false)
  const [showPrivacyDetails, setShowPrivacyDetails] = useState(false)
  const [showTermsDetails, setShowTermsDetails] = useState(false)
  const [showCctvDetails, setShowCctvDetails] = useState(false)
  const [showOperatorDetails, setShowOperatorDetails] = useState(false)

  const checkAllAgreed = (beta: boolean, privacy: boolean, terms: boolean, cctv: boolean, operator: boolean) => {
    return beta && privacy && terms && cctv && operator
  }

  const handleAllAgree = () => {
    const newValue = !allAgreed
    setAllAgreed(newValue)
    setBetaNoticeAgreed(newValue)
    setPrivacyAgreed(newValue)
    setTermsAgreed(newValue)
    setCctvAgreed(newValue)
    setOperatorAgreed(newValue)
    onAgree(newValue)
  }

  const handleBetaNoticeAgree = () => {
    const newValue = !betaNoticeAgreed
    setBetaNoticeAgreed(newValue)
    const allChecked = checkAllAgreed(newValue, privacyAgreed, termsAgreed, cctvAgreed, operatorAgreed)
    setAllAgreed(allChecked)
    onAgree(allChecked)
  }

  const handlePrivacyAgree = () => {
    const newValue = !privacyAgreed
    setPrivacyAgreed(newValue)
    const allChecked = checkAllAgreed(betaNoticeAgreed, newValue, termsAgreed, cctvAgreed, operatorAgreed)
    setAllAgreed(allChecked)
    onAgree(allChecked)
  }

  const handleTermsAgree = () => {
    const newValue = !termsAgreed
    setTermsAgreed(newValue)
    const allChecked = checkAllAgreed(betaNoticeAgreed, privacyAgreed, newValue, cctvAgreed, operatorAgreed)
    setAllAgreed(allChecked)
    onAgree(allChecked)
  }

  const handleCctvAgree = () => {
    const newValue = !cctvAgreed
    setCctvAgreed(newValue)
    const allChecked = checkAllAgreed(betaNoticeAgreed, privacyAgreed, termsAgreed, newValue, operatorAgreed)
    setAllAgreed(allChecked)
    onAgree(allChecked)
  }

  const handleOperatorAgree = () => {
    const newValue = !operatorAgreed
    setOperatorAgreed(newValue)
    const allChecked = checkAllAgreed(betaNoticeAgreed, privacyAgreed, termsAgreed, cctvAgreed, newValue)
    setAllAgreed(allChecked)
    onAgree(allChecked)
  }

  return (
    <div className="space-y-3">
      {/* 전체 동의 */}
      <div className="border-b border-gray-200 pb-4">
        <button
          type="button"
          onClick={handleAllAgree}
          className="flex items-center w-full text-left group"
        >
          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 transition-colors ${
            allAgreed ? 'bg-green-500 border-green-500' : 'border-gray-300'
          }`}>
            {allAgreed && <Check className="h-4 w-4 text-white" />}
          </div>
          <span className="text-lg font-bold text-gray-900">
            전체 동의하기
          </span>
        </button>
        <p className="text-sm text-gray-500 mt-2 ml-9">
          실명 인증된 아이디로 가입, 위치기반서비스 이용약관(선택), 이벤트·혜택 정보 수신(선택) 동의를 포함합니다.
        </p>
      </div>

      <div className="space-y-2">
        {/* 베타 테스터 안내 */}
        <div>
          <div className="flex items-center justify-between w-full py-3">
            <button
              type="button"
              onClick={handleBetaNoticeAgree}
              className="flex items-center group flex-1"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 transition-colors ${
                betaNoticeAgreed ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {betaNoticeAgreed && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className="text-sm font-medium text-gray-900">
                [필수] <span className="text-green-600">베타 테스터</span> 안내사항 동의
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowBetaDetails(!showBetaDetails)}
              className="ml-4 flex items-center flex-shrink-0"
            >
              <span className="text-xs text-gray-500 mr-1">전문</span>
              {showBetaDetails ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>

          {showBetaDetails && (
            <div className="ml-8 mb-3">
              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 space-y-2 max-h-60 overflow-y-auto border border-gray-200">
                <p className="font-bold text-sm text-green-600">베타 테스터 기간 안내</p>

                <div className="space-y-3">
                  <div>
                    <p className="font-semibold text-gray-900">현재 베타 테스트 운영 중입니다</p>
                    <p className="mt-1 text-gray-600">본 서비스는 현재 베타 테스트 기간으로 운영되고 있습니다. 정식 서비스 오픈 전까지 시스템 안정화 및 개선 작업이 진행됩니다.</p>
                  </div>

                  <div className="border-t border-gray-200 pt-2">
                    <p className="font-semibold text-red-600">⚠️ 데이터 삭제 안내</p>
                    <p className="mt-1 text-gray-600">
                      베타 테스트 기간 중 입력하신 모든 정보(회원정보, 프로젝트 데이터, 점검 기록 등)는
                      <span className="font-semibold text-red-600"> 사전 공지 없이 삭제될 수 있습니다</span>.
                    </p>
                    <p className="mt-1 text-gray-600">
                      정식 서비스 전환 시 기존 데이터는 보존되지 않을 수 있으니, 중요한 데이터는 별도로 백업해 주시기 바랍니다.
                    </p>
                  </div>

                  <div className="border-t border-gray-200 pt-2">
                    <p className="font-semibold text-gray-900">베타 테스터의 역할</p>
                    <p className="mt-1 text-gray-600">
                      - 시스템 기능 테스트 및 피드백 제공<br/>
                      - 오류 및 개선사항 제보<br/>
                      - 서비스 안정화에 협조
                    </p>
                  </div>

                  <div className="border-t border-gray-200 pt-2">
                    <p className="font-semibold text-gray-900">서비스 이용 제한</p>
                    <p className="mt-1 text-gray-600">
                      베타 테스트 기간 중 시스템 점검, 업데이트 등으로 인해 서비스가 일시 중단될 수 있으며,
                      기능이 예고 없이 변경되거나 제한될 수 있습니다.
                    </p>
                  </div>
                </div>

                <p className="mt-3 text-gray-500 pt-2 border-t border-gray-200">
                  한국농어촌공사 경기지역본부 안전관리센터
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 개인정보 수집 및 이용 동의 */}
        <div>
          <div className="flex items-center justify-between w-full py-3">
            <button
              type="button"
              onClick={handlePrivacyAgree}
              className="flex items-center group flex-1"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 transition-colors ${
                privacyAgreed ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {privacyAgreed && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className="text-sm font-medium text-gray-900">
                [필수] 개인정보 수집 및 이용 동의
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowPrivacyDetails(!showPrivacyDetails)}
              className="ml-4 flex items-center flex-shrink-0"
            >
              <span className="text-xs text-gray-500 mr-1">전문</span>
              {showPrivacyDetails ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>

          {showPrivacyDetails && (
            <div className="ml-8 mb-3">
              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 space-y-2 max-h-60 overflow-y-auto border border-gray-200">
                <p className="font-bold text-sm">한국농어촌공사 경기지역본부 안전관리센터 개인정보 수집 및 이용 동의서</p>
                <p className="text-gray-500 text-xs">「개인정보보호법」 제15조(개인정보의 수집·이용) 및 제22조(동의를 받는 방법)에 따라 다음과 같이 개인정보 수집·이용에 대한 동의를 받습니다.</p>

                <div>
                  <p className="font-semibold mt-2">1. 개인정보의 수집 및 이용 목적</p>
                  <p>- 안전관리 시스템 서비스 제공</p>
                  <p>- 건설 현장 안전점검 관리 및 기록</p>
                  <p>- 사용자 본인 확인 및 서비스 이용</p>
                  <p>- 안전점검 증빙 자료 관리</p>
                  <p className="font-semibold text-gray-900 mt-2">- 건설현장 안전관리 강화 및 개선</p>
                  <p className="ml-2">· 수집된 안전점검 정보는 현장 안전사고 예방에 활용됩니다</p>
                  <p className="ml-2">· 안전관리 통계 및 분석을 통한 안전 정책 수립에 사용될 수 있습니다</p>
                  <p className="ml-2">· 건설현장 안전 수준 향상을 위한 개선 활동에 활용됩니다</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">2. 수집하는 개인정보 항목</p>
                  <p className="font-semibold text-gray-900 mt-1">가. 회원가입 시 수집 항목</p>
                  <p>- 필수항목: 이메일, 비밀번호, 이름, 전화번호, 직급, 소속 조직</p>
                  <p>- 선택항목: 회사명 (발주청 외 사용자)</p>
                  <p className="font-semibold text-gray-900 mt-2">나. 서비스 이용 중 수집 항목</p>
                  <p>- 안전점검 사진 (현장 점검 사진, 서명 이미지)</p>
                  <p>- 서류 사진 (점검 관련 증빙 서류, 안전 관련 문서)</p>
                  <p>- 점검 기록 데이터 (일시, 위치, 점검 내용 등)</p>
                  <p>- 프로젝트 정보 (현장명, 주소, 좌표 등)</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">3. 개인정보의 보유 및 이용 기간</p>
                  <p>- 회원 탈퇴 시까지 보유</p>
                  <p>- 관계 법령에 따라 보존할 필요가 있는 경우 해당 기간 동안 보관</p>
                  <p className="text-red-600 font-semibold mt-1">※ 베타 테스트 기간 중 수집된 모든 정보는 사전 고지 없이 삭제될 수 있습니다</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">4. 수집한 사진 및 서류의 이용</p>
                  <p>- 안전점검 사진 및 서류는 점검 기록 관리 목적으로 이용됩니다</p>
                  <p>- 수집된 사진은 안전관리 보고서 작성에 활용될 수 있습니다</p>
                  <p>- 건설현장 안전관리 강화를 위한 분석 및 개선 자료로 활용될 수 있습니다</p>
                  <p>- 안전사고 예방 교육 및 안전관리 우수사례 공유에 활용될 수 있습니다</p>
                  <p className="text-gray-600 mt-1">※ 개인정보가 포함된 사진은 익명화 처리 후 활용되며, 제3자에게 제공하지 않습니다</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">5. 동의를 거부할 권리 및 거부 시 불이익</p>
                  <p>- 귀하는 개인정보 수집 및 이용에 대한 동의를 거부할 권리가 있습니다.</p>
                  <p>- 다만, 필수 항목 동의를 거부하실 경우 회원가입 및 서비스 이용이 제한될 수 있습니다.</p>
                  <p>- 안전점검 사진 제공을 거부하실 경우 점검 기록 등록이 제한될 수 있습니다.</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">6. 개인정보 처리 위탁</p>
                  <p>- 위탁 업체: Supabase Inc. (클라우드 데이터베이스 서비스)</p>
                  <p>- 위탁 내용: 회원정보 및 서비스 데이터 저장·관리</p>
                  <p>- 위탁 업체는 개인정보보호법에 따라 안전하게 개인정보를 처리합니다.</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">7. 개인정보 보호책임자</p>
                  <p>- 담당부서: 한국농어촌공사 경기지역본부 안전관리센터</p>
                  <p>- 연락처: 031-250-3611</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">8. 정보주체의 권리</p>
                  <p>- 귀하는 언제든지 본인의 개인정보에 대해 열람, 정정, 삭제, 처리정지를 요청하실 수 있습니다.</p>
                  <p>- 권리 행사는 서면, 전화, 이메일 등을 통해 하실 수 있으며, 정당한 사유가 있는 경우 처리가 제한될 수 있습니다.</p>
                  <p>- 개인정보 관련 문의·상담: 한국농어촌공사 경기지역본부 안전관리센터 (031-250-3611)</p>
                </div>

                <p className="mt-3 text-gray-500 pt-2 border-t border-gray-200">
                  수집 및 관리 주체: 한국농어촌공사 경기지역본부 안전관리센터 (031-250-3611)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 서비스 이용약관 동의 */}
        <div>
          <div className="flex items-center justify-between w-full py-3">
            <button
              type="button"
              onClick={handleTermsAgree}
              className="flex items-center group flex-1"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 transition-colors ${
                termsAgreed ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {termsAgreed && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className="text-sm font-medium text-gray-900">
                [필수] 서비스 이용약관 동의
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowTermsDetails(!showTermsDetails)}
              className="ml-4 flex items-center flex-shrink-0"
            >
              <span className="text-xs text-gray-500 mr-1">전문</span>
              {showTermsDetails ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>

          {showTermsDetails && (
            <div className="ml-8 mb-3">
              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 space-y-2 max-h-60 overflow-y-auto border border-gray-200">
                <p className="font-bold text-sm">안전관리 시스템 서비스 이용약관</p>

                <div>
                  <p className="font-semibold mt-2">제1조 (목적)</p>
                  <p>본 약관은 한국농어촌공사 경기지역본부 안전관리센터가 제공하는 안전관리 시스템 서비스의 이용과 관련하여 회사와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">제2조 (서비스의 제공)</p>
                  <p>- 건설 현장 안전점검 기록 및 관리</p>
                  <p>- 열중질환 모니터링 서비스</p>
                  <p>- TBM 상태 추적 서비스</p>
                  <p>- 프로젝트 안전 관리 기능</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">제3조 (회원의 의무)</p>
                  <p>- 회원은 관계법령, 본 약관의 규정, 이용안내 및 서비스상에 공지한 주의사항을 준수하여야 합니다.</p>
                  <p>- 회원은 정확하고 최신의 정보를 유지하여야 합니다.</p>
                  <p>- 회원은 본인의 계정 정보를 제3자에게 이용하게 해서는 안됩니다.</p>
                </div>

                <div>
                  <p className="font-semibold mt-2">제4조 (서비스의 제한)</p>
                  <p>- 서비스는 업무상 또는 기술상 특별한 지장이 없는 한 연중무휴, 1일 24시간 운영을 원칙으로 합니다.</p>
                  <p>- 시스템 정기점검, 증설 및 교체를 위해 서비스가 일시 중단될 수 있으며, 예정된 작업은 사전에 공지합니다.</p>
                </div>

                <p className="mt-3 text-gray-500 pt-2 border-t border-gray-200">
                  제공 기관: 한국농어촌공사 경기지역본부 안전관리센터
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 영상정보 실시간 제공 및 PTZ 이용 동의 */}
        <div>
          <div className="flex items-center justify-between w-full py-3">
            <button
              type="button"
              onClick={handleCctvAgree}
              className="flex items-center group flex-1"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 transition-colors ${
                cctvAgreed ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {cctvAgreed && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className="text-sm font-medium text-gray-900">
                [필수] 영상정보 실시간 제공 및 PTZ 이용 동의
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowCctvDetails(!showCctvDetails)}
              className="ml-4 flex items-center flex-shrink-0"
            >
              <span className="text-xs text-gray-500 mr-1">전문</span>
              {showCctvDetails ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>

          {showCctvDetails && (
            <div className="ml-8 mb-3">
              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 space-y-2 max-h-60 overflow-y-auto border border-gray-200">
                <p className="font-bold text-sm text-blue-600">영상정보 실시간 제공 및 PTZ 이용 동의</p>
                <p className="text-gray-500 text-xs">「개인정보보호법」 제25조(영상정보처리기기의 설치·운영 제한) 및 제17조(개인정보의 제공)에 따라 다음과 같이 영상정보 제공에 대한 동의를 받습니다.</p>

                <div>
                  <p className="font-semibold mt-2">1. 제공받는 자</p>
                  <p className="ml-2">한국농어촌공사</p>
                  <p className="mt-1 text-gray-600">본 공사가 발주한 건설공사의 안전관리 감독을 위하여 시공사가 운용하는 영상정보처리기기(CCTV)의 실시간 스트리밍 데이터를 제공받습니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold">2. 제공 항목</p>
                  <p className="ml-2">- 카메라 IP 주소</p>
                  <p className="ml-2">- 카메라 포트 번호</p>
                  <p className="ml-2">- 카메라 접속 아이디</p>
                  <p className="ml-2">- 카메라 접속 비밀번호</p>
                  <p className="ml-2">- 실시간 영상정보</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold">3. 제공 및 조작 목적</p>
                  <p className="ml-2">- 실시간 안전 사각지대 확인 및 위험 작업 모니터링</p>
                  <p className="ml-2">- 원격 PTZ(회전, 확대)를 통한 세부 안전시설 점검</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold">4. 영상정보의 저장에 관한 사항</p>
                  <p className="ml-2">- 한국농어촌공사는 제공받는 실시간 영상을 별도로 저장, 녹화 또는 수집하지 않습니다.</p>
                  <p className="ml-2">- 영상의 저장 및 보관은 시공사의 장비 또는 시공사가 계약한 클라우드 서버에서만 이루어집니다.</p>
                  <p className="ml-2">- 공사는 스트리밍 종료 즉시 해당 영상 데이터를 파기(휘발) 처리합니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold">5. PTZ 조작 이력 관리</p>
                  <p className="ml-2">- 공사는 안전관리 목적에 한하여 카메라를 조작하며, 조작 시점 및 조작자 정보는 시스템 보안을 위해 로그로 기록됩니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold">6. 제공 기간</p>
                  <p className="ml-2">- 해당 건설공사 종료 시까지</p>
                  <p className="ml-2">- 공사 종료 후에는 영상정보 제공이 자동으로 중단됩니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold">7. 제3자 제공</p>
                  <p className="ml-2">- 제공받은 영상정보는 제3자에게 제공하지 않습니다.</p>
                  <p className="ml-2">- 한국농어촌공사 내부 안전관리 목적으로만 활용됩니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold text-red-600">8. 동의 철회</p>
                  <p className="ml-2">- 동의를 철회하실 경우 안전관리시스템 이용 및 회원가입이 불가합니다.</p>
                  <p className="ml-2">- 철회 문의: 경기지역본부 안전관리센터 (031-250-3611)</p>
                </div>

                <p className="mt-3 text-gray-500 pt-2 border-t border-gray-200">
                  한국농어촌공사 경기지역본부 안전관리센터 (031-250-3611)
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 시공사(운영자) 관리 책임 확약 */}
        <div>
          <div className="flex items-center justify-between w-full py-3">
            <button
              type="button"
              onClick={handleOperatorAgree}
              className="flex items-center group flex-1"
            >
              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 flex-shrink-0 transition-colors ${
                operatorAgreed ? 'bg-green-500 border-green-500' : 'border-gray-300'
              }`}>
                {operatorAgreed && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className="text-sm font-medium text-gray-900">
                [필수] 시공사(운영자) 관리 책임 확약
              </span>
            </button>
            <button
              type="button"
              onClick={() => setShowOperatorDetails(!showOperatorDetails)}
              className="ml-4 flex items-center flex-shrink-0"
            >
              <span className="text-xs text-gray-500 mr-1">전문</span>
              {showOperatorDetails ? (
                <ChevronUp className="h-4 w-4 text-gray-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>

          {showOperatorDetails && (
            <div className="ml-8 mb-3">
              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-700 space-y-2 max-h-60 overflow-y-auto border border-gray-200">
                <p className="font-bold text-sm text-orange-600">시공사(운영자) 관리 책임 확약</p>
                <p className="text-gray-500 text-xs">「개인정보보호법」 제25조, 「산업안전보건법」 제38조(안전조치) 및 「건설산업기본법」에 따라 시공사는 영상정보처리기기 운영자로서 다음 책임을 집니다.</p>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold text-gray-900">저장 관리</p>
                  <p className="ml-2">법적 증빙을 위한 영상 저장은 시공사에서 직접 관리하며, 공사의 무저장 원칙에 따른 데이터 소실 책임은 시공사에 있습니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold text-gray-900">근로자 고지</p>
                  <p className="ml-2">현장 안내판에 &quot;안전관리를 위한 공사현장 24시간 안전감시&quot;를 명시하여 근로자의 불안감을 해소해야 합니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold text-red-600">음성 녹음 금지</p>
                  <p className="ml-2">영상정보처리기기의 음성 녹음 기능 활성화를 엄격히 금지합니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2 bg-yellow-50 -mx-4 px-4 py-2 mt-2">
                  <p className="font-semibold text-gray-900">대리권 확인</p>
                  <p className="ml-2 text-gray-700">본인은 소속 회사를 대리하여 본 동의서에 동의할 권한이 있음을 확인합니다.</p>
                </div>

                <div className="border-t border-gray-200 pt-2">
                  <p className="font-semibold text-red-600">위반 시 책임</p>
                  <p className="ml-2">위 의무를 위반할 경우 서비스 이용이 제한될 수 있으며, 관련 법령에 따른 민·형사상 책임을 질 수 있습니다.</p>
                </div>

                <p className="mt-3 text-gray-500 pt-2 border-t border-gray-200">
                  한국농어촌공사 경기지역본부 안전관리센터 (031-250-3611)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default TermsAndConditions
