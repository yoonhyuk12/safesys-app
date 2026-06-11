-- 검측요청서에 현장대리인/검측자 서명(base64 이미지) 컬럼 추가
ALTER TABLE inspection_requests ADD COLUMN field_agent_signature TEXT;
ALTER TABLE inspection_requests ADD COLUMN inspector_signature TEXT;
