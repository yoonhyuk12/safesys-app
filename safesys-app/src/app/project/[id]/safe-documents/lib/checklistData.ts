// Base Types
export type Headquarters = 
  | '본사' 
  | '경기' 
  | '충남' 
  | '강원' 
  | '충북' 
  | '전북' 
  | '전남' 
  | '경북' 
  | '경남' 
  | '제주' 
  | '화안' 
  | '금강' 
  | '새만금' 
  | '영산강' 
  | '새만금산업단지' 
  | '토지개발'
  | '충남서부관리단'
  | '기타';

export type Branch = string;

export type InspectorPosition = '본사' | '본부' | '지사' | '현장대리인';
export type InspectorAffiliation = '본사' | '본부' | '지사' | '시공사' | '기타';
export type ConstructionStatus = '착공전' | '공사중' | '공사중지';
export type ConstructionCost = 
  | '1억 미만'
  | '1억 이상 ~ 5억 미만'
  | '5억 이상 ~ 20억 미만'
  | '20억 이상 ~ 50억 미만'
  | '50억 이상 ~ 120억 미만'
  | '120억 이상 ~ 150억 미만'
  | '150억 이상';
export type YesNo = '예' | '아니오';
export type CheckOption = '이행' | '불이행' | '해당없음';

// Constant Arrays with Type Safety
export const HEADQUARTERS: readonly Headquarters[] = [
  '본사', '경기', '충남', '강원', '충북', '전북', '전남', '경북', '경남', '제주',
  '화안', '금강', '새만금', '영산강', '새만금산업단지', '토지개발', '충남서부관리단', '기타'
];

export const INSPECTOR_AFFILIATIONS: readonly InspectorAffiliation[] = ['본사', '본부', '지사', '시공사', '기타'];

export const BRANCH_OFFICES: Readonly<Record<Headquarters, readonly Branch[]>> = {
  '본사': ['본사', '안전혁신', '기획전략', '기반사업', '수자원관리', '농어촌계획', '농지은행', '농어촌연구', '인재개발', '농자원'],
  '경기': [
    '경기본부',
    '여주·이천지사',
    '양평·광주·서울지사',
    '화성·수원지사',
    '연천·포천·가평지사',
    '파주지사',
    '고양지사',
    '강화·옹진지사',
    '김포지사',
    '평택지사',
    '안성지사'
  ],
  '충남': [
    '충남본부',
    '천안지사',
    '공주지사',
    '보령지사',
    '아산지사',
    '서산·태안지사',
    '논산지사',
    '세종·대전·금산지사',
    '부여지사',
    '서천지사',
    '청양지사',
    '홍성지사',
    '예산지사',
    '당진지사'
  ],
  '강원': [
    '강원본부',
    '홍천·춘천지사',
    '원주지사',
    '강릉지사',
    '속초·고성·양양지사',
    '철원·화천지사'
  ],
  '충북': [
    '충북본부',
    '청주지사',
    '보은지사',
    '옥천·영동지사',
    '진천지사',
    '괴산·증평지사',
    '음성지사',
    '충주·제천·단양지사'
  ],
  '전북': [
    '전북본부',
    '남원지사',
    '순창지사',
    '동진지사',
    '부안지사',
    '군산지사',
    '익산지사',
    '전주·완주·임실지사',
    '고창지사',
    '정읍지사',
    '무진장지사'
  ],
  '전남': [
    '전남본부',
    '광주지사',
    '순천·광양·여수지사',
    '나주지사',
    '담양지사',
    '곡성지사',
    '구례지사',
    '고흥지사',
    '보성지사',
    '화순지사',
    '장흥지사',
    '강진지사',
    '해남·완도지사',
    '영암지사'
  ],
  '경북': [
    '경북본부',
    '포항·울릉지사',
    '경주지사',
    '안동지사',
    '구미·김천지사',
    '영주·봉화지사',
    '영천지사',
    '상주지사',
    '문경지사',
    '경산·청도지사',
    '의성·군위지사',
    '청송·영양지사',
    '영덕·울진지사',
    '고령지사',
    '성주지사',
    '칠곡지사',
    '예천지사',
    '달성지사'
  ],
  '경남': [
    '경남본부',
    '김해·양산·부산지사',
    '고성·통영·거제지사',
    '울산지사',
    '진주·산청지사',
    '의령지사',
    '함안지사',
    '창녕지사',
    '밀양지사',
    '창원지사',
    '사천지사',
    '거창·함양지사',
    '합천지사'
  ],
  '제주': [
    '제주본부',
    '서귀포제주지부',
    '농업용수통합광역화추진단'
  ],
  '화안': [
    '사업관리부',
    '시설관리부'
  ],
  '금강': [
    '사업관리부',
    '시설관리부'
  ],
  '새만금': [
    '사업관리부외',
    '사업관리부'
  ],
  '영산강': [
    '사업관리부외',
    '사업관리부'
  ],
  '새만금산업단지': [
    '사업관리부외',
    '사업관리부'
  ],
  '토지개발': [
    '토지관리부',
    '토지개발부'
  ],
  '충남서부관리단': [
    '사업관리부',
    '시설관리부'
  ],
  '기타': ['기타']
} as const;

export const INSPECTOR_POSITIONS: readonly InspectorPosition[] = ['본사', '본부', '지사', '현장대리인'];

export const CONSTRUCTION_STATUS: readonly ConstructionStatus[] = ['착공전', '공사중', '공사중지'];

export const CONSTRUCTION_COST: readonly ConstructionCost[] = [
  '1억 미만',
  '1억 이상 ~ 5억 미만',
  '5억 이상 ~ 20억 미만',
  '20억 이상 ~ 50억 미만',
  '50억 이상 ~ 120억 미만',
  '120억 이상 ~ 150억 미만',
  '150억 이상'
];

export const CONSTRUCTION_TYPES_1 = [
  '31m이상 건축물',
  '연면적 3만제곱미터 이상 건축물',
  '연면적 5천제곱미터 이상 창고외시설',
  '교량(최대지간50m 이상)',
  '터널공사',
  '저수용량 2천만톤이상댐',
  '10m이상 굴착공사'
] as const;

export const CONSTRUCTION_TYPES_2 = [
  '1,2종 시설물 건설공사',
  '지하 10m 이상 굴착 공사',
  '폭발물 사용',
  '10층 이상,16층 미만 건축물 공사',
  '10층 이상 건축물 리모델링 공사',
  '수직증축형 리모델링',
  '천공기, 항타항발기, 타워크레인 사용 공사',
  '가설구조물(31m이상 비계, 5m이상 거푸집, 동바리, 갱폼, 2m 이상 흙막이, 10m이상 외부작업용 가설구조물) 사용공사'
] as const;

export const YES_NO_OPTIONS: readonly YesNo[] = ['예', '아니오'];

export const CHECK_OPTIONS: readonly CheckOption[] = ['이행', '불이행', '해당없음'];

