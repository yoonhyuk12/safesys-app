import type { HealthQuestionnaireData, SafetyEquipmentData } from '@/components/worker-consent/types'
import { DISEASE_OPTIONS, SYMPTOM_OPTIONS, SAFETY_EQUIPMENT_OPTIONS } from '@/components/worker-consent/types'

interface WorkerData {
  name: string
  birth_date: string
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
  signature_url: string | null
  created_at: string
}

interface ProjectData {
  project_name: string
  privacy_manager_name: string | null
  privacy_manager_position: string | null
  privacy_manager_email: string | null
  privacy_manager_phone: string | null
}

const PAGE_STYLE = `
  width: 794px;
  padding: 40px;
  background-color: white;
  font-family: 'Malgun Gothic', '맑은 고딕', sans-serif;
  font-size: 12px;
  color: #1e293b;
  line-height: 1.5;
`

const CHECK = '☑'
const UNCHECK = '☐'

function chk(val: boolean): string {
  return val ? CHECK : UNCHECK
}

function formatDateKo(dateString: string): string {
  if (!dateString) return ''
  const d = new Date(dateString)
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`
}

function signatureHTML(signatureUrl: string | null, name: string): string {
  const dateStr = formatDateKo(new Date().toISOString())
  return `
    <div style="margin-top: 30px; text-align: center;">
      <p style="font-size: 13px; margin-bottom: 20px;">${dateStr}</p>
      <div style="display: flex; align-items: center; justify-content: center; gap: 16px;">
        <span style="font-size: 14px; font-weight: 600;">성명: ${name}</span>
        ${signatureUrl
      ? `<img src="${signatureUrl}" style="height: 50px; object-fit: contain;" />`
      : '<span style="color: #94a3b8; font-size: 11px;">(서명 없음)</span>'}
      </div>
    </div>
  `
}

function footerHTML(): string {
  return ''
}

// ===== 페이지 2: 동의서 (1/2) - 개인정보·고유식별·민감정보 =====
export function generateConsentFormPage1HTML(worker: WorkerData, project: ProjectData): string {
  return `
    <div style="${PAGE_STYLE}">
      <div style="border: 2px solid #334155; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #334155; padding-bottom: 12px;">
          <h1 style="font-size: 24px; font-weight: 800; color: #1e293b; margin: 0; letter-spacing: 3px;">개인정보 수집 및 활용 동의서</h1>
          <p style="font-size: 11px; color: #64748b; margin-top: 6px;">(1/2)</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; margin-bottom: 20px; font-weight: 600; font-size: 13px;">
          현장명: <span style="color: #2563eb; margin-left: 8px;">${project.project_name || '-'}</span>
        </div>

        <!-- 개인정보 수집 및 이용 동의 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">
            개인정보 수집 및 이용 동의
          </div>
          <div style="padding: 10px 12px; font-size: 11px; line-height: 1.7;">
            <p><strong>1. 수집 목적:</strong> 건설현장 근로자 안전관리, 출입 관리, 안전교육 이수 현황 관리, 산업재해 예방 및 사고 시 비상연락</p>
            <p><strong>2. 수집 항목:</strong> 성명, 생년월일, 연락처, 주소, 안전교육 이수정보, 근로계약 정보, CCTV 영상정보, 신분증 사본, 서명</p>
            <p><strong>3. 보유 기간:</strong> 근로관계 종료 후 3년 (산업안전보건법 시행규칙 근거)</p>
            <p><strong>4. 동의 거부 권리:</strong> 동의를 거부할 수 있으나, 거부 시 건설현장 출입 및 근무가 제한될 수 있습니다.</p>
          </div>
          <div style="padding: 6px 12px; border-top: 1px solid #e2e8f0; font-size: 12px; font-weight: 600;">
            ${chk(worker.agree_personal_info)} 개인정보 수집 및 이용에 동의합니다
          </div>
        </div>

        <!-- 고유식별정보 수집 및 이용 동의 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">
            고유식별정보 수집 및 이용 동의
          </div>
          <div style="padding: 10px 12px; font-size: 11px; line-height: 1.7;">
            <p><strong>1. 수집 목적:</strong> 근로자 본인 확인, 산업재해보상보험 처리, 국민건강보험 신고</p>
            <p><strong>2. 수집 항목:</strong> 주민등록번호(또는 외국인등록번호)</p>
            <p><strong>3. 보유 기간:</strong> 근로관계 종료 후 3년</p>
            <p><strong>4. 동의 거부 권리:</strong> 동의를 거부할 수 있으나, 거부 시 건설현장 근무가 제한될 수 있습니다.</p>
          </div>
          <div style="padding: 6px 12px; border-top: 1px solid #e2e8f0; font-size: 12px; font-weight: 600;">
            ${chk(worker.agree_unique_id)} 고유식별정보 수집 및 이용에 동의합니다
          </div>
        </div>

        <!-- 민감정보 제공 활용 동의 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">
            민감정보 제공 활용 동의
          </div>
          <div style="padding: 10px 12px; font-size: 11px; line-height: 1.7;">
            <p><strong>1. 수집 목적:</strong> 건설현장 근로자 건강관리, 응급상황 대응, 작업 적합성 판단</p>
            <p><strong>2. 수집 항목:</strong> 건강상태(질환이력, 수술이력, 약물복용), 건강문진표 정보, AED 사용 동의 여부</p>
            <p><strong>3. 보유 기간:</strong> 근로관계 종료 후 3년</p>
            <p><strong>4. 동의 거부 권리:</strong> 동의를 거부할 수 있으나, 거부 시 건강관리 서비스 제공이 제한될 수 있습니다.</p>
            <p style="color: #64748b; font-style: italic;">※ 민감정보는 개인정보보호법 제23조에 따라 별도의 동의를 받아 처리합니다.</p>
          </div>
          <div style="padding: 6px 12px; border-top: 1px solid #e2e8f0; font-size: 12px; font-weight: 600;">
            ${chk(worker.agree_sensitive_info)} 민감정보 수집 및 이용에 동의합니다
          </div>
        </div>

        <!-- 관리책임자 정보 -->
        <div style="margin-top: 20px;">
          <p style="font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 6px;">개인정보 관리책임자</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <tr>
              <th style="width: 20%; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-weight: 700;">현장명</th>
              <td style="width: 30%; border: 1px solid #cbd5e1; padding: 6px 10px;">${project.project_name || '-'}</td>
              <th style="width: 20%; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-weight: 700;">성명</th>
              <td style="width: 30%; border: 1px solid #cbd5e1; padding: 6px 10px;">${project.privacy_manager_name || '-'}</td>
            </tr>
            <tr>
              <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-weight: 700;">직위</th>
              <td style="border: 1px solid #cbd5e1; padding: 6px 10px;">${project.privacy_manager_position || '-'}</td>
              <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-weight: 700;">연락처</th>
              <td style="border: 1px solid #cbd5e1; padding: 6px 10px;">${project.privacy_manager_phone || '-'}</td>
            </tr>
          </table>
        </div>

        ${signatureHTML(worker.signature_url, worker.name)}
        ${footerHTML()}
      </div>
    </div>
  `
}

// ===== 페이지 3: 동의서 (2/2) - CCTV 촬영 및 이용 =====
export function generateConsentFormPage2HTML(worker: WorkerData, project: ProjectData): string {
  return `
    <div style="${PAGE_STYLE}">
      <div style="border: 2px solid #334155; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #334155; padding-bottom: 12px;">
          <h1 style="font-size: 24px; font-weight: 800; color: #1e293b; margin: 0; letter-spacing: 3px;">안전관리CCTV 촬영 및 이용 동의서</h1>
          <p style="font-size: 11px; color: #64748b; margin-top: 6px;">(2/2)</p>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; margin-bottom: 20px; font-weight: 600; font-size: 13px;">
          현장명: <span style="color: #2563eb; margin-left: 8px;">${project.project_name || '-'}</span>
        </div>

        <p style="font-size: 12px; line-height: 1.8; margin-bottom: 16px;">
          본 <strong>&ldquo;${project.project_name || '(현장명)'}&rdquo;</strong> 건설현장에서는 근로자의 안전한 작업환경 조성을 위해 주요 작업장 및 이동통로 등에 안전관리 영상정보처리기기(CCTV)를 운영하고 있습니다. 이에 「개인정보보호법」 제15조 제1항 (정보주체의 동의를 받은 경우)에 근거하여, 다음과 같이 영상정보를 수집·이용·제공하는데 협의 및 동의를 받고자 합니다.
        </p>

        <!-- CCTV 수집/이용 + 제3자 제공 2열 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
          <div style="border: 1px solid #cbd5e1;">
            <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">
              개인영상정보 수집 및 이용 동의
            </div>
            <div style="padding: 10px 12px; font-size: 11px; line-height: 1.8;">
              <p><strong>1. 수집이용목적:</strong> 건설현장 내 작업안전 및 위험 예방, 산업재해 예방</p>
              <p><strong>2. 수집항목:</strong> 공사중 개인영상정보</p>
              <p><strong>3. 보유 및 이용기간:</strong> 촬영일로부터 최대 30일</p>
              <p><strong>4. 동의 거부권 및 불이익 안내:</strong> 귀하는 동의를 거부할 권리가 있으나, 동의하지 않으실 경우 안전관리 또는 분쟁 대응에 제한이 있을 수 있습니다.</p>
            </div>
          </div>
          <div style="border: 1px solid #cbd5e1;">
            <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">
              개인영상정보 제3자 제공 동의
            </div>
            <div style="padding: 10px 12px; font-size: 11px; line-height: 1.8;">
              <p><strong>1. 제공받는 자 및 이용 목적</strong></p>
              <p style="padding-left: 10px;">가. 제공대상: 발주청 및 한국농어촌공사</p>
              <p style="padding-left: 10px;">나. 이용목적: 근로자 재해예방</p>
              <p><strong>2. 제공항목:</strong> 공사중 개인영상정보</p>
              <p><strong>3. 보유 및 이용 기간:</strong> 10일 또는 노사간 협의를 통해 조정</p>
              <p><strong>4.</strong> 귀하께서는 개인정보 제공 동의에 대해 거부하실 권리가 있으나, 동의를 거부하실 경우 근로자 재해 예방에 관한 지원이 제한될 수 있습니다.</p>
            </div>
          </div>
        </div>

        <!-- 제3자 제공 안내 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 16px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">
            개인영상정보 제3자 제공 동의에 따른 안내
          </div>
          <div style="padding: 10px 12px; font-size: 11px; line-height: 1.8;">
            <p>- 법률 또는 수사 목적 등 정당한 사유 없이 제3자에게 영상정보를 임의로 제공하지 않으며, 고도의 기술적·물리적 보안조치를 통해 영상정보는 안전하게 보호됩니다.</p>
            <p>- 다만, 법령에 따라 요구될 경우 또는 안전사고 대응, 분쟁 해결 등을 위해 필요한 경우에는 예외적으로 제공될 수 있습니다.</p>
            <p>- 정보주체의 권리 보장 및 보호를 위해 관련 법령을 철저히 준수합니다.</p>
            <p style="color: #64748b; font-style: italic;">※ 귀하는 개인정보에 관하여 열람 또는 존재확인·삭제를 원하는 경우 언제든지 영상정보처리기기 운영자에게 요구할 수 있습니다.</p>
          </div>
        </div>

        <!-- 동의 체크 -->
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; font-weight: 600;">
          <p style="margin-bottom: 6px;">${chk(worker.agree_cctv_collection)} CCTV 영상정보 수집 및 이용에 동의합니다</p>
          <p>${chk(worker.agree_cctv_third_party)} CCTV 영상정보 제3자 제공에 동의합니다</p>
        </div>

        <!-- 관리책임자 정보 -->
        <div style="margin-top: 10px;">
          <p style="font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 6px;">개인정보 관리책임자</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <tr>
              <th style="width: 20%; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-weight: 700;">현장명</th>
              <td style="width: 30%; border: 1px solid #cbd5e1; padding: 6px 10px;">${project.project_name || '-'}</td>
              <th style="width: 20%; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-weight: 700;">성명</th>
              <td style="width: 30%; border: 1px solid #cbd5e1; padding: 6px 10px;">${project.privacy_manager_name || '-'}</td>
            </tr>
            <tr>
              <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-weight: 700;">직위</th>
              <td style="border: 1px solid #cbd5e1; padding: 6px 10px;">${project.privacy_manager_position || '-'}</td>
              <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px 10px; text-align: center; font-weight: 700;">연락처</th>
              <td style="border: 1px solid #cbd5e1; padding: 6px 10px;">${project.privacy_manager_phone || '-'}</td>
            </tr>
          </table>
        </div>

        ${signatureHTML(worker.signature_url, worker.name)}
        ${footerHTML()}
      </div>
    </div>
  `
}

// ===== 페이지 3: 건강·안전 문진표 =====
export function generateHealthQuestionnaireHTML(worker: WorkerData, project: ProjectData): string {
  const h = (worker.health_questionnaire || {}) as HealthQuestionnaireData

  const diseaseCells = DISEASE_OPTIONS.map(d => {
    const checked = h.diseases?.includes(d)
    return `<span style="margin-right: 12px;">${chk(checked)} ${d}</span>`
  }).join('')

  const symptomCells = SYMPTOM_OPTIONS.map(s => {
    const checked = h.recent_symptoms?.includes(s)
    return `<span style="margin-right: 12px;">${chk(checked)} ${s}</span>`
  }).join('')

  return `
    <div style="${PAGE_STYLE}">
      <div style="border: 2px solid #334155; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #334155; padding-bottom: 12px;">
          <h1 style="font-size: 24px; font-weight: 800; color: #1e293b; margin: 0; letter-spacing: 3px;">건강 · 안전 문진표</h1>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; margin-bottom: 20px; font-weight: 600; font-size: 13px;">
          현장명: <span style="color: #2563eb; margin-left: 8px;">${project.project_name || '-'}</span>
        </div>

        <!-- 기본정보 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px;">
          <tr>
            <th style="width: 15%; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; font-weight: 700;">성 명</th>
            <td style="width: 35%; border: 1px solid #cbd5e1; padding: 8px 10px;">${worker.name}</td>
            <th style="width: 15%; background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; font-weight: 700;">생년월일</th>
            <td style="width: 35%; border: 1px solid #cbd5e1; padding: 8px 10px;">${worker.birth_date || '-'}</td>
          </tr>
          <tr>
            <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; font-weight: 700;">주 소</th>
            <td colspan="3" style="border: 1px solid #cbd5e1; padding: 8px 10px;">${h.address || worker.address || '-'}</td>
          </tr>
          <tr>
            <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; font-weight: 700;">연락처</th>
            <td style="border: 1px solid #cbd5e1; padding: 8px 10px;">${h.phone || worker.phone || '-'}</td>
            <th style="background-color: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; font-weight: 700;">혈액형</th>
            <td style="border: 1px solid #cbd5e1; padding: 8px 10px;">${h.blood_type || '-'}형 ${h.blood_rh ? `RH(${h.blood_rh})` : ''}</td>
          </tr>
        </table>

        <!-- 비상연락처 -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 12px;">
          <tr>
            <th style="width: 15%; background-color: #fef9c3; border: 1px solid #cbd5e1; padding: 8px 10px; text-align: center; font-weight: 700;">비상연락처</th>
            <td style="border: 1px solid #cbd5e1; padding: 8px 10px;">
              ${h.emergency_contact_name || '-'} (${h.emergency_contact_relation || '-'}) ${h.emergency_contact_phone || '-'}
            </td>
          </tr>
        </table>

        <!-- 질환이력 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">질환이력</div>
          <div style="padding: 10px 12px; font-size: 12px; line-height: 2;">
            ${diseaseCells}
            ${h.diseases?.includes('기타') && h.disease_other ? `<br/><span style="color: #64748b;">기타: ${h.disease_other}</span>` : ''}
          </div>
        </div>

        <!-- 수술/입원 이력 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">수술 · 입원 이력</div>
          <div style="padding: 10px 12px; font-size: 12px;">
            ${chk(h.surgery_history === '없음')} 없음 &nbsp;&nbsp;
            ${chk(h.surgery_history === '있음')} 있음
            ${h.surgery_history === '있음' && h.surgery_detail ? `<span style="margin-left: 12px; color: #64748b;">(${h.surgery_detail})</span>` : ''}
          </div>
        </div>

        <!-- 최근 이상 증상 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">최근 이상 증상</div>
          <div style="padding: 10px 12px; font-size: 12px; line-height: 2;">
            ${symptomCells}
          </div>
        </div>

        <!-- AED 동의 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">심정지 시 AED(자동심장충격기) 사용 동의</div>
          <div style="padding: 10px 12px; font-size: 12px;">
            ${chk(h.aed_consent === '동의')} 동의 &nbsp;&nbsp;
            ${chk(h.aed_consent === '미동의')} 미동의
          </div>
        </div>

        <!-- 산업재해 경험 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">산업재해 경험</div>
          <div style="padding: 10px 12px; font-size: 12px;">
            ${chk(h.accident_history === '없음')} 없음 &nbsp;&nbsp;
            ${chk(h.accident_history === '있음')} 있음
            ${h.accident_history === '있음' ? `<span style="margin-left: 12px; color: #64748b;">부위: ${h.accident_body_part || '-'} / 시기: ${h.accident_date || '-'}</span>` : ''}
          </div>
        </div>

        <!-- 흡연/음주 -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px;">
          <div style="border: 1px solid #cbd5e1;">
            <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">흡연량 (1일)</div>
            <div style="padding: 10px 12px; font-size: 12px;">
              ${['없음', '반갑미만', '반갑~한갑', '한갑이상'].map(v =>
    `${chk(h.smoking === v)} ${v}`
  ).join(' &nbsp; ')}
            </div>
          </div>
          <div style="border: 1px solid #cbd5e1;">
            <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">음주</div>
            <div style="padding: 10px 12px; font-size: 12px;">
              ${['없음', '월1~3회', '주4~6회', '매일'].map(v =>
    `${chk(h.drinking_frequency === v)} ${v}`
  ).join(' &nbsp; ')}
              ${h.drinking_frequency !== '없음' && h.drinking_amount ? `<br/><span style="color: #64748b;">음주량: ${h.drinking_amount}</span>` : ''}
            </div>
          </div>
        </div>

        ${signatureHTML(worker.signature_url, worker.name)}
        ${footerHTML()}
      </div>
    </div>
  `
}

// ===== 페이지 4: 안전서약서 =====
export function generateSafetyPledgeHTML(worker: WorkerData, project: ProjectData): string {
  const eq = (worker.safety_equipment || { items: [], other: '' }) as SafetyEquipmentData

  const equipmentCells = SAFETY_EQUIPMENT_OPTIONS.map(item => {
    const checked = eq.items?.includes(item)
    return `<span style="margin-right: 16px;">${chk(checked)} ${item}</span>`
  }).join('')

  return `
    <div style="${PAGE_STYLE}">
      <div style="border: 2px solid #334155; padding: 24px;">
        <div style="text-align: center; margin-bottom: 24px; border-bottom: 2px solid #334155; padding-bottom: 12px;">
          <h1 style="font-size: 24px; font-weight: 800; color: #1e293b; margin: 0; letter-spacing: 3px;">안전보건관리규정 서약서</h1>
        </div>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 10px 14px; margin-bottom: 20px; font-weight: 600; font-size: 13px;">
          현장명: <span style="color: #2563eb; margin-left: 8px;">${project.project_name || '-'}</span>
        </div>

        <p style="font-size: 12px; margin-bottom: 16px; line-height: 1.7;">
          본인은 <strong>&ldquo;${project.project_name || '(현장명)'}&rdquo;</strong> 건설현장에서 근무함에 있어 다음 사항을 준수할 것을 서약합니다.
        </p>

        <!-- 금지 항목 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #fef2f2; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px; color: #991b1b;">금지 항목</div>
          <div style="padding: 10px 16px; font-size: 11px; line-height: 1.8;">
            <p>1. 안전모, 안전화 등 개인보호구 미착용 상태에서의 작업 금지</p>
            <p>2. 작업 중 음주, 흡연 행위 금지 (지정 흡연구역 제외)</p>
            <p>3. 안전시설물 및 방호장치 임의 해체, 변경 금지</p>
            <p>4. 지정된 통로 외 통행 금지 및 위험구역 무단 출입 금지</p>
            <p>5. 작업계획서에 명시되지 않은 위험작업 임의 실시 금지</p>
          </div>
        </div>

        <!-- 성실 이행 사항 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f0fdf4; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px; color: #166534;">성실 이행 사항</div>
          <div style="padding: 10px 16px; font-size: 11px; line-height: 1.8;">
            <p>1. 작업 전 안전점검(TBM) 참여 및 안전수칙 준수</p>
            <p>2. 안전관리자의 지시 및 안전교육에 성실히 참여</p>
            <p>3. 위험요인 발견 시 즉시 보고 및 작업 중지</p>
            <p>4. 응급상황 발생 시 정해진 비상대피 절차 준수</p>
            <p>5. 현장 출입 시 신분확인 절차 이행</p>
          </div>
        </div>

        <!-- 책임과 의무 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #eff6ff; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px; color: #1e40af;">책임과 의무</div>
          <div style="padding: 10px 16px; font-size: 11px; line-height: 1.8;">
            <p>1. 산업안전보건법 등 관계 법령 준수</p>
            <p>2. 안전보건관리규정 위반 시 현장 퇴거 등 조치에 이의를 제기하지 않음</p>
            <p>3. 위반행위로 인한 산업재해 발생 시 관련 법률에 따른 책임을 질 것을 서약합니다</p>
          </div>
        </div>

        <!-- 안전보호구 수령 확인 -->
        <div style="border: 1px solid #cbd5e1; margin-bottom: 14px;">
          <div style="background-color: #f1f5f9; padding: 8px 12px; border-bottom: 1px solid #cbd5e1; font-weight: 700; font-size: 12px;">안전보호구 수령 확인</div>
          <div style="padding: 10px 12px; font-size: 12px; line-height: 2;">
            ${equipmentCells}
            ${eq.items?.includes('기타') && eq.other ? `<br/><span style="color: #64748b;">기타: ${eq.other}</span>` : ''}
          </div>
        </div>

        <!-- 서약 동의 -->
        <div style="background-color: #fff7ed; border: 1px solid #fed7aa; padding: 12px 16px; margin-bottom: 16px; font-size: 13px; font-weight: 600;">
          ${chk(worker.agree_safety_pledge)} 위 안전보건관리규정을 준수하고, 안전보호구를 수령하였음을 확인하며, 서약에 동의합니다.
        </div>

        ${signatureHTML(worker.signature_url, worker.name)}
        ${footerHTML()}
      </div>
    </div>
  `
}
