-- 검측요청서에 공사감독원 서명(base64 이미지) 컬럼 추가
ALTER TABLE inspection_requests ADD COLUMN supervisor_signature TEXT;
