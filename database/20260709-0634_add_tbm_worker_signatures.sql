-- TBM 근로자 교육 확인 서명 테이블 (일일안전교육 서명부 — 작업장 출입 전 근로자 작업가능상태 점검)
-- 근로자는 비회원이므로 INSERT는 service-role API(/api/tbm-view/[id]/signatures)로만 수행한다.
CREATE TABLE tbm_worker_signatures (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- projects 직접 FK 없음 — tbm_submissions 경유 전이 CASCADE (merge_projects 개수 가드 영향 없음)
  tbm_submission_id UUID NOT NULL REFERENCES tbm_submissions(id) ON DELETE CASCADE,

  worker_name TEXT NOT NULL,           -- 근로자 성명 (비회원 익명 제출)
  tbm_confirmed BOOLEAN NOT NULL DEFAULT false,      -- TBM·위험성평가 교육 확인 → 시트 표기 '확인'
  no_alcohol BOOLEAN NOT NULL DEFAULT false,         -- 음주 안 함 → 시트 표기 'X'
  blood_pressure_ok BOOLEAN NOT NULL DEFAULT false,  -- 혈압 수축기 150 미만 → 시트 표기 '150미만'
  ppe_worn BOOLEAN NOT NULL DEFAULT false,           -- 보호구 착용 → 시트 표기 '착용'
  cctv_consent BOOLEAN NOT NULL DEFAULT false,       -- 안전 CCTV 촬영 동의 → 시트 표기 '동의'
  body_ok BOOLEAN NOT NULL DEFAULT false,            -- 몸(부상) 이상 없음 → 시트 표기 '이상없음'
  signature TEXT NOT NULL,             -- 손글씨 서명 (base64 data URL, Storage 미사용 — 행과 함께 삭제)

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tbm_worker_signatures_submission_id ON tbm_worker_signatures(tbm_submission_id);

-- RLS 활성화 — 조회는 기존 테이블 패턴과 동일하게 허용, 쓰기 정책은 만들지 않음(service-role 전용)
ALTER TABLE tbm_worker_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tbm worker signatures"
  ON tbm_worker_signatures FOR SELECT USING (true);
