# 원본 PDF의 표 셀 단위 원문과 카테고리를 추출하여 카탈로그 검증 자료를 만든다.
import json
from pathlib import Path
import pymupdf

root = Path(__file__).resolve().parents[2]
pdf = pymupdf.open(root / 'docs/일일안전점검 체크리스트 양식.pdf')
names = ['타워크레인', '이동식 크레인', '클램셀', '항타항발기', '천공기', '굴착기', '지게차', '고소작업대 (테이블 리프트)', '고소작업대 (차량탑재형)', '건설용 리프트', '곤돌라', '콘크리트 펌프카', '콘크리트 플레이싱 붐(CPB)', '로더', '롤러', '불도저', '모터그레이더', '스크레퍼', '공기압축기', '준설선', '쇄석기', '믹서트럭', '덤프트럭']
catalog = []
for index, name in enumerate(names):
    page = pdf[index + 5]
    table = next(t for t in page.find_tables().tables if t.col_count == 10)
    items = []
    category = ''
    for row in table.extract()[2:]:
        if row[0]:
            category = ''.join(row[0].split())
        assert category in ['기본사항', '작업전점검', '작동검사']
        assert row[1]
        items.append({'id': f'equipment-{index + 1:02d}-{len(items) + 1:02d}', 'category': category, 'text': row[1]})
    catalog.append({'id': f'equipment-{index + 1:02d}', 'name': name, 'sourcePage': index + 6, 'items': items})
output = Path(__file__).with_name('fixtures') / 'equipment-inspection-source.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print([(c['sourcePage'], c['name'], len(c['items'])) for c in catalog])
print('Total:', sum(len(c['items']) for c in catalog))
