---
paths:
  - "safesys-app/src/lib/excel/**"
  - "safesys-app/src/lib/reports/**"
  - "safesys-app/src/lib/hwpx/**"
  - "safesys-app/scripts/**"
  - "safesys-app/public/**/*.hwpx"
---
# 출력물 서명란 — 서명 이미지는 안내 문구 위에 겹친다

Excel·PDF·HWPX 등 출력물의 서명란에 `(서명 또는 인)`, `(인 또는 서명)` 같은 안내 문구가 있으면 서명 이미지를 그 문구 **위에 겹쳐** 배치한다.

- 문구 앞이나 뒤의 별도 공간에 두지 않는다.
- 성명·직책 텍스트는 가리지 않는다.
- 일괄서명 등록 규칙은 [docs/database.md](../../../docs/database.md)를 따른다.
- HWPX 생성·디버깅은 `hwpx-authoring` 스킬을 연다.
