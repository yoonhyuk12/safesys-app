---
paths:
  - "safesys-app/src/**/*.tsx"
  - "safesys-app/src/**/*.css"
---
# UI는 새로 디자인하지 않고 디자인 시스템을 따른다

화면·컴포넌트를 만들 땐 [docs/design-system.md](../../../docs/design-system.md)에서 클래스 문자열을 복사해 쓴다. 최소한 아래는 외운다.

| 요소 | 클래스 |
|------|--------|
| 카드 | `bg-white rounded-lg shadow-sm border border-gray-200` |
| 주 버튼 | `px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors` |
| 입력 | `border border-gray-300 rounded-md` |
| 배지 | `rounded-full text-xs font-medium bg-{색}-100 text-{색}-800` |
| 본문 / 표 | `text-sm` / `text-xs` |
| 아이콘 | lucide `h-4 w-4` (이모지 금지) |
| 탭 영역 | `min-h-[44px]` |

- 사진 업로드는 점선 업로드 영역 + 공용 `components/ui/ImageEditor`(크롭·회전) 조합만 쓴다. 새 크롭·회전 UI를 만들지 않는다.
- 색은 상태다. red=위험, amber=주의, green=정상, blue=진행.
- 다크모드는 전역 차단되어 있으니 `dark:`를 쓰지 않는다.
- 디자인 시스템에 없는 색·그림자·글꼴을 새로 만들지 않는다. 필요하면 정본 문서를 먼저 고친다.
