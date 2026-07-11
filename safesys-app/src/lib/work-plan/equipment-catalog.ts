// 공식 제조사 자료를 바탕으로 작업계획서 장비 제원 자동입력값을 제공한다.

import type {
  ConstructionEquipmentSpec,
  HeavyMachineSpec,
  LoadingEquipmentSpec,
  PlanType,
} from './types'

export type EquipmentCategory =
  | 'excavator'
  | 'dumpTruck'
  | 'cargoTruck'
  | 'mobileCrane'
  | 'truckMountedCrane'
  | 'compactionRoller'

export interface EquipmentCatalogSpecs {
  operatingWeightTon?: number | null
  bucketCapacityM3?: number | null
  widthM?: number | null
  minimumTurningRadiusM?: number | null
  maxLiftingHeightM?: number | null
  maxWorkingRadiusM?: number | null
  maxRatedLoadTon?: number | null
  capacitySummary?: string | null
}

export interface EquipmentCatalogItem {
  id: string
  category: EquipmentCategory
  sizeClass: string
  manufacturer: string
  model: string
  variant?: string
  sourceUrl: string
  sourceLabel: string
  sourceDate: string
  applicablePlanTypes: PlanType[]
  specs: EquipmentCatalogSpecs
  warning: string
}

const SOURCE_DATE = '2026-07-11'
const CONSTRUCTION_WARNING =
  '형식·어태치먼트·선택 사양에 따라 실제 제원이 달라질 수 있으므로 장비 등록증과 현장 장비를 확인하세요.'
const VEHICLE_WARNING =
  '캡·축거·적재함 및 특장 사양에 따라 실제 치수와 중량이 달라지므로 자동차등록증과 제작사 제원을 확인하세요.'
const CRANE_WARNING =
  '표시값은 장비의 대표 고정 제원입니다. 실제 인양 가능 하중은 작업반경·붐 길이·아웃트리거 전개 조건별 정격하중표로 별도 확인하세요.'
const ROLLER_WARNING =
  '드럼·캐노피·밸러스트 등 선택 사양에 따라 실제 운전중량이 달라질 수 있으므로 장비 명판과 등록 제원을 확인하세요.'

const develonSource = '디벨론 공식 제품 제원'
const mightySource = '현대자동차 마이티 공식 카탈로그(2026.05)'
const paviseSource = '현대자동차 파비스 공식 카탈로그(2026.05)'
const xcientSource = '현대자동차 엑시언트 공식 카탈로그(2026.05)'
const kanglimSource = '광림 공식 제품 제원'

