'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  HEADQUARTERS,
  BRANCH_OFFICES,
  INSPECTOR_AFFILIATIONS,
  CONSTRUCTION_STATUS,
  CONSTRUCTION_COST,
  CONSTRUCTION_TYPES_1,
  CONSTRUCTION_TYPES_2,
  YES_NO_OPTIONS,
  CHECKLIST_ITEMS,
  CHECK_OPTIONS,
  isDependsOnObject,
  type Headquarters,
  type Branch,
  type ConstructionStatus,
  type ConstructionCost,
  type YesNo,
  type CheckOption,
  type ChecklistItem,
  type InspectorAffiliation
} from '../lib/checklistData';
import jsPDF from 'jspdf';
import { Menu, ArrowLeft, Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface ConstructionTypeListProps {
  types: readonly string[];
  title: 'hasSpecialConstruction1' | 'hasSpecialConstruction2';
  label: string;
  value: YesNo | '';
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const ConstructionTypeList: React.FC<ConstructionTypeListProps> = ({ types, title, label, value, onChange }) => (
  <div className="form-group construction-type-item">
    <label className="checklist-label">
      {label}
      <div className="construction-types-list">
        {types.map((type, index) => (
          <div key={index} className="type-item">• {type}</div>
        ))}
      </div>
    </label>
    <div className="radio-group">
      {YES_NO_OPTIONS.map((option: YesNo) => (
        <label key={option} className="radio-label">
          <input
            type="radio"
            name={title}
            value={option}
            checked={value === option}
            onChange={onChange}
          />
          {option}
        </label>
      ))}
    </div>
  </div>
);

interface FormData {
  constructionStatus: ConstructionStatus | '';
  constructionCost: ConstructionCost | '';
  hasSpecialConstruction1: YesNo | '';
  hasSpecialConstruction2: YesNo | '';
  checklistItems: Record<string, CheckOption>;
  headquarters: Headquarters | '';
  branch: Branch | '';
  district: string;
  inspectionDate: string;
  inspectorName: string;
  projectName: string;
  inspectorAffiliation: InspectorAffiliation | '';
}

interface SafetyCheckFormProps {
  onBack?: () => void;
  embedded?: boolean; // 파일철 내부에 임베드될 때 true
  projectId?: string; // 프로젝트 ID
  onSaveSuccess?: () => void; // 저장 성공 시 콜백
}

const SafetyCheckForm: React.FC<SafetyCheckFormProps> = ({ onBack, embedded = false, projectId, onSaveSuccess }) => {
  const router = useRouter();
  const { user } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };
  const [isConstructionSectionCollapsed, setIsConstructionSectionCollapsed] = useState(false);
  const [isChecklistSectionCollapsed, setIsChecklistSectionCollapsed] = useState(true);
  const [isInspectorSectionCollapsed, setIsInspectorSectionCollapsed] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    constructionStatus: '',
    constructionCost: '',
    hasSpecialConstruction1: '',
    hasSpecialConstruction2: '',
    checklistItems: {},
    headquarters: '',
    branch: '',
    district: '',
    inspectionDate: new Date().toISOString().split('T')[0],
    inspectorName: '',
    projectName: '',
    inspectorAffiliation: ''
  });
  const [currentIncompleteIndex, setCurrentIncompleteIndex] = useState<number>(0);
  const [expandedDescriptions, setExpandedDescriptions] = useState<Record<string, boolean>>({});
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 로컬 스토리지에서 폼 데이터 복원
  useEffect(() => {
    const savedData = localStorage.getItem('safetyCheckFormData');
    if (savedData) {
      try {
        const parsedData = JSON.parse(savedData);
        setFormData(parsedData);
        setToastMessage('이전에 저장된 데이터를 불러왔습니다.');
        setToastType('success');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      } catch (error) {
        console.error('저장된 데이터를 불러오는 중 오류가 발생했습니다:', error);
      }
    }
  }, []);

  // 폼 데이터가 변경될 때마다 로컬 스토리지에 저장
  useEffect(() => {
    if (
      formData.constructionStatus !== '' ||
      formData.constructionCost !== '' ||
      formData.hasSpecialConstruction1 !== '' ||
      formData.hasSpecialConstruction2 !== '' ||
      Object.keys(formData.checklistItems).length > 0 ||
      formData.headquarters !== '' ||
      formData.branch !== '' ||
      formData.district !== '' ||
      formData.inspectorName !== '' ||
      formData.projectName !== '' ||
      formData.inspectorAffiliation !== ''
    ) {
      localStorage.setItem('safetyCheckFormData', JSON.stringify(formData));
    }
  }, [formData]);

  // 데이터 초기화 함수
  const resetFormData = () => {
    if (window.confirm('모든 데이터를 초기화하시겠습니까?')) {
      localStorage.removeItem('safetyCheckFormData');
      setFormData({
        constructionStatus: '',
        constructionCost: '',
        hasSpecialConstruction1: '',
        hasSpecialConstruction2: '',
        checklistItems: {},
        headquarters: '',
        branch: '',
        district: '',
        inspectionDate: new Date().toISOString().split('T')[0],
        inspectorName: '',
        projectName: '',
        inspectorAffiliation: ''
      });
      setIsConstructionSectionCollapsed(false);
      setIsChecklistSectionCollapsed(true);
      setIsInspectorSectionCollapsed(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToastMessage('데이터가 초기화되었습니다.', 'success');
    }
  };

  const filteredChecklistItems = useMemo(() => {
    if (!formData.constructionStatus && !formData.constructionCost &&
      !formData.hasSpecialConstruction1 && !formData.hasSpecialConstruction2) {
      return Object.entries(CHECKLIST_ITEMS).reduce((acc, [key, item]) => {
        acc[key] = {
          ...item,
          states: CONSTRUCTION_STATUS,
          costs: 'all',
          dependsOn: undefined,
          subItems: item.subItems ? item.subItems.map(subItem => ({
            title: subItem.title,
            states: undefined,
            costs: undefined,
            dependsOn: undefined
          })) : undefined
        };
        return acc;
      }, {} as Record<string, ChecklistItem>);
    }

    const items: Record<string, ChecklistItem> = {};

    (Object.entries(CHECKLIST_ITEMS) as [string, ChecklistItem][]).forEach(([key, value]) => {
      let shouldInclude = true;

      if (formData.constructionStatus && !value.states.includes(formData.constructionStatus)) {
        shouldInclude = false;
      }

      if (value.costs !== 'all' && formData.constructionCost) {
        if (!value.costs.includes(formData.constructionCost)) {
          shouldInclude = false;
        }
      }

      if (value.dependsOn) {
        if (typeof value.dependsOn === 'string') {
          if (value.dependsOn === 'hasSpecialConstruction1' && formData.hasSpecialConstruction1 !== '예') {
            shouldInclude = false;
          }
          if (value.dependsOn === 'hasSpecialConstruction2' && formData.hasSpecialConstruction2 !== '예') {
            shouldInclude = false;
          }
        } else if (isDependsOnObject(value.dependsOn)) {
          if (value.dependsOn.type === 'hasSpecialConstruction2' &&
            formData.hasSpecialConstruction2 !== value.dependsOn.condition) {
            shouldInclude = false;
          }
        }
      }

      if (shouldInclude) {
        items[key] = value;
      }
    });

    return items;
  }, [formData.constructionStatus, formData.constructionCost, formData.hasSpecialConstruction1, formData.hasSpecialConstruction2]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;

    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'hasSpecialConstruction1') {
      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const element = document.querySelector('[name="hasSpecialConstruction2"]')?.closest('.construction-type-item');
          if (element instanceof HTMLElement) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }, 300);
    }

    if (name.startsWith('checklistItems.')) {
      const newChecklistItems = {
        ...formData.checklistItems,
        [name.replace('checklistItems.', '')]: value as CheckOption
      };

      setFormData(prev => ({
        ...prev,
        checklistItems: newChecklistItems
      }));

      const itemKey = name.replace('checklistItems.', '');
      const [parentItem] = itemKey.split('.');

      setTimeout(() => {
        if (typeof window !== 'undefined') {
          const currentItem = filteredChecklistItems[parentItem];
          if (currentItem?.subItems) {
            const currentRow = (e.target as HTMLElement).closest('tr');
            const tbody = currentRow?.parentElement;
            if (tbody) {
              const rows = Array.from(tbody.children);
              const currentIndex = rows.indexOf(currentRow as Element);
              const isLastRow = currentIndex === rows.length - 1;

              if (isLastRow) {
                const allItems = Object.keys(filteredChecklistItems);
                const nextItemIndex = allItems.indexOf(parentItem) + 1;
                if (nextItemIndex < allItems.length) {
                  const nextElement = document.querySelector(`[data-checklist-item="${allItems[nextItemIndex]}"]`);
                  if (nextElement) {
                    nextElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }
                }
              } else {
                const nextRow = rows[currentIndex + 1];
                if (nextRow) {
                  nextRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }
            }
          } else {
            const allItems = Object.keys(filteredChecklistItems);
            const nextItemIndex = allItems.indexOf(parentItem) + 1;
            if (nextItemIndex < allItems.length) {
              const nextElement = document.querySelector(`[data-checklist-item="${allItems[nextItemIndex]}"]`);
              if (nextElement) {
                nextElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }
          }
        }
      }, 100);
    }

    if (['constructionStatus', 'constructionCost', 'hasSpecialConstruction1', 'hasSpecialConstruction2'].includes(name)) {
      const updatedFormData = {
        ...formData,
        [name]: value
      };

      const isComplete =
        updatedFormData.constructionStatus !== '' &&
        updatedFormData.constructionCost !== '' &&
        updatedFormData.hasSpecialConstruction1 !== '' &&
        updatedFormData.hasSpecialConstruction2 !== '';

      if (isComplete) {
        setIsConstructionSectionCollapsed(true);
        setIsChecklistSectionCollapsed(false);
      }
    }
  };

  const isConstructionSettingsComplete = useMemo(() => {
    return formData.constructionStatus !== '' &&
      formData.constructionCost !== '' &&
      formData.hasSpecialConstruction1 !== '' &&
      formData.hasSpecialConstruction2 !== '';
  }, [formData.constructionStatus, formData.constructionCost,
  formData.hasSpecialConstruction1, formData.hasSpecialConstruction2]);

  useEffect(() => {
    if (isConstructionSettingsComplete) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        setIsConstructionSectionCollapsed(true);
        setIsChecklistSectionCollapsed(false);
      }, 300);
    }
  }, [isConstructionSettingsComplete]);

  const isChecklistComplete = useMemo(() => {
    const totalRequiredChecks = Object.entries(filteredChecklistItems).reduce((total, [key, item]) => {
      if (item.subItems) {
        const validSubItems = item.subItems.filter(subItem => {
          const shouldShow = (!subItem.states || subItem.states.includes(formData.constructionStatus as ConstructionStatus)) &&
            (!subItem.costs || subItem.costs === 'all' || !formData.constructionCost ||
              (Array.isArray(subItem.costs) && subItem.costs.includes(formData.constructionCost as ConstructionCost)));
          return shouldShow;
        });
        return total + validSubItems.length;
      }
      return total + 1;
    }, 0);

    const currentCheckedItems = Object.entries(formData.checklistItems).reduce((total, [key]) => {
      const parentItem = key.includes('.') ? key.split('.')[0] : key;
      const item = filteredChecklistItems[parentItem];

      if (item) {
        if (key.includes('.')) {
          const [, subItemTitle] = key.split('.');
          const subItem = item.subItems?.find(si => si.title === subItemTitle);

          if (subItem) {
            const shouldShow = (!subItem.states || subItem.states.includes(formData.constructionStatus as ConstructionStatus)) &&
              (!subItem.costs || subItem.costs === 'all' || !formData.constructionCost ||
                (Array.isArray(subItem.costs) && subItem.costs.includes(formData.constructionCost as ConstructionCost)));

            if (shouldShow) {
              return total + 1;
            }
          }
        } else {
          return total + 1;
        }
      }
      return total;
    }, 0);

    return currentCheckedItems === totalRequiredChecks && currentCheckedItems > 0;
  }, [filteredChecklistItems, formData.checklistItems, formData.constructionStatus, formData.constructionCost]);

  useEffect(() => {
    if (isChecklistComplete) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => {
        setIsChecklistSectionCollapsed(true);
        setIsInspectorSectionCollapsed(false);
      }, 300);
    }
  }, [isChecklistComplete]);

  const isInspectorInfoComplete = useMemo(() => {
    return formData.inspectorName.trim() !== '' &&
      formData.inspectionDate !== '' &&
      formData.inspectorAffiliation !== '';
  }, [formData.inspectorName, formData.inspectionDate, formData.inspectorAffiliation]);

  const handleInspectorSectionClick = (e: React.MouseEvent) => {
    if (
      isInspectorInfoComplete &&
      !(e.target instanceof HTMLInputElement) &&
      !(e.target instanceof HTMLSelectElement) &&
      !(e.target instanceof HTMLButtonElement) &&
      !(e.target instanceof HTMLLabelElement)
    ) {
      setIsInspectorSectionCollapsed(true);
    }
  };

  const handleInspectorKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isInspectorInfoComplete) {
      setIsInspectorSectionCollapsed(true);
    }
  };

  const generatePDF = async () => {
    if (typeof window === 'undefined') return;

    try {
      const doc = new jsPDF();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas context creation failed');
      }

      canvas.width = 2480;
      canvas.height = 3508;

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000000';
      context.textBaseline = 'middle';

      context.font = 'bold 80px sans-serif';
      context.textAlign = 'left';
      context.fillText('안전서류 점검 결과', 200, 200);

      const projectNameText = `[${formData.projectName}]`;
      context.font = 'bold 70px sans-serif';
      const projectNameWidth = context.measureText(projectNameText).width;
      const boxPadding = 40;
      const boxWidth = projectNameWidth + (boxPadding * 2);
      const boxHeight = 100;
      const boxX = (canvas.width - boxWidth) / 2;
      const boxY = 350;

      context.fillStyle = '#f8f9fa';
      context.strokeStyle = '#e5e7eb';
      context.lineWidth = 3;
      context.beginPath();
      context.roundRect(boxX, boxY, boxWidth, boxHeight, 10);
      context.fill();
      context.stroke();

      context.fillStyle = '#000000';
      context.textAlign = 'center';
      context.fillText(projectNameText, canvas.width / 2, boxY + (boxHeight / 2) + 10);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      doc.addImage(dataUrl, 'JPEG', 0, 0, 210, 297);

      doc.save(`안전서류_점검결과.pdf`);
    } catch (error) {
      console.error('PDF 생성 중 오류 발생:', error);
      showToastMessage('PDF 생성 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
    }
  };

  // Supabase에 점검 결과 저장
  const saveToSupabase = async () => {
    if (!projectId) {
      showToastMessage('프로젝트 정보가 없습니다.', 'error');
      return;
    }

    if (!isInspectorInfoComplete || !isChecklistComplete || !isConstructionSettingsComplete) {
      showToastMessage('모든 필수 항목을 작성해주세요.', 'error');
      return;
    }

    try {
      setIsSaving(true);
      showToastMessage('저장 중...', 'success');

      // 집계 계산
      const checklistEntries = Object.values(formData.checklistItems);
      const compliantCount = checklistEntries.filter(v => v === '이행').length;
      const nonCompliantCount = checklistEntries.filter(v => v === '불이행').length;
      const notApplicableCount = checklistEntries.filter(v => v === '해당없음').length;

      const insertData = {
        project_id: projectId,
        inspection_date: formData.inspectionDate,
        inspector_name: formData.inspectorName,
        inspector_affiliation: formData.inspectorAffiliation,
        construction_status: formData.constructionStatus,
        construction_cost: formData.constructionCost,
        has_special_construction1: formData.hasSpecialConstruction1,
        has_special_construction2: formData.hasSpecialConstruction2,
        checklist_items: formData.checklistItems,
        compliant_items: compliantCount,
        non_compliant_items: nonCompliantCount,
        not_applicable_items: notApplicableCount,
        created_by: user?.id
      };

      const { error } = await supabase
        .from('safe_document_inspections')
        .insert(insertData);

      if (error) {
        throw error;
      }

      // 로컬 스토리지 초기화
      localStorage.removeItem('safetyCheckFormData');

      showToastMessage('저장되었습니다!', 'success');

      // 저장 성공 콜백 호출
      if (onSaveSuccess) {
        setTimeout(() => {
          onSaveSuccess();
        }, 1000);
      }
    } catch (error) {
      console.error('저장 오류:', error);
      showToastMessage('저장 중 오류가 발생했습니다. 다시 시도해 주세요.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!window.confirm('점검결과보고서를 받으셨습니까?')) {
      return;
    }

    try {
      showToastMessage('제출 진행 중...', 'success');

      const scriptURL = 'https://script.google.com/macros/s/AKfycbyKCSXEaXespeoXn-bSBQdRTFNFxPWetWGtU9cw-NmfIEgLqNwEMasWPGcD2_JrH9w/exec';

      const submitFormData = new FormData();

      const baseFields = {
        constructionStatus: formData.constructionStatus || '',
        constructionCost: formData.constructionCost || '',
        hasSpecialConstruction1: formData.hasSpecialConstruction1 || '',
        hasSpecialConstruction2: formData.hasSpecialConstruction2 || '',
        headquarters: formData.headquarters || '',
        branch: formData.branch || '',
        inspectionDate: formData.inspectionDate || '',
        inspectorName: formData.inspectorName || '',
        projectName: formData.projectName || '',
        inspectorAffiliation: formData.inspectorAffiliation || ''
      };

      Object.entries(baseFields).forEach(([key, value]) => {
        submitFormData.append(key, value);
      });

      Object.entries(formData.checklistItems).forEach(([key, value]) => {
        submitFormData.append(key, value || '');
      });

      setIsSubmitting(true);

      await fetch(scriptURL, {
        method: 'POST',
        body: submitFormData,
        mode: 'no-cors'
      });

      setIsSubmitting(false);

      showToastMessage('데이터를 성공적으로 제출했습니다.', 'success');

      localStorage.removeItem('safetyCheckFormData');

      setTimeout(() => {
        handleBack();
      }, 1500);

    } catch (error) {
      console.error('제출 중 오류 발생:', error);
      setIsSubmitting(false);
      showToastMessage('제출 중 오류가 발생했습니다. 다시 시도해주세요.', 'error');
    }
  };

  const findIncompleteItems = () => {
    return Object.keys(filteredChecklistItems).reduce<string[]>((acc, item) => {
      const checklistItem = filteredChecklistItems[item];

      if (checklistItem.subItems) {
        const uncheckedSubItems = checklistItem.subItems
          .filter(subItem => {
            const shouldShow = (!subItem.states || subItem.states.includes(formData.constructionStatus as ConstructionStatus)) &&
              (!subItem.costs || subItem.costs === 'all' || !formData.constructionCost ||
                (Array.isArray(subItem.costs) && subItem.costs.includes(formData.constructionCost as ConstructionCost)));

            if (shouldShow) {
              const key = `${item}.${subItem.title}`;
              return formData.checklistItems[key] === undefined;
            }
            return false;
          });

        if (uncheckedSubItems.length > 0) {
          acc.push(item);
        }
      } else {
        if (formData.checklistItems[item] === undefined) {
          acc.push(item);
        }
      }
      return acc;
    }, []);
  };

  const handleFloatingButtonClick = () => {
    const incompleteItems = findIncompleteItems();
    if (incompleteItems.length === 0) return;

    const nextIndex = (currentIncompleteIndex + 1) % incompleteItems.length;
    setCurrentIncompleteIndex(nextIndex);

    const itemKey = incompleteItems[nextIndex];
    const parentItem = itemKey.includes('.') ? itemKey.split('.')[0] : itemKey;

    const element = document.querySelector(`[data-checklist-item="${parentItem}"]`) as HTMLElement;
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      element.classList.remove('highlight-animation');
      void element.offsetWidth;
      element.classList.add('highlight-animation');
    }
  };

  const toggleDescription = (key: string) => {
    setExpandedDescriptions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const calculateLines = (text: string): number => {
    const lineHeight = 1.5;
    const fontSize = 14;
    const containerWidth = 800;

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return 0;

    context.font = `${fontSize}px sans-serif`;
    const words = text.split(' ');
    let line = '';
    let lineCount = 1;

    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = context.measureText(testLine);
      if (metrics.width > containerWidth) {
        line = word + ' ';
        lineCount++;
      } else {
        line = testLine;
      }
    }

    return lineCount;
  };

  const showToastMessage = (message: string, type: 'success' | 'error') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  return (
    <>
      {showToast && (
        <div
          className={`fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 px-8 py-4 rounded-lg shadow-xl text-white ${toastType === 'success' ? 'bg-green-600' : 'bg-red-600'
            } transition-opacity duration-300 flex items-center min-w-[300px] justify-center`}
        >
          <span className="text-xl font-medium">{toastMessage}</span>
        </div>
      )}

      {!embedded && (
        <header className="fixed top-0 left-0 right-0 bg-white shadow-sm border-b border-gray-200 z-50">
          <div className="max-w-3xl mx-auto px-5 py-2">
            <div className="grid grid-cols-[auto,1fr,auto] items-center gap-4">
              <button
                onClick={handleBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="뒤로가기"
              >
                <ArrowLeft size={24} />
              </button>
              <button
                className="text-base sm:text-lg md:text-[1.4rem] lg:text-2xl font-bold text-[var(--apple-text)] text-center hover:opacity-80 transition-opacity cursor-pointer"
              >
                안전서류 점검시스템
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={resetFormData}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
                  aria-label="데이터 초기화"
                  title="데이터 초기화"
                >
                  초기화
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      <div className={embedded ? "p-4" : "container pt-20"}>
        {/* embedded 모드일 때 상단 헤더 표시 */}
        {embedded && (
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">안전서류 점검 작성</h2>
            <button
              onClick={resetFormData}
              className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors text-sm font-medium shadow-sm"
              aria-label="데이터 초기화"
              title="데이터 초기화"
            >
              초기화
            </button>
          </div>
        )}

        {!isChecklistSectionCollapsed && (
          <button
            onClick={handleFloatingButtonClick}
            className="fixed bottom-4 right-4 bg-red-600 text-white px-6 py-3 rounded-full shadow-lg animate-fade-in z-50 hover:bg-red-700 transition-colors cursor-pointer"
          >
            진행상황 {Object.keys(formData.checklistItems).length}/{Object.entries(filteredChecklistItems).reduce((total, [, item]) => {
              if (item.subItems) {
                const validSubItems = item.subItems.filter(subItem => {
                  const shouldShow = (!subItem.states || subItem.states.includes(formData.constructionStatus as ConstructionStatus)) &&
                    (!subItem.costs || subItem.costs === 'all' || !formData.constructionCost ||
                      (Array.isArray(subItem.costs) && subItem.costs.includes(formData.constructionCost as ConstructionCost)));
                  return shouldShow;
                });
                return total + validSubItems.length;
              }
              return total + 1;
            }, 0)} 완료
          </button>
        )}

        {isConstructionSettingsComplete && isChecklistComplete && isInspectorInfoComplete && (
          <div className="sticky top-0 z-40 bg-white py-4 border-b border-gray-200 mb-6 animate-fade-in">
            <div className="flex justify-center gap-4 flex-wrap">
              {/* Supabase 저장 버튼 - projectId가 있을 때만 표시 */}
              {projectId && (
                <button
                  onClick={saveToSupabase}
                  disabled={isSaving}
                  className={`px-6 py-3 text-white rounded-lg transition-colors text-lg font-medium flex items-center gap-2 ${isSaving
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                >
                  {isSaving ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                  ) : (
                    <Save className="h-5 w-5" />
                  )}
                  {isSaving ? '저장 중...' : '저장하기'}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-5">
          <div className={`card relative transition-all duration-500 ease-in-out ${isConstructionSectionCollapsed ? 'order-2' : 'order-1'
            }`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">공사 여건 선택</h2>
              <button
                onClick={() => {
                  setIsConstructionSectionCollapsed(!isConstructionSectionCollapsed);
                  if (!isConstructionSectionCollapsed) {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="text-gray-600 hover:text-gray-800 transition-colors"
              >
                {isConstructionSectionCollapsed ? '펼치기 ▼' : '접기 ▲'}
              </button>
            </div>

            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isConstructionSectionCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
              }`}>
              <div className="flex gap-4 mb-4">
                <div className="form-group flex-1">
                  <label>공사 상태</label>
                  <select
                    name="constructionStatus"
                    value={formData.constructionStatus}
                    onChange={handleChange}
                    className="select-control"
                  >
                    <option value="">선택하세요</option>
                    {CONSTRUCTION_STATUS.map((status: ConstructionStatus) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label>총공사비 규모</label>
                  <select
                    name="constructionCost"
                    value={formData.constructionCost}
                    onChange={handleChange}
                    className="select-control"
                  >
                    <option value="">선택하세요</option>
                    {CONSTRUCTION_COST.map((cost: ConstructionCost) => (
                      <option key={cost} value={cost}>{cost}</option>
                    ))}
                  </select>
                </div>
              </div>

              <ConstructionTypeList
                types={CONSTRUCTION_TYPES_1}
                title="hasSpecialConstruction1"
                label="유해위험방지계획서 대상 공종 포함 여부"
                value={formData.hasSpecialConstruction1}
                onChange={handleChange}
              />

              <ConstructionTypeList
                types={CONSTRUCTION_TYPES_2}
                title="hasSpecialConstruction2"
                label="안전관리계획서 수립 대상 공종 포함 여부"
                value={formData.hasSpecialConstruction2}
                onChange={handleChange}
              />
            </div>

            {isConstructionSectionCollapsed && isConstructionSettingsComplete && (
              <div className="py-4 px-6 bg-gray-50 rounded-lg mt-2">
                <p className="text-sm text-gray-600">
                  공사 상태: {formData.constructionStatus}<br />
                  총공사비 규모: {formData.constructionCost}<br />
                  유해위험방지계획서: {formData.hasSpecialConstruction1}<br />
                  안전관리계획서: {formData.hasSpecialConstruction2}
                </p>
              </div>
            )}
          </div>

          <div
            data-section="checklist"
            className={`card relative transition-all duration-500 ease-in-out ${isChecklistSectionCollapsed ? 'order-3' : isConstructionSectionCollapsed ? 'order-1' : 'order-2'
              }`}
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">안전서류 체크리스트</h2>
              <button
                onClick={() => setIsChecklistSectionCollapsed(!isChecklistSectionCollapsed)}
                className="text-gray-600 hover:text-gray-800 transition-colors"
              >
                {isChecklistSectionCollapsed ? '펼치기 ▼' : '접기 ▲'}
              </button>
            </div>

            <div className={`transition-all duration-300 ease-in-out overflow-hidden ${isChecklistSectionCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
              }`}>
              {Object.keys(filteredChecklistItems).length === 0 ? (
                <p className="text-gray-500 text-center py-4">체크리스트 항목이 없습니다.</p>
              ) : (
                <div>
                  {!isConstructionSettingsComplete && (
                    <p className="text-amber-600 mb-4 p-4 bg-amber-50 rounded-lg">
                      ※ 공사 여건을 선택하시면 해당되는 체크리스트 항목만 필터링됩니다.
                    </p>
                  )}
                  <div className="max-h-[600px] overflow-y-auto pr-2">
                    {Object.entries(filteredChecklistItems).map(([key, item]) => (
                      <div
                        key={key}
                        data-checklist-item={key}
                        className="mb-4 last:mb-0 p-4 rounded-lg bg-gray-50"
                      >
                        <div className="flex justify-between items-center mb-4">
                          <label className="block font-medium text-lg">{key}</label>
                          {item.description && calculateLines(item.description) > 4 && (
                            <button
                              onClick={() => toggleDescription(key)}
                              className="text-blue-600 hover:text-blue-800 text-sm bg-white shadow-sm border border-gray-200 px-3 py-1 rounded-md"
                            >
                              {expandedDescriptions[key] ? '▲' : '▼'}
                            </button>
                          )}
                        </div>
                        {item.description && (
                          <div className="relative mb-2">
                            <div className="relative">
                              <p
                                className={`text-sm text-gray-600 whitespace-pre-wrap ${!expandedDescriptions[key] ? 'line-clamp-4' : ''}`}
                                dangerouslySetInnerHTML={{ __html: item.description.replace(/\n/g, '<br>') || '' }}
                              />
                              {!expandedDescriptions[key] && calculateLines(item.description) > 4 && (
                                <div
                                  className="absolute bottom-0 left-0 right-0 text-center bg-gradient-to-t from-gray-50 pt-4 cursor-pointer flex justify-center items-center gap-1 hover:opacity-80 transition-opacity"
                                  onClick={() => toggleDescription(key)}
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400"></div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        {item.subItems ? (
                          <div className="overflow-x-auto">
                            <table className="w-full border-collapse">
                              <thead>
                                <tr>
                                  <th className="border border-gray-300 bg-gray-50 p-2 text-center w-[60%]">항목</th>
                                  <th className="border border-gray-300 bg-gray-50 p-2 text-center w-[13%]">이행</th>
                                  <th className="border border-gray-300 bg-gray-50 p-2 text-center w-[13%]">불이행</th>
                                  <th className="border border-gray-300 bg-gray-50 p-2 text-center w-[14%]">해당없음</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.subItems.map((subItem, index) => {
                                  const shouldShow = (!subItem.states || subItem.states.includes(formData.constructionStatus as ConstructionStatus)) &&
                                    (!subItem.costs || subItem.costs === 'all' || !formData.constructionCost ||
                                      (Array.isArray(subItem.costs) && subItem.costs.includes(formData.constructionCost as ConstructionCost)));

                                  if (!shouldShow) return null;

                                  return (
                                    <tr key={index} className="border-b border-gray-200">
                                      <td className="border border-gray-300 p-2">{subItem.title}</td>
                                      {CHECK_OPTIONS.map((option) => (
                                        <td key={option} className="border border-gray-300 p-2 text-center">
                                          <input
                                            type="radio"
                                            name={`checklistItems.${key}.${subItem.title}`}
                                            value={option}
                                            checked={formData.checklistItems[`${key}.${subItem.title}`] === option}
                                            onChange={handleChange}
                                            className="w-4 h-4"
                                          />
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="radio-group">
                            {CHECK_OPTIONS.map((option) => (
                              <label key={option} className="radio-label">
                                <input
                                  type="radio"
                                  name={`checklistItems.${key}`}
                                  value={option}
                                  checked={formData.checklistItems[key] === option}
                                  onChange={handleChange}
                                />
                                {option}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {isChecklistSectionCollapsed && Object.keys(formData.checklistItems).length > 0 && (
              <div className="py-4 px-6 bg-gray-50 rounded-lg mt-2">
                <p className="text-sm text-gray-600">
                  {(() => {
                    const counts = Object.values(formData.checklistItems).reduce((acc, value) => {
                      acc[value] = (acc[value] || 0) + 1;
                      return acc;
                    }, {} as Record<CheckOption, number>);

                    return (
                      <>
                        이행: {counts['이행'] || 0}개<br />
                        불이행: {counts['불이행'] || 0}개<br />
                        해당없음: {counts['해당없음'] || 0}개
                      </>
                    );
                  })()}
                </p>
              </div>
            )}
          </div>

          <div className={`card relative transition-all duration-500 ease-in-out ${isInspectorSectionCollapsed ? 'order-3' : isChecklistSectionCollapsed ? 'order-1' : 'order-3'
            }`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">점검자 정보</h2>
              <button
                onClick={() => setIsInspectorSectionCollapsed(!isInspectorSectionCollapsed)}
                className="text-gray-600 hover:text-gray-800 transition-colors"
              >
                {isInspectorSectionCollapsed ? '펼치기 ▼' : '접기 ▲'}
              </button>
            </div>

            <div
              className={`transition-all duration-300 ease-in-out overflow-hidden ${isInspectorSectionCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2000px] opacity-100'
                }`}
              onClick={handleInspectorSectionClick}
            >
              <div className="flex gap-4">
                <div className="form-group flex-1">
                  <label>점검일자</label>
                  <input
                    type="date"
                    name="inspectionDate"
                    value={formData.inspectionDate}
                    onChange={handleChange}
                    onKeyDown={handleInspectorKeyDown}
                    className="select-control"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <div className="form-group flex-1">
                  <label>점검자 소속</label>
                  <select
                    name="inspectorAffiliation"
                    value={formData.inspectorAffiliation}
                    onChange={handleChange}
                    onKeyDown={handleInspectorKeyDown}
                    className="select-control"
                  >
                    <option value="">선택하세요</option>
                    {INSPECTOR_AFFILIATIONS.map((affiliation: InspectorAffiliation) => (
                      <option key={affiliation} value={affiliation}>{affiliation}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group flex-1">
                  <label>점검자명</label>
                  <input
                    type="text"
                    name="inspectorName"
                    value={formData.inspectorName}
                    onChange={handleChange}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && isInspectorInfoComplete) {
                        e.preventDefault();
                        setIsInspectorSectionCollapsed(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    onBlur={() => {
                      if (isInspectorInfoComplete) {
                        setIsInspectorSectionCollapsed(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                    className="select-control placeholder-gray-400"
                    placeholder="예) 4급 홍길동"
                  />
                </div>
              </div>
            </div>

            {isInspectorSectionCollapsed && isInspectorInfoComplete && (
              <div className="py-4 px-6 bg-gray-50 rounded-lg mt-2">
                <p className="text-sm text-gray-600">
                  점검자 소속: {formData.inspectorAffiliation}<br />
                  점검자명: {formData.inspectorName}<br />
                  점검일자: {formData.inspectionDate}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SafetyCheckForm;

