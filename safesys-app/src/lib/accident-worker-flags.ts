// 사고 이력에서 신규근로자·외국인 여부별 건수를 세고 KPI 보조 문구로 만드는 순수 함수 모듈
import type { ProjectAccident } from '@/lib/accident-analysis-types'

export interface WorkerFlagCounts {
  newWorker: number
  foreignWorker: number
}

type WorkerFlagSource = Pick<ProjectAccident, 'is_new_worker' | 'is_foreign_worker'>

/** 사고 배열에서 신규근로자·외국인 건수(또는 weight 합)를 센다. weight를 주면 건수 대신 그 값(부상자 수 등)을 합산한다. */
export const countWorkerFlags = <T extends WorkerFlagSource>(
  accidents: ReadonlyArray<T>,
  weight?: (accident: T) => number
): WorkerFlagCounts =>
  accidents.reduce<WorkerFlagCounts>(
    (counts, accident) => {
      const value = weight ? weight(accident) : 1
      return {
        newWorker: counts.newWorker + (accident.is_new_worker === true ? value : 0),
        foreignWorker: counts.foreignWorker + (accident.is_foreign_worker === true ? value : 0),
      }
    },
    { newWorker: 0, foreignWorker: 0 }
  )

/** KPI 카드 보조 문구. 예) "신규근로자 (2), 외국인 (1)" */
export const formatWorkerFlags = (counts: WorkerFlagCounts): string =>
  `신규근로자 (${counts.newWorker.toLocaleString('ko-KR')}), 외국인 (${counts.foreignWorker.toLocaleString('ko-KR')})`