export const EQUIPMENT_CATALOG: EquipmentCatalogItem[] = [
  {
    id: 'excavator-develop-dx17z-7', category: 'excavator', sizeClass: '버킷 0.114㎥', manufacturer: '디벨론', model: 'DX17Z-7',
    sourceUrl: 'https://asia.develon-ce.com/kr/products/excavators-detail/10/DX17Z-5', sourceLabel: develonSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 1.93, bucketCapacityM3: 0.114, widthM: 1.36, capacitySummary: '버킷 0.114㎥·가변식 하부체 폭 최대 1.36m' }, warning: CONSTRUCTION_WARNING,
  },
  {
    id: 'excavator-develop-dx30z-7k', category: 'excavator', sizeClass: '버킷 0.13㎥', manufacturer: '디벨론', model: 'DX30Z-7K', variant: '캐노피',
    sourceUrl: 'https://asia.develon-ce.com/kr/products/excavators-detail/115/DX30Z-7K', sourceLabel: develonSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 2.9, bucketCapacityM3: 0.13, widthM: 1.55, minimumTurningRadiusM: 2.095, capacitySummary: '버킷 0.13㎥·캐빈형 운전중량 2.93t' }, warning: CONSTRUCTION_WARNING,
  },
  {
    id: 'excavator-develop-dx35z-7', category: 'excavator', sizeClass: '버킷 0.19㎥', manufacturer: '디벨론', model: 'DX35Z-7', variant: '캐노피',
    sourceUrl: 'https://asia.develon-ce.com/kr/products/excavators-detail/51/DX35Z-7', sourceLabel: develonSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 4.01, bucketCapacityM3: 0.19, capacitySummary: '버킷 0.19㎥·캐빈형 운전중량 4.14t' }, warning: CONSTRUCTION_WARNING,
  },
  {
    id: 'excavator-develop-dx65-7k', category: 'excavator', sizeClass: '버킷 0.17㎥', manufacturer: '디벨론', model: 'DX65-7K',
    sourceUrl: 'https://asia.develon-ce.com/kr/products/excavators-detail/123/DX65-7K', sourceLabel: develonSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 6.4, bucketCapacityM3: 0.17, widthM: 1.955, capacitySummary: '버킷 0.17㎥' }, warning: CONSTRUCTION_WARNING,
  },
  {
    id: 'excavator-hd-hx85a', category: 'excavator', sizeClass: '버킷 0.25㎥', manufacturer: 'HD현대', model: 'HX85A',
    sourceUrl: 'https://www.hyundai-ce.com/ko/products/view?productsSeq=544', sourceLabel: 'HD현대건설기계 공식 제품 제원', sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 8.61, bucketCapacityM3: 0.25, widthM: 2.3, capacitySummary: '버킷 0.25㎥' }, warning: CONSTRUCTION_WARNING,
  },
  {
    id: 'excavator-develop-dx150lc-7', category: 'excavator', sizeClass: '버킷 0.59㎥', manufacturer: '디벨론', model: 'DX150LC-7',
    sourceUrl: 'https://asia.develon-ce.com/kr/products/excavators-detail/71/DX150LC-7', sourceLabel: develonSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 14.5, bucketCapacityM3: 0.59, widthM: 2.59, capacitySummary: '버킷 0.59㎥' }, warning: CONSTRUCTION_WARNING,
  },
  {
    id: 'excavator-develop-dx240', category: 'excavator', sizeClass: '버킷 0.92㎥', manufacturer: '디벨론', model: 'DX240',
    sourceUrl: 'https://asia.develon-ce.com/kr/products/excavators-detail/113/DX240', sourceLabel: develonSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 23.6, bucketCapacityM3: 0.92, widthM: 2.99, capacitySummary: '버킷 0.92㎥' }, warning: CONSTRUCTION_WARNING,
  },
  {
    id: 'excavator-develop-dx320lc-7', category: 'excavator', sizeClass: '버킷 1.50㎥', manufacturer: '디벨론', model: 'DX320LC-7',
    sourceUrl: 'https://asia.develon-ce.com/kr/products/excavators-detail/76/DX320LC-7', sourceLabel: develonSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 32.9, bucketCapacityM3: 1.5, widthM: 3.2, capacitySummary: '버킷 1.50㎥' }, warning: CONSTRUCTION_WARNING,
  },
  {
    id: 'excavator-develop-dx400', category: 'excavator', sizeClass: '버킷 1.61㎥', manufacturer: '디벨론', model: 'DX400',
    sourceUrl: 'https://asia.develon-ce.com/kr/products/excavators-detail/81/DX400LC-7', sourceLabel: develonSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['construction'], specs: { operatingWeightTon: 40.9, bucketCapacityM3: 1.61, widthM: 3.495, capacitySummary: '버킷 1.61㎥' }, warning: CONSTRUCTION_WARNING,
  },

  ...[
    ['dump-hyundai-mighty-2-5', '2.5t', 2.5, '현대자동차', '마이티 덤프', '2.5t·적재함 3,100×1,860×290mm·덤핑각 53°', mightySource, 'https://www.hyundai.com/ccontents/carmng/CP00000003/mighty-2026-05-catalog.pdf'],
    ['dump-hyundai-mighty-3-5', '3.5t', 3.5, '현대자동차', '마이티 덤프', '3.5t·적재함 3,200×1,900×385mm·덤핑각 53°', mightySource, 'https://www.hyundai.com/ccontents/carmng/CP00000003/mighty-2026-05-catalog.pdf'],
    ['dump-tata-maxen-8', '8t', 8, '타타대우', '맥쎈 덤프', '최대 적재량 8t급', '타타대우상용차 맥쎈 덤프 공식 카탈로그', 'https://www.tata-daewoo.com/html/_file/TATADAEWOO%20%EB%89%B4%20%EC%B9%B4%EB%8B%A4%EB%A1%9C%EA%B7%B8_%EB%A7%A5%EC%8E%88%20%EB%8D%A4%ED%94%84_32P_%EC%A0%80%EC%9A%A9%EB%9F%89.pdf'],
    ['dump-hyundai-xcient-15', '15t', 15, '현대자동차', '엑시언트 덤프 H430', '최대 적재량 15t급·6×4', xcientSource, 'https://www.hyundai.com/ccontents/carmng/CP00000006/xcient-2026-05-catalog.pdf'],
    ['dump-tata-maxen-15', '15t', 15, '타타대우', '맥쎈 덤프', '최대 적재량 15t급', '타타대우상용차 맥쎈 덤프 공식 카탈로그', 'https://www.tata-daewoo.com/html/_file/TATADAEWOO%20%EB%89%B4%20%EC%B9%B4%EB%8B%A4%EB%A1%9C%EA%B7%B8_%EB%A7%A5%EC%8E%88%20%EB%8D%A4%ED%94%84_32P_%EC%A0%80%EC%9A%A9%EB%9F%89.pdf'],
    ['dump-hyundai-xcient-25-5', '25.5t', 25.5, '현대자동차', '엑시언트 덤프 L540', '최대 적재량 25.5t급·8×4', xcientSource, 'https://www.hyundai.com/ccontents/carmng/CP00000006/xcient-2026-05-catalog.pdf'],
    ['dump-tata-maxen-25-5', '25.5t', 25.5, '타타대우', '맥쎈 덤프', '최대 적재량 25.5t급', '타타대우상용차 맥쎈 덤프 공식 카탈로그', 'https://www.tata-daewoo.com/html/_file/TATADAEWOO%20%EB%89%B4%20%EC%B9%B4%EB%8B%A4%EB%A1%9C%EA%B7%B8_%EB%A7%A5%EC%8E%88%20%EB%8D%A4%ED%94%84_32P_%EC%A0%80%EC%9A%A9%EB%9F%89.pdf'],
  ].map(([id, sizeClass, maxRatedLoadTon, manufacturer, model, capacitySummary, sourceLabel, sourceUrl]) => ({
    id: id as string, category: 'dumpTruck' as const, sizeClass: sizeClass as string,
    manufacturer: manufacturer as string, model: model as string, sourceUrl: sourceUrl as string,
    sourceLabel: sourceLabel as string, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['loading' as const, 'construction' as const],
    specs: { maxRatedLoadTon: maxRatedLoadTon as number, capacitySummary: capacitySummary as string }, warning: VEHICLE_WARNING,
  })),

  ...[
    ['cargo-hyundai-porter2-1', '1t', 1, '포터Ⅱ', '일반캡·초장축', '최대 적재량 1t급', 'https://www.hyundai.com/kr/ko/e/vehicles/porter2/intro'],
    ['cargo-hyundai-mighty-2-5', '2.5t', 2.5, '마이티 카고', '일반캡·장축', '최대 적재량 2.5t·휠베이스 3,400mm', 'https://www.hyundai.com/ccontents/carmng/CP00000003/mighty-2026-05-catalog.pdf'],
    ['cargo-hyundai-mighty-3-1', '3.1t', 3.1, '마이티 카고', '슈퍼캡·장축', '최대 적재량 3.1t·휠베이스 3,600mm', 'https://www.hyundai.com/ccontents/carmng/CP00000003/mighty-2026-05-catalog.pdf'],
    ['cargo-hyundai-mighty-3-5', '3.5t', 3.5, '마이티 카고', '슈퍼캡·장축', '최대 적재량 3.5t·휠베이스 3,950mm', 'https://www.hyundai.com/ccontents/carmng/CP00000003/mighty-2026-05-catalog.pdf'],
    ['cargo-hyundai-mighty-5-1', '5.1t', 5.1, '마이티 카고', '슈퍼캡·초장축', '최대 적재량 5.1t·휠베이스 4,400mm', 'https://www.hyundai.com/ccontents/carmng/CP00000003/mighty-2026-05-catalog.pdf'],
    ['cargo-hyundai-pavise-5-5', '5.5t', 5.5, '파비스 카고', '단축', '최대 적재량 5.5t급', 'https://www.hyundai.com/ccontents/carmng/CP00000304/pavise-catalog-2026-05.pdf'],
    ['cargo-hyundai-pavise-8', '8t', 8, '파비스 카고', '장축', '최대 적재량 8t급', 'https://www.hyundai.com/ccontents/carmng/CP00000304/pavise-catalog-2026-05.pdf'],
    ['cargo-hyundai-pavise-8-5', '8.5t', 8.5, '파비스 카고', '초장축', '최대 적재량 8.5t급', 'https://www.hyundai.com/ccontents/carmng/CP00000304/pavise-catalog-2026-05.pdf'],
    ['cargo-hyundai-xcient-25', '25t', 25, '엑시언트 카고', '10×4', '최대 적재량 25t급·10×4', 'https://www.hyundai.com/ccontents/carmng/CP00000006/xcient-2026-05-catalog.pdf'],
  ].map(([id, sizeClass, maxRatedLoadTon, model, variant, capacitySummary, sourceUrl]) => ({
    id: id as string, category: 'cargoTruck' as const, sizeClass: sizeClass as string,
    manufacturer: '현대자동차', model: model as string, variant: variant as string, sourceUrl: sourceUrl as string,
    sourceLabel: model === '파비스 카고' ? paviseSource : model === '엑시언트 카고' ? xcientSource : model === '포터Ⅱ' ? '현대자동차 포터Ⅱ 공식 제품 정보' : mightySource,
    sourceDate: SOURCE_DATE, applicablePlanTypes: ['loading' as const, 'construction' as const],
    specs: { maxRatedLoadTon: maxRatedLoadTon as number, capacitySummary: capacitySummary as string }, warning: VEHICLE_WARNING,
  })),

  ...[
    ['mobile-tadano-gr130nl', '13t급', '타다노', 'GR-130NL', 14.535, 2, 3.8, 24.5, 22.5, 13, '최대 13t·13t/1.5m', 'https://www.tadano.com/japan/products/rt/gr-130nl-n/'],
    ['mobile-tadano-gr250n', '25t급', '타다노', 'GR-250N', 25.495, 2.62, 5.1, 31.3, 27.9, 25, '최대 25t·25t/3.5m', 'https://www.tadano.com/japan/products/rt/gr-250n/'],
    ['mobile-kato-sr500l', '51t급', 'KATO', 'SR-500L', 33.97, 2.98, undefined, 35.6, 32, 51, '최대 51t·51t/2.5m', 'https://kato-works.co.jp/eng/products/roughter/pdf/C04131_SR-500L.pdf'],
    ['mobile-tadano-gr700n', '70t급', '타다노', 'GR-700N', 41.295, 2.78, 7.5, 45.2, 38, 70, '최대 70t·70t/2.1m', 'https://www.tadano.com/japan/lifting-equipment/rt/'],
    ['mobile-tadano-gr1000n', '100t급', '타다노', 'GR-1000N', 41.295, 2.78, 7.5, 48.7, 38, 100, '최대 100t·100t/1.6m', 'https://www.tadano.com/japan/products/rt/gr-1000n/'],
  ].map(([id, sizeClass, manufacturer, model, operatingWeightTon, widthM, minimumTurningRadiusM, maxLiftingHeightM, maxWorkingRadiusM, maxRatedLoadTon, capacitySummary, sourceUrl]) => ({
    id: id as string, category: 'mobileCrane' as const, sizeClass: sizeClass as string, manufacturer: manufacturer as string, model: model as string,
    sourceUrl: sourceUrl as string, sourceLabel: `${manufacturer} 공식 제품 제원`, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['loading' as const, 'construction' as const, 'heavy' as const], specs: {
      operatingWeightTon: operatingWeightTon as number, widthM: widthM as number,
      minimumTurningRadiusM: minimumTurningRadiusM as number | undefined,
      maxLiftingHeightM: maxLiftingHeightM as number, maxWorkingRadiusM: maxWorkingRadiusM as number,
      maxRatedLoadTon: maxRatedLoadTon as number, capacitySummary: capacitySummary as string,
    }, warning: CRANE_WARNING,
  })),

  ...[
    ['truck-crane-kanglim-ks733n', '3.5t 이상 차대', 'KS733N', 9.5, 7.5, 3, '3.0t/2.0m·0.7t/7.5m', 60],
    ['truck-crane-kanglim-ks734n', '3.5t 이상 차대', 'KS734N', 11.5, 9.8, 3, '3.0t/2.3m·0.5t/9.8m', 60],
    ['truck-crane-kanglim-ks735n', '3.5t 이상 차대', 'KS735N', 14, 12.1, 3, '3.0t/2.5m·0.34t/12.1m', 60],
    ['truck-crane-kanglim-ks1500', '5t 이상 차대', 'KS1500', 18, 16, 6, '6.0t/2.5m·0.5t/16.0m', 36],
    ['truck-crane-kanglim-ks2056h', '5t 이상 차대', 'KS2056H', 25.9, 23.6, 7.1, '7.1t/2.4m·0.4t/20.3m', 37],
    ['truck-crane-kanglim-ks2300', '5t 이상 차대', 'KS2306', undefined, undefined, undefined, 'KS2300 계열 6단 붐', 38],
    ['truck-crane-kanglim-ks2700', '11t 이상 차대', 'KS2700', 29.5, 26.5, 10, '10.0t/3.0m·0.45t/26.5m', 59],
    ['truck-crane-kanglim-ks7000', '25t 이상 차대', 'KS7000', 38, 35, 18.5, '18.5t/2.0m·0.75t/35.0m', 40],
    ['truck-crane-kanglim-ks7000l', '25t 이상 차대', 'KS7000L', 39.5, 36.5, 20, '20.0t/2.0m·0.48t/36.5m', 40],
  ].map(([id, sizeClass, model, maxLiftingHeightM, maxWorkingRadiusM, maxRatedLoadTon, capacitySummary, sourceIndex]) => ({
    id: id as string, category: 'truckMountedCrane' as const, sizeClass: sizeClass as string, manufacturer: '광림', model: model as string,
    sourceUrl: `https://www.kanglim.com/product/details?ca_id=01&idx=${sourceIndex}`, sourceLabel: kanglimSource, sourceDate: SOURCE_DATE,
    applicablePlanTypes: ['loading' as const, 'construction' as const, 'heavy' as const], specs: {
      maxLiftingHeightM: maxLiftingHeightM as number | undefined, maxWorkingRadiusM: maxWorkingRadiusM as number | undefined,
      maxRatedLoadTon: maxRatedLoadTon as number | undefined, capacitySummary: capacitySummary as string,
    }, warning: CRANE_WARNING,
  })),

  ...[
    ['roller-volvo-dd25b-narrow', '탠덤 2.5t급', 'Volvo', 'DD25B', 'Narrow Drum', 2.515, 1.09, 2.8, '탠덤·드럼폭 1.0m·55/66.7Hz·원심력 37.5/25.5kN', 'https://www.volvoce.com/-/media/volvoce/global/products/compactors/asphalt-compactors/brochures/brochure_dd25b_stagev_en_21_20045036_g.pdf'],
    ['roller-hamm-hd12-vv', '탠덤 2.7t급', 'HAMM', 'HD 12 VV', undefined, 2.695, 1.31, 2.37, '탠덤·드럼폭 1.2m·65/51Hz·원심력 38/23kN', 'https://www.wirtgen-group.com/binary/full/o8619v83_HD_12i_VV_H251_enGB.pdf'],
    ['roller-hamm-hd80i-vvhf', '탠덤 7.8t급', 'HAMM', 'HD+ 80i VV-HF', undefined, 7.795, 1.8, 4.14, '탠덤·드럼폭 1.68m·45/67Hz·원심력 70/85kN', 'https://www.wirtgen-group.com/binary/full/o249846v83_HD_80i_VVHF_H302_enGB.pdf'],
    ['roller-bomag-bw124-dh5', '단드럼 3.3t급', 'BOMAG', 'BW 124 DH-5', undefined, 3.3, 1.31, 2.26, '단드럼·드럼폭 1.2m·41Hz·원심력 85/43kN', 'https://www.bomag.com/ww-en/machinery/categories/single-drum-rollers-soil-compactors/single-drum-rollers-4106/bw-124-dh-5-58726/'],
    ['roller-hamm-hc50i', '단드럼 5.2t급', 'HAMM', 'HC 50i', undefined, 5.195, 2.018, 3.375, '단드럼·드럼폭 1.37m·30Hz·원심력 69kN', 'https://www.wirtgen-group.com/binary/full/o205233v83_HC_50i_H288_Datasheet_enGB.pdf'],
    ['roller-hamm-hc70i', '단드럼 7.1t급', 'HAMM', 'HC 70i', undefined, 7.06, 2.018, 3.31, '단드럼·드럼폭 1.68m·30/36Hz·원심력 125/95kN', 'https://www.hamm.eu/binary/full/o204069v83_HC_70i_H287_Datasheet_enGB.pdf'],
    ['roller-hamm-hc119i', '단드럼 11.2t급', 'HAMM', 'HC 119i', undefined, 11.19, 2.282, 3.883, '단드럼·드럼폭 2.14m·30/35Hz·원심력 240/158kN', 'https://www.wirtgen-group.com/binary/full/o183237v83_HC_119i_H279_enGB.pdf'],
    ['roller-hamm-hc139id', '단드럼 13.2t급', 'HAMM', 'HC 139i D', undefined, 13.16, 2.41, 4.26, '단드럼·드럼폭 2.14m·30/35Hz·원심력 241/145kN', 'https://www.wirtgen-group.com/binary/full/o305657v83_HC_139iD_H305_Datasheet_enGB.pdf'],
    ['roller-hamm-hd14i-tt', '타이어 3.5t급', 'HAMM', 'HD 14i TT', undefined, 3.545, 1.296, 2.602, '타이어 7본·작업폭 1.276m·비진동', 'https://www.wirtgen-group.com/binary/full/o19420v83_HD_14i_TT_H264_Datasheet_enGB.pdf'],
    ['roller-hamm-hp180i', '타이어 8~18t급', 'HAMM', 'HP 180i', undefined, 8.515, 2.166, 6.2, '타이어 8본·작업폭 2.084m·최대 18.31t·비진동', 'https://www.hamm.eu/binary/full/o248019v83_HP_180i_H250_enGB.pdf'],
  ].map(([id, sizeClass, manufacturer, model, variant, operatingWeightTon, widthM, minimumTurningRadiusM, capacitySummary, sourceUrl]) => ({
    id: id as string, category: 'compactionRoller' as const, sizeClass: sizeClass as string, manufacturer: manufacturer as string,
    model: model as string, variant: variant as string | undefined, sourceUrl: sourceUrl as string,
    sourceLabel: `${manufacturer} 공식 제원표`, sourceDate: SOURCE_DATE, applicablePlanTypes: ['construction' as const],
    specs: { operatingWeightTon: operatingWeightTon as number, widthM: widthM as number, minimumTurningRadiusM: minimumTurningRadiusM as number, capacitySummary: capacitySummary as string },
    warning: ROLLER_WARNING,
  })),
]

