-- 프로젝트 테이블에 위경도 컬럼 추가
-- 실행 방법: Supabase 대시보드의 SQL Editor에서 실행

ALTER TABLE projects 
ADD COLUMN latitude DECIMAL(10, 8),
ADD COLUMN longitude DECIMAL(11, 8);

-- 좌표 검색을 위한 인덱스 추가
CREATE INDEX idx_projects_coordinates ON projects (latitude, longitude);

-- 컬럼 설명 추가
COMMENT ON COLUMN projects.latitude IS '위도 (소수점 8자리)';
COMMENT ON COLUMN projects.longitude IS '경도 (소수점 8자리)';

-- 기존 데이터 확인 쿼리 (참고용)
-- SELECT id, project_name, site_address, latitude, longitude FROM projects; 