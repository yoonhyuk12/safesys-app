// 점검대장 행의 상세보기 입력과 내부 컨트롤·포털 입력을 구분한다.
import type { HTMLAttributes } from 'react'

const independentControls = 'button, a, input, label, textarea, select, img, [role="button"], [contenteditable="true"], [data-ledger-row-control]'

export function inspectionLedgerRowProps(onView: () => void): HTMLAttributes<HTMLTableRowElement> {
  return {
    tabIndex: 0,
    'aria-label': '점검 상세보기',
    onClick(event) {
      const target = event.target as Element
      // React 포털의 이벤트도 부모 행까지 전달되므로 실제 DOM 소속을 확인한다.
      if (event.defaultPrevented || !event.currentTarget.contains(target) || target.closest(independentControls)) return
      onView()
    },
    onKeyDown(event) {
      if (event.defaultPrevented || event.target !== event.currentTarget || event.repeat) return
      if (event.key !== 'Enter' && event.key !== ' ') return
      event.preventDefault()
      onView()
    },
  }
}