const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  excavator: '굴착기',
  dumpTruck: '덤프트럭',
  cargoTruck: '화물차',
  mobileCrane: '이동식 크레인',
  truckMountedCrane: '트럭탑재형 크레인',
  compactionRoller: '다짐롤러',
}

export function getEquipmentCategoryLabel(category: EquipmentCategory): string {
  return CATEGORY_LABELS[category]
}

export function getEquipmentDisplayName(item: EquipmentCatalogItem): string {
  return [item.manufacturer, item.model, item.variant].filter(Boolean).join(' ')
}

export function getEquipmentCatalogForPlanType(planType: PlanType): EquipmentCatalogItem[] {
  return EQUIPMENT_CATALOG.filter((item) => item.applicablePlanTypes.includes(planType))
}

function assignDefined<T extends object, K extends keyof T>(target: Partial<T>, key: K, value: T[K] | undefined): void {
  if (value !== undefined) target[key] = value
}

function numberText(value: number | null | undefined): string | undefined {
  return typeof value === 'number' ? value.toString() : undefined
}

export function toLoadingEquipmentPatch(item: EquipmentCatalogItem): Partial<LoadingEquipmentSpec> {
  const patch: Partial<LoadingEquipmentSpec> = {
    equipmentName: getEquipmentCategoryLabel(item.category),
    modelAndYear: [item.model, item.variant].filter(Boolean).join(' '),
  }
  assignDefined(patch, 'bodyWeightTon', numberText(item.specs.operatingWeightTon))
  assignDefined(patch, 'widthM', numberText(item.specs.widthM))
  assignDefined(patch, 'minimumTurningRadiusM', numberText(item.specs.minimumTurningRadiusM))
  assignDefined(patch, 'maximumLiftingHeightM', numberText(item.specs.maxLiftingHeightM))
  assignDefined(patch, 'workingRadiusM', numberText(item.specs.maxWorkingRadiusM))
  assignDefined(patch, 'maxAndRatedLoadTon', numberText(item.specs.maxRatedLoadTon))
  return patch
}

export function toConstructionEquipmentPatch(item: EquipmentCatalogItem): Partial<ConstructionEquipmentSpec> {
  const patch: Partial<ConstructionEquipmentSpec> = { equipmentName: getEquipmentDisplayName(item) }
  const operatingWeight = numberText(item.specs.operatingWeightTon)
  assignDefined(patch, 'bodyWeight', operatingWeight === undefined ? undefined : `${operatingWeight} ton`)
  assignDefined(patch, 'capacity', item.specs.capacitySummary ?? undefined)
  return patch
}

export function toHeavyMachinePatch(item: EquipmentCatalogItem): Partial<HeavyMachineSpec> {
  const patch: Partial<HeavyMachineSpec> = {
    machineName: getEquipmentCategoryLabel(item.category),
    modelNumber: [item.model, item.variant].filter(Boolean).join(' '),
  }
  assignDefined(patch, 'machineSpecification', item.specs.capacitySummary ?? undefined)
  const ratedLoad = numberText(item.specs.maxRatedLoadTon)
  assignDefined(patch, 'ratedLoad', ratedLoad === undefined ? undefined : `${ratedLoad} ton`)
  return patch
}
