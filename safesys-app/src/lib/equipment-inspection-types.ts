// 장비 일일점검 카탈로그와 제출 기록의 공통 타입을 정의한다.
export type EquipmentInspectionResult = 'pass' | 'fail' | 'na'
export interface EquipmentChecklistItem { id: string; category: string; text: string }
export interface EquipmentChecklist { id: string; name: string; sourcePage: number; items: EquipmentChecklistItem[] }
export interface EquipmentInspectionAnswer extends EquipmentChecklistItem { result: EquipmentInspectionResult; note: string }
export interface EquipmentInspection {
  id: string; project_id: string; equipment_type: string; equipment_name: string;
  inspection_date: string; company_name: string; vehicle_number: string; machine_number: string;
  inspector_name: string; signature: string; answers: EquipmentInspectionAnswer[];
  remarks: string; created_by: string | null; created_at: string;
}
