-- 검측요청서에 검측 사진 컬럼 추가 — [{ url, caption }] 배열, 최대 2컷 (앱에서 제한)
-- 사진 파일은 safety-inspection-photos 버킷의 {projectId}/ 폴더에 평면 저장한다
-- (프로젝트 삭제 라우트가 이 폴더를 통째로 정리하므로 별도 URL 수집이 필요 없다).
ALTER TABLE inspection_requests
  ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
