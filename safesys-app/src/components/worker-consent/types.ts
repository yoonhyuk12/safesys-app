export interface PrivacyManager {
  name: string
  position: string
  email: string
  phone: string
}

export interface HealthQuestionnaireData {
  address: string
  phone: string
  blood_type: string // A, B, O, AB
  blood_rh: string // +, -
  emergency_contact_name: string
  emergency_contact_relation: string
  emergency_contact_phone: string
  diseases: string[] // 없음, 고혈압, 당뇨, 뇌혈관, 심혈관, 근골격계, 기타
  disease_other: string
  surgery_history: string // 없음, 있음
  surgery_detail: string
  recent_symptoms: string[] // 없음, 가슴통증, 어지러움, 식은땀, 메스꺼움, 두통, 호흡곤란, 언어장애, 시각장애
  aed_consent: string // 동의, 미동의
  accident_history: string // 없음, 있음
  accident_body_part: string
  accident_date: string
  smoking: string // 없음, 반갑미만, 반갑~한갑, 한갑이상
  drinking_frequency: string // 없음, 월1~3회, 주4~6회, 매일
  drinking_amount: string
}

export interface SafetyEquipmentData {
  items: string[] // 안전모, 안전화, 안전벨트, 보안경, 방진마스크, 귀마개, 기타
  other: string
}

export const CONSENT_STEPS = [
  { id: 1, label: '정보입력' },
  { id: 2, label: '동의서' },
  { id: 3, label: '건강문진표' },
  { id: 4, label: '안전서약서' },
] as const

export const DISEASE_OPTIONS = [
  '없음', '고혈압', '당뇨', '뇌혈관질환', '심혈관질환', '근골격계질환', '기타'
] as const

export const SYMPTOM_OPTIONS = [
  '없음', '가슴통증', '어지러움', '식은땀', '메스꺼움', '두통', '호흡곤란', '언어장애', '시각장애'
] as const

export const SAFETY_EQUIPMENT_OPTIONS = [
  '안전모', '안전화', '안전벨트', '보안경', '방진마스크', '귀마개', '기타'
] as const

export function createDefaultHealthData(): HealthQuestionnaireData {
  return {
    address: '',
    phone: '',
    blood_type: '',
    blood_rh: '+',
    emergency_contact_name: '',
    emergency_contact_relation: '',
    emergency_contact_phone: '',
    diseases: [],
    disease_other: '',
    surgery_history: '없음',
    surgery_detail: '',
    recent_symptoms: [],
    aed_consent: '동의',
    accident_history: '없음',
    accident_body_part: '',
    accident_date: '',
    smoking: '없음',
    drinking_frequency: '없음',
    drinking_amount: '',
  }
}

export function createDefaultSafetyEquipment(): SafetyEquipmentData {
  return {
    items: [],
    other: '',
  }
}
