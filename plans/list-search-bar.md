# 계획서: /list 페이지 검색바 추가

## 개요

`/list` 페이지의 헤더 컨테이너(`bg-white/80`)와 메인 콘텐츠 컨테이너(`bg-white/90`) 사이에 검색바를 추가하여, 사업명·지사명·감독명·주소로 사업카드를 검색하고 매칭되는 지사 컨테이너와 사업카드만 표시한다.

## 현재 구조

```
┌─────────────────────────────────────────┐
│  헤더 컨테이너 (bg-white/80)             │  ← 본부/지사 드롭다운, 통계, 뷰모드 토글
│  position: 16px, 113px                   │
└─────────────────────────────────────────┘
                                              ← ★ 여기에 검색바 삽입
┌─────────────────────────────────────────┐
│  메인 콘텐츠 컨테이너 (bg-white/90)      │  ← 지사별 그룹핑된 프로젝트 카드
│  position: 16px, 239px                   │
└─────────────────────────────────────────┘
```

## 변경 후 구조

```
┌─────────────────────────────────────────┐
│  헤더 컨테이너 (bg-white/80)             │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  🔍 검색바 (새로 추가)                    │
│  placeholder: "사업명, 지사명, 감독명,    │
│               주소로 검색..."             │
└─────────────────────────────────────────┘
┌─────────────────────────────────────────┐
│  메인 콘텐츠 (필터링된 결과만 표시)       │
│  - 매칭 프로젝트가 있는 지사만 표시       │
│  - 매칭 프로젝트 카드만 표시              │
└─────────────────────────────────────────┘
```

## 검색 대상 필드

| 필드 | 프로젝트 속성 | 예시 |
|------|--------------|------|
| 사업명 | `project.project_name` | "○○ 도로 확포장공사" |
| 지사명 | `project.managing_branch` | "서울지사" |
| 감독명 | `project.supervisor_name` | "김철수" |
| 주소 | `project.site_address` | "서울특별시 강남구..." |

## 검색 로직

1. **입력**: 사용자가 검색어를 입력 (디바운스 300ms)
2. **매칭**: 검색어를 공백으로 분리하여 각 토큰이 위 4개 필드 중 하나 이상에 포함되는지 확인 (AND 조건)
3. **필터링**: `filteredProjects` 중에서 검색어에 매칭되는 프로젝트만 추출
4. **그룹핑**: 매칭된 프로젝트가 속한 지사 컨테이너만 렌더링
5. **초기화**: 검색어가 비어있으면 기존 전체 목록 표시

```
검색어: "서울 김"
→ project_name에 "서울" 또는 "김" 포함 OR
  managing_branch에 "서울" 또는 "김" 포함 OR
  supervisor_name에 "서울" 또는 "김" 포함 OR
  site_address에 "서울" 또는 "김" 포함
→ 모든 토큰이 하나 이상의 필드에서 매칭되어야 함 (AND)
```

## 구현 상세

### 1단계: 상태 추가 (Dashboard.tsx)

```typescript
const [searchQuery, setSearchQuery] = useState<string>('')
```

### 2단계: 검색 필터 로직 (Dashboard.tsx)

기존 `filteredProjects`를 계산하는 `useMemo` 내부 또는 바로 뒤에 검색 필터를 추가한다.

```typescript
const searchFilteredProjects = useMemo(() => {
  if (!searchQuery.trim()) return filteredProjects

  const tokens = searchQuery.trim().toLowerCase().split(/\s+/)

  return filteredProjects.filter(project => {
    const searchableText = [
      project.project_name,
      project.managing_branch,
      project.supervisor_name,
      project.site_address,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return tokens.every(token => searchableText.includes(token))
  })
}, [filteredProjects, searchQuery])
```

### 3단계: 검색바 UI 렌더링

헤더 컨테이너와 메인 콘텐츠 컨테이너 사이에 삽입한다. `viewMode === 'list'`일 때만 표시.

```tsx
{/* 검색바 - list 뷰에서만 표시 */}
{viewMode === 'list' && (
  <div className="relative">
    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
    <input
      type="text"
      value={searchQuery}
      onChange={(e) => setSearchQuery(e.target.value)}
      placeholder="사업명, 지사명, 감독명, 주소로 검색..."
      className="w-full pl-10 pr-10 py-2.5 bg-white/90 backdrop-blur
                 rounded-lg border border-white/20 shadow-sm
                 text-sm placeholder:text-gray-400
                 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-300"
    />
    {searchQuery && (
      <button
        onClick={() => setSearchQuery('')}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        <X className="h-4 w-4" />
      </button>
    )}
  </div>
)}
```

### 4단계: 렌더링 로직 수정

지사별 그룹핑 및 카드 렌더링에서 `filteredProjects` 대신 `searchFilteredProjects`를 사용한다.

**변경 포인트:**
- 지사별 그룹핑 로직에서 데이터 소스를 `searchFilteredProjects`로 교체
- 그룹 내 프로젝트가 0개인 지사 컨테이너는 렌더링하지 않음
- 검색 결과가 0건일 때 "검색 결과가 없습니다" 메시지 표시

### 5단계: 통계 수치 연동 (선택사항)

검색 중일 때 헤더의 통계(총 N개)가 검색 결과 수를 반영할지 여부:
- **방안 A**: 통계는 전체 프로젝트 수 유지 (검색은 뷰 필터링만) ← 권장
- **방안 B**: 통계도 검색 결과 수로 변경

## 수정 파일

| 파일 | 변경 내용 |
|------|----------|
| `src/components/Dashboard.tsx` | 검색 상태, 검색바 UI, 필터링 로직, 렌더링 수정 |

## UX 고려사항

- 검색바 스타일은 기존 컨테이너와 동일한 `backdrop-blur` + `border-white/20` 톤 유지
- 검색어 입력 즉시 반응 (디바운스 불필요 — 클라이언트 필터링이므로 충분히 빠름)
- 검색어 초기화 버튼(X) 제공
- 검색 결과 0건 시 안내 메시지
- 뷰모드 전환 시 검색어 유지 여부 → **초기화** (다른 뷰에서는 검색 불필요)
- 모바일에서도 검색바 full-width 표시

## 검색 결과 없을 때 UI

```tsx
{searchFilteredProjects.length === 0 && searchQuery && (
  <div className="bg-white/90 backdrop-blur rounded-lg border border-white/20
                  shadow-sm p-8 text-center text-gray-500">
    <Search className="h-8 w-8 mx-auto mb-2 text-gray-300" />
    <p>'{searchQuery}'에 대한 검색 결과가 없습니다.</p>
  </div>
)}
```
