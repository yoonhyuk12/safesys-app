<!-- SafeSys UI 디자인 시스템 — 화면을 만들 때 따르는 색·타이포·컨트롤·패턴의 단일 출처 -->
# SafeSys 디자인 시스템

SafeSys UI의 **정본(canonical)** 이다. 새 화면·컴포넌트를 만들 때 여기서 클래스 문자열을 복사해 쓴다.

> 이 문서는 상상이 아니라 **현재 코드에서 실측한 값**이다. 괄호 안 숫자는 `safesys-app/src` 전체에서 그 표기가 쓰인 횟수이며, 가장 많이 쓰인 표기를 정본으로 확정했다. 코드와 어긋나면 그것은 버그다 — 발견 즉시 갱신한다.

시각 자료: [SafeSys 디자인 시스템 캔버스](https://claude.ai/code/artifact/6be54681-d6c7-4c0f-aa41-46b6fdc3887b) (5장 — 기반·타이포·컨트롤·패턴·금지). 소스는 `docs/design-canvas/`에 있다.

## 세 가지 원칙

1. **밀도가 먼저다.** SafeSys는 현장 관리자가 표와 숫자를 훑는 업무 화면이다. 본문 기본은 14px, 표·라벨은 12px이다. 여백을 넓혀 "쾌적하게" 만들지 않는다.
2. **색은 상태다.** 빨강·노랑·초록은 장식이 아니라 안전 상태다. 아래 의미색 표 밖의 조합을 새로 만들지 않는다.
3. **팔레트 밖으로 나가지 않는다.** Tailwind v4 기본 팔레트 단계만 쓴다. 임의 hex(`bg-[#...]`)는 외부 브랜드색 외에는 금지다.

## 1. 색

다크모드는 `globals.css`가 `color-scheme: light only`로 **전역 차단**하고 있다. `dark:` 변형은 써도 켜지지 않는다 (현재 사용 0회 — 유지한다).

### 브랜드

| 토큰 | 쓰임 |
|------|------|
| `blue-600` (`#2563eb`) | 주 버튼, 활성 탭, 링크, 방패 아이콘. `layout.tsx`의 `themeColor`와 같은 값 |
| `blue-700` | `blue-600` 요소의 **hover 전용**. 다른 용도로 쓰지 않는다 |
| `blue-100` / `blue-50` | 배지 바탕, 강조 영역. 글자는 `blue-800` |
| `from-blue-950 via-blue-900 to-slate-900` | 앱 셸(전체 화면) 그라디언트 |

### 중립 스케일 — 역할이 고정되어 있다

| 토큰 | 역할 |
|------|------|
| `bg-gray-50` | 페이지 바탕, 표 헤더 바탕, 비활성 영역 (601) |
| `border-gray-200` | 카드·표의 **겉** 테두리, 구분선 |
| `border-gray-100` | 카드 **안쪽** 구분선 (`border-t` / `border-r`) |
| `border-gray-300` | **입력 컨트롤 테두리 전용** |
| `text-gray-400` | placeholder, 비활성 글자. 본문에 쓰지 않는다 |
| `text-gray-500` | 표 헤더, 캡션, 단위, 보조 설명 (1,090 — 최다) |
| `text-gray-600` | 본문 문장 |
| `text-gray-700` | 폼 라벨 |
| `text-gray-800` | 툴팁 바탕 |
| `text-gray-900` | 제목, 표 안의 핵심 값 |

### 의미색 — 안전 도메인

배지는 예외 없이 바탕 `-100`, 글자 `-800`이다.

| 뜻 | 색 | 쓰는 곳 |
|----|----|---------|
| 위험 · 미이행 | `red` | 미점검, 부적합, 사고, 기한 초과 |
| 주의 · 대기 | `amber` | 기한 임박, 승인 대기, 자재 원장 |
| 정상 · 완료 | `green` | 점검 완료, 적합, 서명 완료 |
| 진행 · 정보 | `blue` | 진행 중, 안내, 선택된 항목 |
| 계약 · 지급자재 | `emerald` | 계약·지급자재 계열 전용. `green`의 대체가 아니다 |
| 폭염 · 기상 | `orange` | 폭염 단계, 기상특보 전용. 일반 경고에 쓰지 않는다 |
| 해당 없음 | `gray` | 미해당, 종료, 비활성 |

## 2. 표면 계층

아래로 갈수록 앞에 놓인다. 계층을 건너뛰지 않는다.

| 계층 | 클래스 |
|------|--------|
| 1 · 셸 | `min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-slate-900` |
| 2 · 셸 위 패널 | `bg-white/80 backdrop-blur rounded-lg border border-white/20 shadow-sm` |
| 3 · 카드 **(정본, 49)** | `bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden` |
| 4 · 모달 | 덮개 `fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4` · 본체 `bg-white rounded-lg shadow-xl max-w-md w-full p-6` |

`shadow-xl`은 **모달에만** 쓴다. 그림자로 계층을 표현하는 유일한 지점이다.

**화면 골격은 둘 중 하나다.**

- **대시보드형** — 어두운 셸 위. 대시보드·게시판·지도 등 정보가 많은 화면.
- **업무형** — `min-h-screen bg-gray-50` 위. 등록·수정 폼, 목록, 상세 등 한 가지 일을 하는 화면. 헤더는 `bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10`.

## 3. 타이포그래피

| 용도 | 글꼴 |
|------|------|
| UI 본문 | `Arial, Helvetica, sans-serif` — 한글은 OS 기본(맑은 고딕 등). `globals.css`의 `body`가 지정한다 |
| 숫자·코드 | `font-mono` → Geist Mono. 금액·수량·로그 등 자릿수가 흔들리면 안 되는 값에만 |
| 서류 은유 | `ChosunBg, serif` — 서류함·폴더·명패 UI 전용. 일반 화면에 번지지 않게 한다 |

### 타입 램프

| 클래스 | 크기 | 용도 |
|--------|------|------|
| `text-3xl` | 30px | 로그인·랜딩 등 단독 화면 대제목 (20) |
| `text-xl` | 20px | 화면 제목 (96) |
| `text-lg` | 18px | 섹션 제목. 정본은 `text-lg font-semibold text-gray-900` (188) |
| **`text-sm`** | **14px** | **본문 기본값** — 버튼, 폼 라벨, 표 본문, 설명 문장 (2,629) |
| **`text-xs`** | **12px** | 표 헤더, 배지, 캡션, 날짜 (1,969) |
| `text-[11px]` / `text-[10px]` | 11·10px | 지도 라벨, 촘촘한 표의 부가 열. 임의 값이지만 정식 허용 (399) |
| `text-[9px]` 이하 | — | **금지.** 현장에서 읽히지 않는다 (현재 24곳 잔존) |

### 굵기 — 셋만 쓴다

`font-medium`(라벨·버튼·배지·표 헤더, 1,871) · `font-semibold`(섹션 제목·강조 값, 985) · `font-bold`(화면 제목·핵심 수치, 405). `font-extrabold`·`font-black`은 쓰지 않는다.

## 4. 컨트롤 정본

모서리는 `rounded-lg`, 여백은 `px-4 py-2`, 전환은 `transition-colors`로 통일한다.

```
주 동작   px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg
          hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed
보조 동작 px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50
모달 짝   flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors
파괴적    px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors
아이콘    inline-flex items-center justify-center p-1.5 rounded-md bg-blue-600 text-white
          hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm
```

주 동작 버튼은 **화면당 하나**다. 파괴적 동작은 반드시 확인 모달을 거친다. 아이콘만 있는 버튼에는 `aria-label`을 붙인다.

```
입력      block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm
          focus:ring-blue-500 focus:border-blue-500 sm:text-sm                        (48)
체크박스  h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500
배지      inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
          bg-{색}-100 text-{색}-800
```

입력 컨트롤만 `rounded-md` · `border-gray-300`이다. 카드 테두리(`gray-200`)와 헷갈리지 않는다.

**아이콘**은 `lucide-react`만 쓴다. 기본 `h-4 w-4`(214), 섹션 제목 옆 `h-5 w-5`(62), 배지 안 `h-3 w-3`. 이모지를 UI 아이콘으로 쓰지 않는다.

## 5. 표 — SafeSys의 주력

본문 정렬은 **가운데가 기본**이다. 왼쪽 정렬은 현장명처럼 길이가 들쭉날쭉한 이름 열에만 쓴다.

```
겉      bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden
thead   bg-gray-50 border-b border-gray-200
th      px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider   (82)
tbody   bg-white divide-y divide-gray-200
td      px-3 py-3 text-sm text-center      강조 셀 → + font-medium text-gray-900
빈 행   px-4 py-8 text-center text-sm text-gray-500                                        (40)
```

빈 카드는 `border border-dashed border-gray-300 rounded-md p-6 text-center text-sm text-gray-500`. 로딩은 `<LoadingSpinner />`를 쓰고 직접 만들지 않는다.

## 6. 현장 제약

- **터치 영역 44px.** 장갑 낀 손으로 누르는 화면이다. 탭 가능한 요소는 `min-h-[44px]`를 지킨다.
- **모션 최소화 존중.** 흐르는 애니메이션은 `@media (prefers-reduced-motion: reduce)`에서 멈춘다 (`.tbm-live-bar` 참고).
- **출력물을 염두에 둔다.** PDF·Excel·HWPX로 나가는 화면에서는 이모지·임의 폰트·투명도가 깨진다.

## 7. 쓰지 말 것

기존 코드를 **지금 일괄 수정하지 않는다** — 해당 파일을 다른 이유로 열었을 때 그 자리만 정본으로 바꾼다. 새 코드는 처음부터 오른쪽을 쓴다.

| 쓰지 말 것 | 대신 이것 |
|-----------|----------|
| `bg-black bg-opacity-50` (70) — Tailwind v3 잔재 | `bg-black/50` (27). 모든 `*-opacity-*`에 같은 규칙 |
| `bg-white rounded-xl shadow-sm border border-gray-100` (8) | `bg-white rounded-lg shadow-sm border border-gray-200` (49) |
| `globals.css`의 `.card` `.button` `.select-control` `.safe-documents-*` — 두 벌이 그대로 복제되어 있다 | Tailwind 유틸리티. `globals.css`엔 웹폰트·애니메이션·html2canvas 보정만 남긴다 |
| 임의 hex `bg-[#EBF1F5]` 등 (30) | 팔레트 단계. 외부 브랜드색(카카오·네이버)만 예외 |
| `text-[9px]` · `text-[8px]` (24) | `text-[10px]` 이상. 더 담아야 하면 열을 접거나 화면을 나눈다 |
| UI 아이콘으로서의 이모지 (컴포넌트 34개 파일, 199회) | `lucide-react` `h-4 w-4`. 콘솔 로그의 이모지는 그대로 둬도 된다 |
| `dark:` 변형 | 라이트 모드 단일 팔레트. 다크모드는 별도 디자인 결정으로 다룬다 |

## 8. 미결 — 본문 글꼴

`layout.tsx`는 Geist Sans를 Google Fonts에서 불러오고 `--font-geist-sans`까지 연결해 두었지만, 코드 어디에서도 `font-sans`를 쓰지 않는다(**0회**). 실제 화면은 `globals.css`의 `body { font-family: Arial, Helvetica, sans-serif }`로 그려지고, Geist는 매 방문마다 내려받기만 하고 버려진다.

둘 중 하나로 정해야 한다.

- **(가)** `body`를 `var(--font-geist-sans)`로 바꿔 Geist를 실제로 쓴다 — 화면 전체의 글자 인상이 바뀌므로 눈으로 확인이 필요하다.
- **(나)** `layout.tsx`의 Geist Sans 로드를 걷어내 낭비를 없앤다 — `Geist_Mono`는 `font-mono`가 실제로 쓰이므로 남긴다.

이 문서는 결정 전까지 **현행(Arial)** 을 기준으로 적는다.
