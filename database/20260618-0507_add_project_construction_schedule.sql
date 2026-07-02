-- 프로젝트 예정공정표(공종 기반) 저장 컬럼 추가
-- 공정표의 단일 출처: 공종(공사종류)·공사금액·旬별 일정/분포를 JSONB로 보관
-- 이 계획 곡선이 작업일보·캐비넷 명판·프로젝트 목록 공정률의 기준(마스터)이 된다.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS construction_schedule JSONB;

COMMENT ON COLUMN projects.construction_schedule IS '시공 예정공정표(공종/공사금액/旬별 일정·분포). 공정률 곡선의 단일 출처.';