// Complex Types
export interface DependsOnObject {
  readonly type: 'hasSpecialConstruction2';
  readonly condition: YesNo;
}

export type DependsOnType = DependsOnObject | 'hasSpecialConstruction1' | 'hasSpecialConstruction2';

export interface SubChecklistItem {
  readonly title: string;
  readonly states?: readonly ConstructionStatus[];
  readonly costs?: 'all' | readonly ConstructionCost[];
  readonly dependsOn?: DependsOnType;
}

export interface ChecklistItem {
  readonly states: readonly ConstructionStatus[];
  readonly costs: 'all' | readonly ConstructionCost[];
  readonly dependsOn?: DependsOnType;
  readonly subItems?: readonly SubChecklistItem[];
  readonly description?: string;
}

// Type Guards
export const isDependsOnObject = (value: DependsOnType): value is DependsOnObject =>
  typeof value === 'object' && value !== null && 'type' in value && value.type === 'hasSpecialConstruction2';

// Checklist Items with Strict Typing
export const CHECKLIST_ITEMS: Readonly<Record<string, ChecklistItem>> = {
  '공사안전보건대장': {
    states: ['착공전', '공사중'] as const,
    costs: ['50억 이상 ~ 120억 미만', '120억 이상 ~ 150억 미만', '150억 이상'] as const,
    subItems: [
      { 
        title: '공사안전보건대장 작성'
      },
      { 
        title: '공사안전보건대장 전문가 적정성 확인'
      },
      { 
        title: '발주자 예방조치 이행확인(3개월당1회)',
        states: ['공사중'] as const
      }
    ],
    description: 
      '• 대상 : 총공사비 50억원 이상<br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/admRulSc.do?menuId=5&subMenuId=41&tabMenuId=183&query=' + 
      '%EA%B1%B4%EC%84%A4%EA%B3%B5%EC%82%AC%20%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%8C%80%EC%9E%A5%EC%9D%98%20' + 
      '%EC%9E%91%EC%84%B1%20%EB%93%B1%EC%97%90%20%EA%B4%80%ED%95%9C%20%EA%B3%A0%EC%8B%9C#liBgcolor0" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건설공사 안전보건대장의 작성 등에 관한 고시</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://law.go.kr/LSW/admRulBylInfoPLinkR.do?admRulSeq=2100000186085&admRulNm=' + 
      '%EA%B1%B4%EC%84%A4%EA%B3%B5%EC%82%AC%20%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%8C%80%EC%9E%A5%EC%9D%98%20' + 
      '%EC%9E%91%EC%84%B1%20%EB%93%B1%EC%97%90%20%EA%B4%80%ED%95%9C%20%EA%B3%A0%EC%8B%9C&bylNo=0003&bylBrNo=00&' + 
      'bylCls=BF&bylClsCd=BF&joEfYd=&bylEfYd=" target="_blank" class="text-blue-600 hover:underline">' + 
      '공사안전보건대장 양식</a><br />' + 
      '• <a href="https://drive.google.com/file/d/19owBCt4h4mt3IKiloeI_l39_rDi_OEG2/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">예방조치 이행 확인표 샘플양식</a><br />' + 
      '• <a href="https://drive.google.com/file/d/1wPp917VaE_R13WYvjEmsF1UOyoVVpsUx/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전보건대장 전문가 적정성 확인 지침</a><br />' +
      '• 주의 : "설계 변경시 산업안전보건관리비 금액변경 기록(필수)"'
  },
  '시공안전계획서': {
    states: CONSTRUCTION_STATUS,
    costs: ['5억 이상 ~ 20억 미만', '20억 이상 ~ 50억 미만', '50억 이상 ~ 120억 미만', '120억 이상 ~ 150억 미만', '150억 이상'] as const,
    dependsOn: {
      type: 'hasSpecialConstruction2',
      condition: '아니오'
    },
    description: 
      '• 대상 : 총공사비 5억원 이상인 공사<br />' + 
      '• 관련 : ' + 
      '<a href="https://drive.google.com/file/d/16Fy_Ar29hTS2VQtvsFTmaJDpiB_b1pP4/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">' + 
      '공사 건설공사 안전관리지침 제6조(시공 안전 계획 수립)</a><br />' + 
      '• 샘플양식 : ' + 
      '<a href="https://drive.google.com/file/d/1bqAJ5MowMXdkOlOhxFzWZJVNA0p_TnYF/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">' + 
      '시공안전계획서 샘플양식(타회사)</a><br />'      
  },  
  '안전관리계획서': {
    states: CONSTRUCTION_STATUS,
    costs: 'all',
    dependsOn: {
      type: 'hasSpecialConstruction2',
      condition: '예'
    },
    subItems: [
      {
        title: '안전관리계획서 작성 및 비치',
        states: CONSTRUCTION_STATUS,
        costs: 'all'
      },
      {
        title: '안전관리실태 확인 회의 실시(월1회)',
        states: ['공사중'] as const,
        costs: 'all'
      }
    ],
    description: 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1017392599&chrClsCd=010202&ancYnChk=" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전관리계획수립대상(건진법 제98조)</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://drive.google.com/file/d/1QyURz4p6NYyn7lZKIlabgnQL7NTJ3hqm/view" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전관리계획서 검토비용 기준안내</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1g8gW-Tgd4vqq9flNhcsQCcG6iWX9fn3b/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전관리실태 확인 회의양식</a><br />' + 
      '• 대상공사:<br />' + 
      '  - 1종/2종 시설물 건설공사(유지관리 제외)<br />' + 
      '  - 지하 10m 이상 굴착공사(집수정, E/V피트, 정화조 제외)<br />' + 
      '  - 20m내 시설물/100m내 가축이 있는 폭발물 사용 공사<br />' + 
      '  - 10층 이상 16층 미만 건축물 공사<br />' + 
      '  - 10층 이상 건축물 리모델링/해체, 수직증축형 리모델링<br />' + 
      '  - 천공기(10m이상), 항타/항발기, 타워크레인 사용 공사<br />' + 
      '  - 가설구조물 사용 공사<br />' + 
      '  - 발주자/지자체가 필요하다고 인정하는 공사<br />' + 
      '• 참고 : ' + 
      '<a href="https://www.law.go.kr/admRulLinkProc.do?lsiSeq=2100000216960&lsClsCd=010202&chrClsCd=010202&' + 
      'joNo=0009000000&mode=2&gubun=admRul&admRulSeq=2100000216960&admRulNm=' + 
      '%EA%B1%B4%EC%84%A4%EA%B3%B5%EC%82%AC%20%EC%95%88%EC%A0%84%EA%B4%80%EB%A6%AC%20' + 
      '%EC%97%85%EB%AC%B4%EC%88%98%ED%96%89%20%EC%A7%80%EC%B9%A8&datClsCd=010102" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건설공사 안전관리 업무수행 지침 제9조의4</a>' + 
      '(국토교통부 고시)에 따라 안전관리 실태 회의를 해야함(위험성평가 회의, 안전보건조정자 회의, ' + 
      '안전보건협의체회의 실시시 병행 추천)'
  },
  '정기안전점검(최소2회 이상)': {
    states: ['공사중'] as const,
    costs: 'all',
    dependsOn: 'hasSpecialConstruction2',
    description:
    '• 대상 : 안전관리계획서 수립현장<br />' + 
    '• 관련 : <a href="https://www.law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1017732939&chrClsCd=010202&ancYnChk=" target="_blank" class="text-blue-600 hover:underline">건설기술 진흥법 시행령 제100조(안전점검 시기, 방법 등) 제1항 제3호</a><br />• 등록 : <a href="https://www.csi.go.kr/main.do?isMobile=null" target="_blank" class="text-blue-600 hover:underline">정기점검보고서, 종합보고서 사이트(건설공사 안전관리 종합정보망) 등록</a><br />• 참고 : <a href="https://www.law.go.kr/admRulBylInfoPLinkR.do?admRulSeq=2100000216960&admRulNm=%EA%B1%B4%EC%84%A4%EA%B3%B5%EC%82%AC%20%EC%95%88%EC%A0%84%EA%B4%80%EB%A6%AC%20%EC%97%85%EB%AC%B4%EC%88%98%ED%96%89%20%EC%A7%80%EC%B9%A8&bylNo=0001&bylBrNo=00&bylCls=BE&bylClsCd=BE&joEfYd=&bylEfYd=" target="_blank" class="text-blue-600 hover:underline">정기안전점검 실시시기</a>'
  },
  '가설구조물 구조적 안전성 검토': {
    states: ['착공전', '공사중'] as const,
    costs: 'all',
    dependsOn: 'hasSpecialConstruction2',
    description: '• 관련 : <a href="https://www.law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1017732397&chrClsCd=010202&ancYnChk=" target="_blank" class="text-blue-600 hover:underline">건설기술 진흥법 시행령 제101조의2(가설구조물의 구조적 안전성 확인)</a><br />• 양식 : <a href="https://drive.google.com/file/d/1Qku39d-Bbf1BxyI0nctt91IUANlJ1V6X/view?usp=share_link" target="_blank" class="text-blue-600 hover:underline">(공사양식) 가설구조물 안전성 검토 확인서</a><br />• 참고 : <a href="https://drive.google.com/file/d/1lWZdUifwVg4t5fZM50OKlItMyzJnuaRK/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">설계, 설계변경시 비계는 구조검토서 첨부 필요(비계 및 안전시설물 설계 기준)</a><br />• 대상 가설구조물:<br />  - 31m 이상 비계<br />  - 브라켓 비계<br />  - 5m 이상 거푸집/동바리, 작업발판 일체형 거푸집<br />  - 터널 지보공, 2m 이상 흙막이 지보공<br />  - 동력을 이용하는 가설구조물<br />  - 10m 이상 외부작업용 작업발판/안전시설물<br />  - 현장제작 복합형 가설구조물<br />  - 발주자/인허가기관이 필요하다고 인정하는 가설구조물'
  },
  '일일안전점검': {
    states: ['공사중'] as const,
    costs: 'all',
    description:
     '• 대상 : 모든건설 현장<br />' + 
     '• 관련 : <a href="https://www.law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1017732939&chrClsCd=010202&ancYnChk=" target="_blank" class="text-blue-600 hover:underline">건설기술 진흥법 시행령 제100조(안전점검의 시기ㆍ방법 등)</a><br />• 양식 : <a href="https://drive.google.com/file/d/12_IhSP4bG0zDvYUEgcjYsJT5qAm1hvJm/view?usp=drivesdk" target="_blank" class="text-blue-600 hover:underline">(공사양식) 일일점검일지</a><br />• 참고 : 일일점검시 "위험성평가" 이행사항 체크내역 반영'
  },
  '위험공종 작업허가제': {
    states: ['공사중'] as const,
    costs: 'all',
    subItems: [
      { title: '위험공종 작업허가 이행 여부' },
      { title: '안전실명제 실시 여부' }
    ],
    description:
     '• 대상 : 2.0m 이상 고소작업, 1.5m 이상 굴착·가설공사, 철골 구조물 공사, 2.0m이상 외부 도장공사, 승강기 설치공사, 취수탑 공사, 복통, 잠관 공사, 이외의 작업계획서작성 대상<br />' + 
     '• 관련 : <a href="https://drive.google.com/file/d/16Fy_Ar29hTS2VQtvsFTmaJDpiB_b1pP4/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">공사 건설공사 안전관리지침 제13조(위험 공정 작업 허가제)</a><br />' + 
     '• 양식 : <a href="https://drive.google.com/file/d/1CYTtVxB3em4l2AMKXhZuf4jTZbNq8029/view?usp=drive_link" ' + 
     'target="_blank" class="text-blue-600 hover:underline">위험공종작업허가제.hwp(양식)</a><br />'+
      '• 양식 : <a href="https://drive.google.com/file/d/1mDa_55DtxWbW_kiRid06gnvIGSOjn7ga/view?usp=drive_link" ' + 
     'target="_blank" class="text-blue-600 hover:underline">위험공종작업허가 이행확인.hwp(양식)</a><br />'
  },
  '작업계획서': {
    states: ['공사중'] as const,
    costs: 'all',
    description: '• 관련법 : <a href="https://www.law.go.kr/lsLawLinkInfo.do?lsJoLnkSeq=1016699585&chrClsCd=010202&ancYnChk=" target="_blank" class="text-blue-600 hover:underline">산업안전보건기준에 관한 규칙 제38조(사전조사 및 작업계획서의 작성 등)</a><br />• 양식 : <a href="https://drive.google.com/file/d/1mafzvAt1IskgsQZCJ6lfbf1zT9QmbYX9/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">(양식) 차량계 건설기계 작업계획서</a><br />• 양식 : <a href="https://drive.google.com/file/d/16by0cv8IvQm73nv7jHLMZXay3uoM4pkV/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">(양식) 중량물 취급계획서</a><br />• 양식 : <a href="https://drive.google.com/file/d/1ulUy_JuvXd2rkij4mes69Va3e14evqZS/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">(양식) 차량계하역운반기계 등 사용 작업계획서</a><br />• 양식 : <a href="https://drive.google.com/file/d/1alME3eGuqZA-qi1KYwPRaVlOBuZhdsxo/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">(양식) 전기작업계획서</a><br />• 참고 : <a href="https://www.law.go.kr/LSW//lsBylInfoPLinkR.do?lsiSeq=245059&lsNm=%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EA%B8%B0%EC%A4%80%EC%97%90+%EA%B4%80%ED%95%9C+%EA%B7%9C%EC%B9%99&bylNo=0006&bylBrNo=00&bylCls=BE&bylEfYd=20221018&bylEfYdYn=Y" target="_blank" class="text-blue-600 hover:underline">차량계 건설기계 종류(17종)</a><br />• 참고 : <a href="https://drive.google.com/file/d/1Fe-nG7TSP24ExK6iVl_VyKV9U15ULpNM/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">작업계획서 기재내용(별표4)</a><br />• 참고 : <a href="https://drive.google.com/file/d/1WHlyzSU5R6fjEp0HHN5xGJiZe5SFTGBS/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">작업지휘자 지정, 배치·운영 및 작업계획서 작성 가이드</a><br />• 참고 : 작업지휘자, 유도원은 현장대리인, 안전관리자 지정 불가<br />            관리감독자, 작업반장 급 중간관리자 임명'
  },
  '안전보건조정자 선임 및 회의': {
    states: ['공사중'] as const,
    costs: ['50억 이상 ~ 120억 미만', '120억 이상 ~ 150억 미만', '150억 이상'] as const,
    description: 
      '• 대상 : 총공사비 50억이상, 2개의 건설공사가 같은장소에서 실시되는 경우<br />' + 
      '• 주의1 : 꼭 시공사로 "안전보건조정자" 통보서 공문을 보내야함<br />' +
      '• 주의2 : 합동안전보건점검반 구성하여 점검 실시(월1회), 점검표 작성<br />' +     
      '• 주의3 : 공감일지에 구체적인 활동 사항을 작성<br />' +     
      '• 주의4 : 안전보건조정자는 안전보건조정회의시 안전보건 관련 자료 등 제공<br />' +     
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/12TNgx-bDvVkyQDLHabSkTvNT1bgnViUi/view?usp=share_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">지정 통보서 공문(샘플).hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1mOOQw12hXpy2_RkFq6j9sBXKK_sWZt4n/view?usp=share_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전보건조정자 선임서(양식).hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1g8gW-Tgd4vqq9flNhcsQCcG6iWX9fn3b/view" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전보건조정 회의 결과(양식).hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1xTlsA3Z7DzVAiVH9BaPl3UENfzT5HY5H/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전보건조정자 이행여부 점검표(양식).hwp</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/lsLinkCommonInfo.do?lspttninfSeq=154207&chrClsCd=010202" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행령 제56조, 제57조</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://drive.google.com/file/d/1TZ7UZ9KXzudS0GrVaON4PFKKngHWRSUU/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전보건조정자 업무매뉴얼(25.05개정)</a><br />' + 
      '• 선임자격 : 책임감리자, 건설안전기술사, 건설안전기사(5년이상), 건설산업기사(7년이상) 등<br />' + 
      '• 내용 : 선임통보(착공이전), 월1회 점검(공사 실시하는 월만)<br />' + 
      '※ VAR에 따라 위험성평가 회의, 안전보건협의체 회의, 안전보건조정자 회의 하나의 양식으로 같이 진행'
  },  
  '건진법 안전관리비 사용내역': {
    states: ['공사중', '공사중지'] as const,
    costs: 'all',
    description: '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1zEvWUThxJvdNHsmF_ird8r0RhueWdFnc/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건진법 안전관리비 사용내역서</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/%ED%96%89%EC%A0%95%EA%B7%9C%EC%B9%99/%EA%B1%B4%EC%84%A4%EA%B3%B5%EC%82%AC%EC%95%88%EC%A0%84%EA%B4%80%EB%A6%AC%EC%97%85%EB%AC%B4%EC%88%98%ED%96%89%EC%A7%80%EC%B9%A8/(2022-791,20221220)/%EC%A0%9C52%EC%A1%B0" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건설공사 안전관리 업무수행 지침-국토부</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://drive.google.com/file/d/1zlKR1rIqBdBB67u1wGCDCnwuBA624ZLh/view?usp=drivesdk" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건진법 안전관리비 사용항목</a><br />' + 
      '• 정산 : 산안비과 같게, 실정산금액에 대해서 정산<br />' +
      '※ 감리자는 6개월 마다 1회 이상 내역 확인'
  },
  '산업안전보건관리비 사용내역': {
    states: ['공사중', '공사중지'] as const,
    costs: 'all',
    description: '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1Eh8HpgeW3a5-uhaTlwR1uxX4SSgzzwbP/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건관리비 집행(양식)</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/%ED%96%89%EC%A0%95%EA%B7%9C%EC%B9%99/%EA%B1%B4%EC%84%A4%EC%97%85%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EA%B4%80%EB%A6%AC%EB%B9%84%EA%B3%84%EC%83%81%EB%B0%8F%EC%82%AC%EC%9A%A9%EA%B8%B0%EC%A4%80/(2024-53,20240919)/%EC%A0%9C9%EC%A1%B0" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건설업 산업안전보건관리비 계상 및 사용기준 제9조</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://www.law.go.kr/lsLinkCommonInfo.do?lspttninfSeq=75381&chrClsCd=010202" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행령 제18조(안전관리자의 업무 등)</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://drive.google.com/file/d/1V8e6jBXsm10s__gfICnUEg8X7eHFLRGs/view?usp=drivesdk" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건관리비 사용기준</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://drive.google.com/file/d/1T89ZhIdyt6KCRlyjbfgWscAiZHQh3_qq/view?usp=drivesdk" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건관리비 불가항목(해설집 발췌)</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://drive.google.com/file/d/1SE2O--T3U5vZM2hUe_MNxVRZfnhEbhZy/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">변경계약시 산업안전관리비 증가감 방법.PDF</a><br />' + 
      '• 시공자는 사용명세서를 매월 작성하여 보존, 감리자는 6개월 마다 1회 이상 내역 확인(공사 지침상 1개월 단위 내역 확인)<br />' + 
      '• 안전관리자 인건비 : 겸직(50%), 전담(100%), 단 지방관서에 선임 보고한 날 이후<br />' + 
      '• 증빙 : 노동부 선임 신고서, 안전업무일지 등, 기타 제반서류<br />' + 
      '• 주의 : "설계 변경시 산업안전보건관리비 금액변경 기록(필수)"'
  },
  '안전보건교육': {
    states: ['공사중', '공사중지'] as const,
    costs: 'all',
    subItems: [
      { 
        title: '안전보건관리책임자 교육(6시간 이상, 신규/보수)',
        costs: ['20억 이상 ~ 50억 미만', '50억 이상 ~ 120억 미만', '120억 이상 ~ 150억 미만', '150억 이상'] as const
      },
      { title: '관리감독자 교육(연간 16시간 이상)' },
      { title: '정기교육(사무직 외 근로자, 매반기 12시간 이상)' },
      { title: '특별교육 대상자(2/8/16시간 이상)' },
      { title: '특수형태근로종사자 교육(최초2시간이상)' },
      { title: 'MSDS(물질안전보건) 교육' },
      { title: '채용시 교육(1/4/8시간 이상)' },
      { title: '건설업 기초안전보건교육(4hr) 수료증' }
    ],
    description: 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1w-FmvA532CFVp22SEfCVlwksFKZ3PI89/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 관리감독자 정기교육_샘플양식.hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1oPVesEP2AxRE89x8-cJtT5E38ADuMtbV/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 근로자 정기안전보건교육_샘플양식.hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1Lf9O3_lsw0QXNzNR3rVZf_rEDe22X2qF/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 특별교육 일지_샘플양식.hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1M0sxr4xUmp3dFRjbRJseigb0u8jQc-xF/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 물질안전보건 교육일지_샘플양식.hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1P-XWawnzahMPnfGg9EBPBQSMkG7dS0Ua/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 특수형태근로종사자 교육일지_샘플양식.hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1Rt9aCE6B3792P4HZY6StcTA6LevdmeJL/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 채용시, 작업내용변경시 교육일지_샘플양식.hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1-tQehjmOdWqVxUXUgw6HGY98_EcEcfTk/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 참석자 서명부.hwp</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/lsBylInfoPLinkR.do?lsiSeq=212709&lsNm=%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%B2%95+%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99&bylNo=0004&bylBrNo=00&bylCls=BE&bylEfYd=20200116&bylEfYdYn=Y" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산안법 시행규칙 제26조 제1항 별표4(교육시간)</a><br />' + 
      '• 교육일지 포함내용 : ' + 
      '<a href="https://www.law.go.kr/lsBylInfoPLinkR.do?lsiSeq=2100000220126&lsNm=%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%B2%95%20%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99&bylNo=0005&bylBrNo=00&bylCls=BE&bylEfYd=" ' + 
      'target="_blank" class="text-blue-600 hover:underline">교육일지 작성 방법</a><br />' + 
      '• 특별교육 대상 : ' + 
      '<a href="https://www.law.go.kr/lsBylInfoPLinkR.do?lsiSeq=212709&lsNm=%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%B2%95+%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99&bylNo=0005&bylBrNo=00&bylCls=BE&bylEfYd=20200116&bylEfYdYn=Y" ' + 
      'target="_blank" class="text-blue-600 hover:underline">특별교육 대상 작업</a><br />' + 
      '• 주요 특별교육 대상 작업:<br />' + 
      '  - 1톤 이상 크레인 사용 작업<br />' + 
      '  - 흙막이 지보공의 보강 또는 동바리 설치, 해체 작업<br />' + 
      '  - 거푸집 동바리의 조립 또는 해체 작업<br />' + 
      '  - 2m 이상 굴착 작업<br />' + 
      '• 교육시간:<br />' + 
      '  - 안전보건관리책임자: 신규 6시간(3개월 이내), 보수 6시간(매 2년)<br />' + 
      '  - 안전관리자: 신규 34시간(3개월 이내), 보수 24시간(매 2년)<br />' + 
      '• 특수형태근로종사자 교육: ' + 
      '<a href="https://drive.google.com/file/d/1Tjau3jBR9fLflWxtuG_mRkFsw3d221hD/view?usp=drivesdk" ' + 
      'target="_blank" class="text-blue-600 hover:underline">교육 설명자료</a><br />' + 
      '• 교육 사이트:<br />' + 
      '  - <a href="https://www.safetyedu.net/safetyedu/efrt2820e" ' + 
      'target="_blank" class="text-blue-600 hover:underline">특수형태종사자교육</a><br />' + 
      '  - <a href="https://www.dutycenter.net/dutyedu" ' + 
      'target="_blank" class="text-blue-600 hover:underline">직무교육센터</a><br />' + 
      '• TBM 관련: ' + 
      '<a href="https://www.law.go.kr/%ED%96%89%EC%A0%95%EA%B7%9C%EC%B9%99/%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EA%B5%90%EC%9C%A1%EA%B7%9C%EC%A0%95/(2023-10,20230221)/%EC%A0%9C3%EC%A1%B0%EC%9D%982" ' + 
      'target="_blank" class="text-blue-600 hover:underline">TBM=정기교육 가름 가능규정(현장교육)</a><br />' + 
      '• 관리감독자 교육: ' + 
      '<a href="https://www.safetyedu.net/safetyedu/efrt2200e?qryEduTypeCd=01" ' + 
      'target="_blank" class="text-blue-600 hover:underline">교육 신청</a><br />' + 
      '※ 품질관리자는 겸직이 안되므로 관리감독자 교육 대상 제외<br />' + 
      '※ ' + 
      '<a href="https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%B2%95/(20230808,19611,20230808)/%EC%A0%9C32%EC%A1%B0" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전보건관리책임자 교육이행 시 관리감독자 교육 제외</a><br />' +
      '※ ｢산업안전보건법｣ 제31조에 따른 건설업 기초안전보건교육을 이수한 건설 일용근로자는 채용 시 교육이 면제되며, 그 면제기간은 정해진 바가 없음(산재예방지원과-1206, 2021.12.13.)'
  },  
  '위험성평가': {
    states: ['착공전', '공사중'] as const,
    costs: 'all',
    subItems: [
      { title: '위험성평가 규정서 작성',
        states: ['착공전', '공사중'] as const
      },
      { title: '최초 위험성평가 실시',
        states: ['착공전', '공사중'] as const
      },
      { title: '정기 위험성평가 실시(연1회)',
        states: ['공사중'] as const
      },
      { title: '수시 위험성평가 실시(월1회)',
        states: ['공사중'] as const
      },
      { title: '위험성평가 회의록 작성여부(월1회)',
        states: ['공사중'] as const
      },
      { title: '위험성평가 교육일지(TBM가름)',
        states: ['공사중'] as const
      },
    ],
    description:
      '• 대상 : 모든 건설현장<br />' + 
      '• 관련법 : ' + 
      '<a href="https://www.law.go.kr/conAdmrulByLsPop.do?&lsiSeq=253521&joNo=0036&joBrNo=00&datClsCd=010102&dguBun=DEG&lnkText=%25EA%25B3%25A0%25EC%259A%25A9%25EB%2585%25B8%25EB%258F%2599%25EB%25B6%2580%25EC%259E%25A5%25EA%25B4%2580%25EC%259D%25B4%2520%25EC%25A0%2595%25ED%2595%2598%25EC%2597%25AC%2520%25EA%25B3%25A0%25EC%258B%259C%25ED%2595%259C%25EB%258B%25A4&admRulPttninfSeq=6711" ' + 
      'target="_blank" class="text-blue-600 hover:underline">사업장 위험성평가에 관한 지침</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1RJvrkWGwbjnaGe6HeBlh7m7FrGVjqy_D/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">위험성 평가 규정서(빈도강도법)</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/15LH4q-D3gGeS6uJ3opzr2xCPxdHsI615/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">최초/정기 위험성평가 양식</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1rljlE8k_NzjeFW8vPk7_8yRKaKA6p93x/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">수시위험성 평가서(양식)</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1g8gW-Tgd4vqq9flNhcsQCcG6iWX9fn3b/view" ' + 
      'target="_blank" class="text-blue-600 hover:underline">위험성평가 회의결과(양식)</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1t_Hkf66OUvaIy883hv2DukU8RidAAasv/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">위험성평가 자율활동 점검표</a><br />' + 
      '• 지원 : ' + 
      '<a href="https://kras.kosha.or.kr/sitemap" ' + 
      'target="_blank" class="text-blue-600 hover:underline">위험성평가 지원 시스템</a><br />' + 
      '• AI 도움 : ' + 
      '<a href="https://chatgpt.com/g/g-uhvOsghT3-hangugnongeocongongsa-wiheomseongpyeongga-jagseong-ai" ' + 
      'target="_blank" class="text-blue-600 hover:underline">위험성평가 GPTS AI</a>'
  },  
  'TBM실시(일일안전보건교육)': {
    states: ['공사중'] as const,
    costs: 'all',
    description:
      '• 대상 : 모든 건설현장<br />' +
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/lumLsLinkPop.do?lspttninfSeq=56519&chrClsCd=010202" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건설기술진흥법 시행령 제103조(안전교육)</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1v-QYgcXDArp297HHSuukYm52B3umqDbm/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">TBM양식(고용노동부 표준).hwp</a><br />' + 
      '• 제출 : ' + 
      '<a href="https://krctbmform.netlify.app/" ' + 
      'target="_blank" class="text-blue-600 hover:underline">TBM일지 제출</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://drive.google.com/file/d/1pur2NbzreaBIzdB0uZJbhBUCGJlYuk68/view?usp=drivesdk" ' + 
      'target="_blank" class="text-blue-600 hover:underline">작업 전 안전점검회의(TBM)의 안전보건 정기교육 시간 인정에 관한 지침</a>'
  },
  '근로자 작업장 출입 전,후 체크(일일)': {
    states: ['공사중'] as const,
    costs: 'all',
    description: '• 관련 : ' + 
      '<a href="https://drive.google.com/file/d/16Fy_Ar29hTS2VQtvsFTmaJDpiB_b1pP4/view?usp=sharing" ' + 
      'target="_blank" class="text-blue-600 hover:underline">공사 건설공사 안전관리지침 제21조의4(작업장 출입 전 사전점검)</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1Sm0sVgHVAareq4yxvgV7GAY1yqmjx494/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 작업장 출입 전후 체크</a>'
  },  
  '안전보건협의체(월1회)': {
    states: ['공사중'] as const,
    costs: 'all',
    subItems: [
      { title: '안전보건협의체 회의 실시 여부(월1회)' },
      { title: '합동 안전보건점검(2개월 1회)' },
      { title: '작업장 순회점검(2일 1회)' }
    ],
    description:
     '• 대상 : 모든 건설현장<br />' +
     '• 참고 : <a href="https://drive.google.com/file/d/1CgvwGSstXXwsnOCvUFlAbTjhvk1c-5ZW/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">각 종 협의체 비교표</a><br />• 관련 : <a href="https://www.law.go.kr/lsLinkCommonInfo.do?lspttninfSeq=154193&chrClsCd=010202" target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행규칙 제79조(협의체 구성 및 운영)</a><br />• 대상 : 하도급사가 있을경우 실시해야함<br />• 안전보건협의체 구성(매월) : 도급인 및 하도급인 전원<br />• 양식 : <a href="https://drive.google.com/file/d/1g8gW-Tgd4vqq9flNhcsQCcG6iWX9fn3b/view" target="_blank" class="text-blue-600 hover:underline">(양식)안전보건협의체 회의</a><br />• 합동 안전보건점검(1회/2개월) : 도급인, 도급 근로자, 하도급인, 하도급사 근로자<br />• 순회점검(1회/2일) : 도급인, 도급 근로자, 하도급인 근로자<br />• 양식 : <a href="https://drive.google.com/file/d/12_IhSP4bG0zDvYUEgcjYsJT5qAm1hvJm/view?usp=drivesdk" target="_blank" class="text-blue-600 hover:underline">(공사양식)순회점검일지</a><br />※ VAR에 따라 위험성평가 회의, 안전보건협의체 회의, 안전보건조정자 회의 하나의 양식으로 같이 진행<br />※ 도급인 : 현장대리인<br />※ 하도급인 : 하도급 현장대리인<br />※ 합동 안전보건점검은 일일점검으로 가름(단, 서명 확인필요)'
  },
  '산업안전보건위원회(분기별1회), 노사협의체(2개월1회)': {
    states: ['공사중'] as const,
    costs: ['120억 이상 ~ 150억 미만', '150억 이상'] as const,
    description:
     '• 대상 : 총공사비 120억원 이상(토목 150억원 이상)<br />' +
     '• 양식 : ' + 
     '<a href="https://docs.google.com/spreadsheets/d/1VTxjDuqwoga4Teb3mjNvE0xi2wIlESvE/edit?usp=drive_link&ouid=109273591864382248479&rtpof=true&sd=true" ' + 
     'target="_blank" class="text-blue-600 hover:underline">산업안전보건위원회_양식.xls</a><br />' +
     '• Note : ' + 
     '제75조(안전 및 보건에 관한 협의체 등의 구성ㆍ운영에 관한 특례) 제2항 건설공사도급인이 제1항에 따라 노사협의체를 구성ㆍ운영하는 경우에는 산업안전보건위원회 및 제64조제1항제1호에 따른 안전 및 보건에 관한 협의체를 각각 구성ㆍ운영하는 것으로 본다<br />' +
     '(대신 노사협의체를 1개월 단위로 하여야 함)<br />' +
     '• 관련 : ' + 
     '<a href="https://www.law.go.kr/lsLinkCommonInfo.do?lspttninfSeq=153989&chrClsCd=010202" ' + 
     'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행령 제34조(산업안전보건위원회 구성 대상)</a><br />'+
     '• 관련 : ' + 
     '<a href="https://www.law.go.kr/lsLinkCommonInfo.do?lspttninfSeq=154229&chrClsCd=010202" ' + 
     'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행령 제63조(노사협의체의 설치 대상)</a><br />'
  },
  '재해예방기술지도(15일 1회)': {
    states: ['공사중'] as const,
    costs: ['1억 이상 ~ 5억 미만', '5억 이상 ~ 20억 미만', '20억 이상 ~ 50억 미만', '50억 이상 ~ 120억 미만'] as const,
    description:
    '• 대상 : 총공사비 1억원 이상(전담 안전관리자 미 선임 현장)<br />'+
    '• 관련 : <a href="https://www.law.go.kr/lumLsLinkPop.do?lspttninfSeq=154219&chrClsCd=010202" target="_blank" class="text-blue-600 hover:underline">산안법 시행령 제59조</a><br />'+
    '• 참고 : <a href="https://drive.google.com/file/d/1qk_FJeVHA8AX_bjv1Z_QceVZD6w9m_ce/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">재해예방기술지도 매뉴얼(3차개정)</a><br />'+
    '• 참고 : <a href="https://drive.google.com/file/d/1tfVbiInKkIZ9dLNFeHgYeD7Davu_qb7n/view?usp=drive_link" target="_blank" class="text-blue-600 hover:underline">재해예방기술지도 변경통보(변경계약 이전 시행)</a><br />'+
    '• 제외 : 유해 위험방지계획서 제출현장<br />'+
    '• 참고 : 안전관리자 선임 대상(50억 이상, 23.7.1이후착공), 겸직 가능<br />'+
    '• 참고 : 안전관리자 전임 대상(120억 이상)'
  },
  '유해위험방지계획서': {
    states: CONSTRUCTION_STATUS,
    costs: 'all',
    dependsOn: 'hasSpecialConstruction1',
    description: '• 관련 : <a href="https://www.law.go.kr/LSW//lsLinkCommonInfo.do?lsJoLnkSeq=1026924307&chrClsCd=&ancYnChk=" target="_blank" class="text-blue-600 hover:underline">산업안전보건법 제42조(유해위험방지계획서의 작성ㆍ제출 등)</a>'
  },  
  '휴게시설': {
    states: ['공사중'] as const,
    costs: ['20억 이상 ~ 50억 미만', '50억 이상 ~ 120억 미만', '120억 이상 ~ 150억 미만', '150억 이상'] as const,
    description:
     '• 대상 : 상시근로자 20명 이상 사업장(건설업의 경우 총공사금액이 20억원 이상인 사업장)<br />' +
     '• 양식 : ' + 
     '<a href="https://drive.google.com/file/d/1LjKH9lxYxGBU3cnEGYOFRsfrn8AMwgf8/view?usp=drive_link" ' + 
     'target="_blank" class="text-blue-600 hover:underline">휴게시설 자율 점검표.hwp</a><br />' +
     '• 관련 : ' + 
     '<a href="https://www.law.go.kr/lumLsLinkPop.do?lspttninfSeq=177395&chrClsCd=010202" ' + 
     'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행령 제96조의2(휴게시설)</a><br />' + 
     '• 설치방법 : ' + 
     '<a href="https://www.law.go.kr/lsBylInfoPLinkR.do?lsiSeq=244353&lsNm=%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%B2%95+%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99&bylNo=0021&bylBrNo=02&bylCls=BE&bylEfYd=20230101&bylEfYdYn=Y" ' + 
     'target="_blank" class="text-blue-600 hover:underline">휴게시설 설치방법</a><br />' + 
     '• 크기 : 최소 6㎡ (공동사용 시 6㎡×사업장 수), 높이 2.1m 이상<br />' + 
     '• 위치 : 근로자가 작업 중 신속히 이용할 수 있는 장소, 유해하거나 위험한 장소를 피할 것<br />' + 
     '• 환경 : 온도 18~28℃, 습도 50~55%, 조명 100~200럭스, 환기 가능<br />' + 
     '• 필수 : 의자/식수 구비, 외부 표지판 부착, 관리자 지정<br />' + 
     '• 주의 : 창고 등 다른 용도 사용 금지'
  },
  '안전보건총괄책임자/관리책임자 선임': {
    states: CONSTRUCTION_STATUS,
    costs: ['20억 이상 ~ 50억 미만', '50억 이상 ~ 120억 미만', '120억 이상 ~ 150억 미만', '150억 이상'] as const,
    description: 
      '• 대상 : 총공사금액 20억원 이상<br />' +
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/15zIfiOYqAfe_3dJhI0Y3XOg8kFXB3mwJ/view?usp=share_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 안전보건총괄책임자 선임서</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1f5L_04P5UzOCXReX-zKXhmxmuKmGKK-y/view?usp=share_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">(양식) 안전보건관리책임자 선임서</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/LSW//lumLsLinkPop.do?lspttninfSeq=154187&chrClsCd=010202" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행령 제52조(안전보건총괄책임자 지정 대상사업)</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://m.blog.naver.com/PostView.naver?blogId=woonsamsa&logNo=222277085557&proxyReferer=https:%2F%2Fwww.google.com%2F" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전보건총괄책임자, 안전보건관리책임자 비교</a><br />' + 
      '※ 하도급사가 없을 경우 현장대리인을 \'안전보건총괄책임자, 안전보건관리책임자\'로 선임'
  },  
  '작업장내 물질안전보건 자료 게시': {
    states: ['공사중'] as const,
    costs: 'all',
    description: 
      '• 대상 : MSDS 물질을 다루는 현장<br />' +
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1asK4l_q2ZGyhrE7gWQ9h-zD7WAB0y1cd/view?usp=drivesdk" ' + 
      'target="_blank" class="text-blue-600 hover:underline">MSDS 경고표지 다운로드</a><br />' + 
      '• 사이트 : ' + 
      '<a href="https://msds.kosha.or.kr/MSDSInfo/" ' + 
      'target="_blank" class="text-blue-600 hover:underline">공단 화학물질정보 다운사이트</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/lsLinkProc.do?lsNm=%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%B2%95%20%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99&chrClsCd=010202&joNo=0167000000&mode=10&gubun=admRul&datClsCd=010102" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행규칙 제167조(물질안전보건자료를 게시하거나 갖추어 두는 방법)</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%B2%95%20%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99/%EC%A0%9C169%EC%A1%B0" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행규칙 제169조(물질안전보건자료에 관한 교육의 시기ㆍ내용ㆍ방법 등)</a><br />' + 
      '• 게시 장소:<br />' + 
      '  - 물질안전보건자료대상물질을 취급하는 작업공정이 있는 장소<br />' + 
      '  - 작업장 내 근로자가 가장 보기 쉬운 장소<br />' + 
      '  - 근로자가 작업 중 쉽게 접근할 수 있는 장소에 설치된 전산장비<br />' + 
      '• 주의 : 건설공사, 임시 작업 또는 단시간 작업의 경우 물질안전보건자료대상물질의 관리 요령으로 대체 가능(단, 근로자가 물질안전보건자료의 게시를 요청하는 경우에는 게시 필요)<br />' + 
      '• 공종별 주요 대상물질:<br />' + 
      '  - 토공사: 유류, 산소, LPG, 아세틸렌, 벤토나이트<br />' + 
      '  - 골조공사: 시멘트, 박리제, 산소, LPG, 아세틸렌, 유류<br />' + 
      '  - 마감공사: 방수제, 우레탄, 페인트, 신너, 시멘트, 접착제, 우레탄유, 금글제, 방동제<br />'      
  },
  '산업안전보건법령 요지 게시 및 안전보건표지 설치/부착': {
    states: ['공사중'] as const,
    costs: 'all',
    description: 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/128Jr9GoqNpjXQogn0t6OQYVT7SRqVrs7/view?usp=sharing" ' + 
      'target="_blank" class="text-blue-600 hover:underline">25년 산업안전보건법령 요지.hwp</a><br />' + 
      '• 양식 : ' + 
      '<a href="https://drive.google.com/file/d/1zq1jB2hiv7JlH7OFFoGRb-Sd4MfPaZv8/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">안전보건표지 받기</a><br />' +
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/%EB%B2%95%EB%A0%B9/%EC%82%B0%EC%97%85%EC%95%88%EC%A0%84%EB%B3%B4%EA%B1%B4%EB%B2%95/(20240517,19591,20230808)/%EC%A0%9C34%EC%A1%B0" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 제34조(법령 요지 등의 게시 등)</a><br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/LSW//lsLinkCommonInfo.do?lsJoLnkSeq=1024053091&chrClsCd=010202&ancYnChk=" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 시행규칙 제39조(안전보건표지의 종류·형태 및 용도·설치)</a><br />' + 
      '• 법령요지 게시 내용:<br />' + 
      '  - 산업안전보건법령 요지<br />' + 
      '  - 안전보건관리규정<br />' + 
      '  - 안전보건관리조직도<br />' + 
      '  - 산업안전보건위원회 구성 현황(해당 시)<br />' + 
      '  - 작업환경측정 결과(해당 시)<br />' + 
      '  - 산업재해 예방계획 및 평가에 관한 사항<br />' + 
      '• 안전보건표지 설치:<br />' + 
      '  - 사업장의 주요 부분에 설치<br />' + 
      '  - 근로자가 쉽게 알아볼 수 있는 장소에 설치<br />' + 
      '  - 흔들리거나 쉽게 파손되지 않도록 견고하게 설치<br />' + 
      '  - 수시로 점검하여 훼손, 오염 등으로 인지 곤란한 경우 보수 또는 교체<br />' + 
      '• 주요 안전보건표지:<br />' + 
      '  - 출입금지 표지<br />' + 
      '  - 보호구 착용 표지<br />' + 
      '  - 위험장소 경고 표지<br />' + 
      '  - 비상구 표지<br />' + 
      '  - 금연 표지<br />' + 
      '  - 화기금지 표지'
  },
  '비상대처훈련 실시 여부': {
    states: ['공사중'] as const,
    costs: 'all',
    subItems: [
      { title: '비상 대처훈련 실시여부(반기1회)' }
    ],
    description: 
      '• 적용대상:<br />' + 
      '  - 작업 중 화재, 폭팔, 토사, 구축물 등의 붕괴 또는 지진의 영향으로 근로자가 산업재해를 당할 우려가 있는 장소<br />' + 
      '• 관련 : <a href="https://www.law.go.kr/법령/중대재해처벌등에관한법률시행령/(20221208,33023,20221206)/제4조" ' + 
      'target="_blank" class="text-blue-600 hover:underline">중대재해처벌법 시행령 제4조 제8호</a><br />' + 
      '• 관련 : <a href="https://www.law.go.kr/lsBylInfoPLinkR.do?lsiSeq=264011&lsNm=%EA%B1%B4%EC%84%A4%EA%B8%B0%EC%88%A0+' + 
      '%EC%A7%84%ED%9D%A5%EB%B2%95+%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99&bylNo=0007&bylBrNo=00&bylCls=BE&bylEfYd=20240801&bylEfYdYn=Y" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건설기술진흥법 제58조(안전관리계획의수립기준) 별표7</a><br />' + 
      '• 관련 : <a href="https://www.law.go.kr/법령/산업안전보건법/(20240517,19591,20230808)/제64조" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 제64조(도급에 따른 사업재해 예방조치) 1항 5호</a><br />' + 
      '• 다운로드 : <a href="https://drive.google.com/file/d/1cBgksOH21gggdYUF6dodOJo9I0YdSAwd/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">비상대응훈련결과_양식.hwp</a><br />' + 
      '• 다운로드 : <a href="https://drive.google.com/file/d/1qnlYbYYbIyEWOjtHZ7w-9zmMiIs7C7b5/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">비상대피 훈련 자료.zip</a><br />' + 
      '• 훈련내용:<br />' + 
      '  - 경보체계 운영과 대피방법 등 훈련<br />' + 
      '  - 건축공사시 단열재 시공시점부터는 월 1회 이상 비상대피 훈련을 실시<br />' + 
      '• 주의사항:<br />' + 
      '  - 훈련 후 일자, 목적, 참석자, 내용, 훈련사진을 기록<br />' + 
      '  - 비상연락망 최신화 유지'
  },
  '폭염, 한파 안전보건조치': {
    states: ['공사중'] as const,
    costs: 'all',
    description: 
      '• 대상 : 모든 건설현장<br />' + 
      '• 점검시기 : 폭염,한파 특보 발효시<br />' + 
      '• 관련 : ' + 
      '<a href="https://www.law.go.kr/법령/산업안전보건법/(20250601,20522,20241022)/제39조" ' + 
      'target="_blank" class="text-blue-600 hover:underline">산업안전보건법 제39조(보건조치) 제1항 제7호</a><br />' + 
      '• 2시간점검표 : ' + 
      '<a href="https://drive.google.com/file/d/1ho6Ngse3Azz4LkSUjB_12IcYwtxT5rJw/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">체감31도이상시 점검표</a><br />' + 
      '• 관련사이트 : ' + 
      '<a href="https://www.weather.go.kr/w/weather/forecast/short-term.do#dong/4157025300/37.5949119/126.7577431/%EA%B2%BD%EA%B8%B0%EB%8F%84%20%EA%B9%80%ED%8F%AC%EC%8B%9C%20%EA%B3%A0%EC%B4%8C%EC%9D%8D/LOC/%EC%9C%84%EA%B2%BD%EB%8F%84(37.59,126.76)" ' + 
      'target="_blank" class="text-blue-600 hover:underline">체감온도 확인(기상청)</a><br />' + 
      '• 공사 매뉴얼 : ' + 
      '<a href="https://drive.google.com/file/d/1VsDvYn_Y4A-p5bkgCn2UDSahJKmFZM5b/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">건설현장 취약근로자 안전관리 매뉴얼(25.07)</a><br />' + 
      '• 참고 : ' + 
      '<a href="https://drive.google.com/file/d/1WwEfyJ1tMbzW_FinJizgYP3bCcXDygnc/view?usp=drive_link" ' + 
      'target="_blank" class="text-blue-600 hover:underline">온열질환 예방지침(OPS)_안전보건공단</a><br />' + 
      '• 폭염 대응 조치사항:<br />' + 
      '  - 작업시간 조정 및 휴식시간 확보<br />' + 
      '  - 그늘막 또는 냉방시설 설치<br />' + 
      '  - 충분한 음용수 공급<br />' + 
      '  - 온열질환 예방 교육 실시<br />' + 
      '  - 근로자 건강상태 확인<br />' + 
      '• 한파 대응 조치사항:<br />' + 
      '  - 동상 예방을 위한 보온대책 수립<br />' + 
      '  - 난방시설 설치 및 운영<br />' + 
      '  - 적절한 방한복 착용<br />' + 
      '  - 빙판길 미끄럼 방지대책<br />' + 
      '  - 한파 관련 안전교육 실시'
  }
} as const; 