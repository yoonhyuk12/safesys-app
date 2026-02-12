-- 근로자 동의서 시스템 전면 개편 마이그레이션
-- 실행 위치: Supabase SQL Editor

-- 1. projects 테이블에 개인정보 관리책임자 정보 추가
ALTER TABLE projects ADD COLUMN IF NOT EXISTS privacy_manager_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS privacy_manager_position TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS privacy_manager_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS privacy_manager_phone TEXT;

-- 2. workers 테이블에 동의/문진표/장비 필드 추가
ALTER TABLE workers ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS agree_personal_info BOOLEAN DEFAULT FALSE;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS agree_unique_id BOOLEAN DEFAULT FALSE;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS agree_sensitive_info BOOLEAN DEFAULT FALSE;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS agree_safety_pledge BOOLEAN DEFAULT FALSE;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS health_questionnaire JSONB;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS safety_equipment JSONB;
