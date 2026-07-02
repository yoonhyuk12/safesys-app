-- 프로젝트 사업카드(PDF) 링크 컬럼 추가
-- 프로젝트 수정/등록 폼의 선택사항에서 입력 (CCTV RTSP URL 위)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS business_card_pdf_url TEXT;

COMMENT ON COLUMN projects.business_card_pdf_url IS '사업카드(PDF) 링크 URL';
