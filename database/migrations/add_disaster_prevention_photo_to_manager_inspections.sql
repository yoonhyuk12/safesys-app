-- =====================================================
-- Add disaster prevention report columns
-- =====================================================
-- Date: 2025-01-18
-- Description: Add disaster prevention report photo and risk factors JSON columns to manager_inspections table
-- =====================================================

-- 1. Add disaster prevention report photo column
ALTER TABLE manager_inspections
ADD COLUMN IF NOT EXISTS disaster_prevention_report_photo TEXT;

COMMENT ON COLUMN manager_inspections.disaster_prevention_report_photo
IS 'Disaster prevention technical guidance report photo URL';

-- 2. Add disaster prevention risk factors JSON column
ALTER TABLE manager_inspections
ADD COLUMN IF NOT EXISTS disaster_prevention_risk_factors_json JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN manager_inspections.disaster_prevention_risk_factors_json
IS 'Disaster prevention technical guidance risk factors list JSON data';

-- =====================================================
-- Migration completed
-- =====================================================
