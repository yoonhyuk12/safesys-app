# 정기·본부불시점검 지적 텍스트 키워드 분류 스크립트 (읽기 전용 분석)
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

base = Path(
    r"C:\Users\Sweet HOME\.grok\sessions"
    r"\C%3A%5CUsers%5CSweet%20HOME%5CDocuments%5CAI%5C%EC%95%88%EC%A0%84%EA%B4%80%EB%A6%AC%EC%8B%9C%EC%8A%A4%ED%85%9C"
    r"\019f72ae-17dc-7832-b4f5-58d8ea1a7fd5\mcp"
)
out_dir = Path(r"C:\Users\Sweet HOME\Documents\AI\안전관리시스템\safesys-app\scratch")
out_dir.mkdir(parents=True, exist_ok=True)


def extract_rows(path: Path):
    raw = json.load(open(path, encoding="utf-8"))["result"]
    m = re.search(r"<untrusted-data-[^>]+>\s*(\[.*\])\s*</untrusted-data", raw, re.S)
    if m:
        return json.loads(m.group(1))
    start = raw.find("[")
    end = raw.rfind("]")
    return json.loads(raw[start : end + 1])


files = {
    "safety_results": "call-31f78c32-ff6a-4ba0-b389-1a9c0541a97a-35.json",
    "safety_additional": "call-31f78c32-ff6a-4ba0-b389-1a9c0541a97a-36.json",
    "hq_issues": "call-31f78c32-ff6a-4ba0-b389-1a9c0541a97a-37.json",
    "hq_bad_items": "call-31f78c32-ff6a-4ba0-b389-1a9c0541a97a-38.json",
}

NO_FINDING_EXACT = {
    "양호",
    "적정",
    "이상없음",
    "이상 없음",
    "지적없음",
    "지적 없음",
    "해당없음",
    "해당 없음",
    "해당사항 없음",
    "해당 사항 없음",
    "없음",
    "특이사항 없음",
    "특이사항없음",
    "n/a",
    "na",
    "지적사항 없음",
    "지적사항없음",
    "점검사항 없음",
    "점검사항없음",
    "조치",
    "지적",
    "사례",
    ".",
    "-",
    "현장 점검",
    "현장점검",
    "서류 점검",
    "서류점검",
    "현장 및 서류 점검",
    "안전점검 사진",
    "서류 점검 사진",
    "안전서류 확인",
    "현장 점검 사진",
    "조치사항 없음",
}


def norm(t):
    if t is None:
        return ""
    t = str(t).replace("\r", " ").replace("\n", " ").strip()
    return re.sub(r"\s+", " ", t)


DEFECT_RE = re.compile(
    r"미설치|미착용|미배치|미흡|불량|누락|필요|교체|지시|위험|미사용|미준수|부적정|미확보|미비|부족|파손|노후|보완|요망|요함|금지|철거|개선|조치"
)


def is_non_finding(text: str) -> bool:
    t = norm(text)
    if not t or len(t) < 2:
        return True
    compact = re.sub(r"\s+", "", t.lower())
    exact_compact = {re.sub(r"\s+", "", x.lower()) for x in NO_FINDING_EXACT}
    if t in NO_FINDING_EXACT or compact in exact_compact:
        return True
    non_patterns = [
        r"지적\s*사항\s*없음",
        r"특이\s*사항\s*없음",
        r"해당\s*없",
        r"점검\s*사항\s*없음",
        r"공사\s*(중지로|미착공|준비중|완료|준공).{0,30}(없|해당)",
        r"^(현장|서류|안전)\s*(점검|확인|사진)",
        r"^조치$",
        r"^지적$",
        r"^사례$",
        r"양호함?$",
        r"적정함?$",
        r"관리상태\s*양호",
        r"품질\s*상태\s*양호",
        r"상태\s*양호",
        r"확인\s*완료$",
        r"준수$",
        r"^검교정\s*완료$",
        r"작업\s*없음",
        r"관련\s*작업\s*없음",
        r"해당\s*공정\s*없음",
        r"접근\s*금지표시\s*양호",
        r"작업계획서\s*작성\s*양호",
        r"tbm활동\s*상태\s*양호",
        r"품질관리\s*적정",
        r"관리비\s*반영",
        r"로\s*해당없음",
    ]
    for p in non_patterns:
        if re.search(p, t, re.I):
            if DEFECT_RE.search(t) and not re.search(
                r"지적\s*사항\s*없음|특이\s*사항\s*없음|해당\s*없", t
            ):
                return False
            return True
    if re.search(r"양호|적정|특이사항\s*없음|확인$", t) and not DEFECT_RE.search(t):
        return True
    return False


CODES = [
    (
        "F01_PPE",
        "개인보호구",
        "안전모·안전대·안전화·안전띠·보호복 등 개인보호구 미착용/부적정",
        [
            r"안전모",
            r"안전대",
            r"안전화",
            r"안전띠",
            r"안전벨트",
            r"보호구",
            r"보호복",
            r"턱끈",
            r"안전복",
            r"용접\s*안전",
        ],
    ),
    (
        "F02_FALL",
        "추락·개구부 방지",
        "안전난간·개구부·추락방지망·안전줄 등 추락 위험 구간 조치 미흡",
        [
            r"추락",
            r"개구부",
            r"안전난간",
            r"난간",
            r"추락방지",
            r"안전줄",
            r"타이거",
            r"낙하방지",
            r"중간난간",
            r"난간\s*캡",
            r"안전캡",
            r"방호벽",
            r"안전\s*휀스",
            r"안전휀스",
            r"추락\s*주의",
        ],
    ),
    (
        "F03_ACCESS",
        "가설통로·계단·사다리",
        "가설통로·안전계단·사다리·작업발판 등 이동로 부적정",
        [
            r"가설통로",
            r"안전계단",
            r"가설계단",
            r"사다리",
            r"작업발판",
            r"이동통로",
            r"안전통로",
            r"통행로",
            r"진입로",
            r"경사로",
            r"계단",
            r"발판",
            r"아웃트리거",
            r"말비계",
        ],
    ),
    (
        "F04_SCAFFOLD",
        "비계·동바리",
        "시스템/강관 비계·동바리 구조·설치 기준 미준수",
        [r"비계", r"동바리", r"시스템\s*비계", r"강관\s*비계", r"수평재", r"받침철물"],
    ),
    (
        "F05_MACHINERY",
        "건설기계·중장비",
        "굴삭기 등 건설기계 안전장치·작업반경·계획 미흡",
        [
            r"건설기계",
            r"굴삭기",
            r"굴착기",
            r"차량계",
            r"중장비",
            r"후방\s*경고",
            r"후방영상",
            r"후사경",
            r"버킷",
            r"스카이",
            r"장비",
            r"운전자",
            r"전조등",
        ],
    ),
    (
        "F06_LIFTING",
        "인양·줄걸이",
        "슬링벨트·인양로프·훅해지·줄걸이 방법 등 인양 작업 위험",
        [
            r"인양",
            r"슬링",
            r"실링벨트",
            r"줄걸이",
            r"훅",
            r"인양벨트",
            r"인양밴드",
            r"인양로프",
            r"와이어",
        ],
    ),
    (
        "F07_SIGNAL",
        "신호수·작업지휘",
        "신호수·작업지휘자 미배치 또는 위치 부적정",
        [r"신호수", r"작업지휘", r"유도원", r"교통\s*유도"],
    ),
    (
        "F08_ACCESS_CTRL",
        "출입·접근 통제",
        "민간인/근로자 출입통제·접근금지·휀스 미흡",
        [
            r"출입",
            r"접근금지",
            r"접근\s*금지",
            r"통제",
            r"민간인",
            r"출입금지",
            r"시건",
            r"휀스",
            r"펜스",
        ],
    ),
    (
        "F09_SIGNAGE",
        "안전표지·안내간판",
        "안전보건표지·공사안내·실명제·허가제 간판 미설치",
        [
            r"안전보건\s*표지",
            r"안전\s*보건\s*표지",
            r"안전표지",
            r"안내\s*간판",
            r"공사\s*안내",
            r"표지판",
            r"간판",
            r"실명제",
            r"사전\s*작업\s*허가",
            r"허가제\s*간판",
            r"현수막",
            r"속도\s*제한\s*표지",
            r"MSDS\s*표지",
            r"경고등",
            r"표지",
        ],
    ),
    (
        "F10_HOUSEKEEP",
        "정리정돈·폐기물",
        "현장 정리정돈·폐기물·부산물 방치",
        [r"정리", r"폐기물", r"부산물", r"쓰레기", r"방치", r"주변정리", r"현장\s*정리", r"청소"],
    ),
    (
        "F11_MATERIAL",
        "자재 적치·보관",
        "자재 적치·덮개·보관상태 미흡",
        [r"자재", r"적치", r"덮개", r"보관", r"철근", r"파이프", r"노출", r"야적"],
    ),
    (
        "F12_FLOOD",
        "수방·우기·사면",
        "수방자재·사면·배수·우기 대비 미흡",
        [
            r"수방",
            r"우기",
            r"사면",
            r"법면",
            r"배수",
            r"물넘이",
            r"성토",
            r"침하",
            r"유실",
            r"되메",
            r"터파기",
            r"굴착면",
            r"흙막이",
        ],
    ),
    (
        "F13_ELEC",
        "전기·감전",
        "전선·콘센트·배전반·감전 위험 조치 미흡",
        [r"전선", r"감전", r"콘센트", r"배전", r"전기", r"꽂음접속", r"누전", r"발전기"],
    ),
    (
        "F14_TOOL",
        "수공구·기계안전",
        "그라인더 덮개 등 공구·기계 방호장치 미흡",
        [r"그라인더", r"핸드그라인더", r"회전\s*날", r"안전덮개", r"가공\s*기구", r"절단"],
    ),
    (
        "F15_HAZMAT",
        "위험물·MSDS",
        "위험물 보관·MSDS·책임자 표시 미흡",
        [r"위험물", r"MSDS", r"유류", r"소화기", r"위험\s*물품"],
    ),
    (
        "F16_DOC",
        "서류·계획·평가",
        "작업계획서·위험성평가·허가제·법정서류 미비",
        [
            r"작업계획서",
            r"위험성\s*평가",
            r"위험성평가",
            r"허가",
            r"서류",
            r"일지",
            r"대장",
            r"규정",
            r"실시규정",
            r"산업안전",
            r"안전관리계획",
            r"재해예방",
            r"VAR",
            r"검교정",
            r"성적서",
            r"품질검사",
            r"수불부",
            r"시험",
            r"명단",
            r"조직도",
            r"휴게시설\s*운영",
            r"폭염\s*관리",
            r"법령",
        ],
    ),
    (
        "F17_WELFARE",
        "휴게·보건시설",
        "휴게실·생수·온도계 등 근로자 복지·보건 시설 미비",
        [r"휴게", r"생수", r"온도계", r"쉼터"],
    ),
    (
        "F18_QUALITY",
        "품질·환경 기타",
        "품질·환경 관리 관련 지적(시험/검교정 외)",
        [r"품질", r"환경", r"비산", r"분진", r"오염"],
    ),
    (
        "F19_OTHER",
        "기타 안전관리",
        "위 분류에 해당하지 않는 기타 현장 안전 지적",
        [],
    ),
]


def classify(text: str) -> str:
    t = norm(text)
    for code, _name, _definition, pats in CODES:
        if code == "F19_OTHER":
            continue
        for p in pats:
            if re.search(p, t, re.I):
                return code
    return "F19_OTHER"


records = []

rows = extract_rows(base / files["safety_results"])
for r in rows:
    text = norm(r.get("finding_text"))
    if is_non_finding(text):
        continue
    records.append(
        {
            "source": "safety_results",
            "source_group": "regular",
            "text": text,
            "has_photo": bool(r.get("has_photo")),
            "date": r.get("inspection_date"),
            "hq": r.get("managing_hq"),
            "branch": r.get("managing_branch"),
            "project": r.get("project_name"),
            "field": r.get("field_item"),
            "insp_type": r.get("inspection_type"),
        }
    )

rows = extract_rows(base / files["safety_additional"])
for r in rows:
    text = norm(r.get("finding_text"))
    if is_non_finding(text):
        continue
    if not DEFECT_RE.search(text):
        continue
    records.append(
        {
            "source": "safety_additional",
            "source_group": "regular",
            "text": text,
            "has_photo": bool(r.get("has_photo")),
            "date": r.get("inspection_date"),
            "hq": r.get("managing_hq"),
            "branch": r.get("managing_branch"),
            "project": r.get("project_name"),
            "field": r.get("field_item"),
            "insp_type": r.get("inspection_type"),
        }
    )

rows = extract_rows(base / files["hq_issues"])
for r in rows:
    text = norm(r.get("finding_text"))
    if is_non_finding(text):
        continue
    records.append(
        {
            "source": "hq_issue_content",
            "source_group": "headquarters",
            "text": text,
            "has_photo": bool(r.get("has_photo")),
            "date": r.get("inspection_date"),
            "hq": r.get("managing_hq"),
            "branch": r.get("managing_branch"),
            "project": r.get("project_name"),
            "field": r.get("field_item"),
            "insp_type": "본부불시점검",
        }
    )

rows = extract_rows(base / files["hq_bad_items"])
for r in rows:
    text = norm(r.get("finding_text"))
    if is_non_finding(text):
        title = norm(r.get("field_item"))
        if not title:
            continue
        text = f"[부적합항목] {title}"
    records.append(
        {
            "source": "hq_json_bad",
            "source_group": "headquarters",
            "text": text,
            "has_photo": False,
            "date": r.get("inspection_date"),
            "hq": r.get("managing_hq"),
            "branch": r.get("managing_branch"),
            "project": r.get("project_name"),
            "field": r.get("field_item"),
            "insp_type": "본부불시점검",
            "bucket": r.get("bucket"),
        }
    )

for rec in records:
    rec["code"] = classify(rec["text"])

total = len(records)
by_source = Counter(r["source"] for r in records)
primary = [r for r in records if r["source"] in ("safety_results", "hq_issue_content")]
primary_json = [r for r in records if r["source"] == "hq_json_bad"]
primary_add = [r for r in records if r["source"] == "safety_additional"]


def summarize(subset, label):
    n = len(subset)
    c = Counter(r["code"] for r in subset)
    print(f"\n=== {label}: {n} ===")
    for code, name, *_ in CODES:
        cnt = c.get(code, 0)
        if cnt == 0:
            continue
        pct = 100 * cnt / n if n else 0
        print(f"  {code} {name}: {cnt} ({pct:.1f}%)")
    return c


print("TOTAL records", total)
print("by source", dict(by_source))
print(
    "date range",
    min((r["date"] for r in records if r["date"]), default=None),
    max((r["date"] for r in records if r["date"]), default=None),
)

c_all = summarize(records, "ALL")
c_primary = summarize(primary, "PRIMARY (results + hq issues)")
c_photo = summarize([r for r in primary if r["has_photo"]], "PRIMARY with photo")
c_reg = summarize([r for r in primary if r["source_group"] == "regular"], "REGULAR primary")
c_hq = summarize([r for r in primary if r["source_group"] == "headquarters"], "HQ primary")
c_json = summarize(primary_json, "HQ JSON bad")
c_add = summarize(primary_add, "Safety additional defect-like")

examples = defaultdict(list)
for r in sorted(primary, key=lambda x: (not x["has_photo"], x["date"] or "")):
    if len(examples[r["code"]]) < 3:
        examples[r["code"]].append(
            {
                "text": r["text"][:140],
                "source": r["source"],
                "date": r["date"],
                "branch": r["branch"],
                "has_photo": r["has_photo"],
            }
        )
for r in records:
    if len(examples[r["code"]]) < 2:
        examples[r["code"]].append(
            {
                "text": r["text"][:140],
                "source": r["source"],
                "date": r["date"],
                "branch": r["branch"],
                "has_photo": r["has_photo"],
            }
        )

for src in ["safety_results", "hq_issue_content", "hq_json_bad", "safety_additional"]:
    sub = [r for r in records if r["source"] == src]
    if not sub:
        continue
    dates = [r["date"] for r in sub if r["date"]]
    print(
        f"{src}: n={len(sub)} photo={sum(1 for r in sub if r['has_photo'])} {min(dates)}~{max(dates)}"
    )

print("\nRAW input sizes:")
for k, v in files.items():
    print(k, len(extract_rows(base / v)))

print("\nF19 samples:")
for r in [x for x in primary if x["code"] == "F19_OTHER"][:30]:
    print(" -", r["text"][:110], "|", r["source"])

# Source breakdown for report
raw_safety = extract_rows(base / files["safety_results"])
raw_hq = extract_rows(base / files["hq_issues"])
raw_add = extract_rows(base / files["safety_additional"])
raw_json = extract_rows(base / files["hq_bad_items"])

summary = {
    "total_classified": total,
    "by_source": dict(by_source),
    "by_code_all": dict(c_all),
    "by_code_primary": dict(c_primary),
    "by_code_photo_primary": dict(Counter(r["code"] for r in primary if r["has_photo"])),
    "by_code_regular": dict(c_reg),
    "by_code_hq": dict(c_hq),
    "by_code_hq_json": dict(c_json),
    "by_code_additional": dict(c_add),
    "examples": dict(examples),
    "codes": [
        {"code": c, "name": n, "definition": d, "keywords": p} for c, n, d, p in CODES
    ],
    "primary_n": len(primary),
    "primary_photo_n": sum(1 for r in primary if r["has_photo"]),
    "hq_json_n": len(primary_json),
    "additional_n": len(primary_add),
    "raw_counts": {
        "safety_results_rows": len(raw_safety),
        "safety_results_valid": len([r for r in records if r["source"] == "safety_results"]),
        "hq_issue_rows": len(raw_hq),
        "hq_issue_valid": len([r for r in records if r["source"] == "hq_issue_content"]),
        "hq_json_bad_rows": len(raw_json),
        "additional_raw_meaningful_action": len(raw_add),
        "additional_defect_like": len(primary_add),
    },
    "date_range": {
        "all_min": min((r["date"] for r in records if r["date"]), default=None),
        "all_max": max((r["date"] for r in records if r["date"]), default=None),
        "regular_min": min(
            (r["date"] for r in primary if r["source_group"] == "regular" and r["date"]),
            default=None,
        ),
        "regular_max": max(
            (r["date"] for r in primary if r["source_group"] == "regular" and r["date"]),
            default=None,
        ),
        "hq_min": min(
            (r["date"] for r in primary if r["source_group"] == "headquarters" and r["date"]),
            default=None,
        ),
        "hq_max": max(
            (r["date"] for r in primary if r["source_group"] == "headquarters" and r["date"]),
            default=None,
        ),
    },
}

json.dump(
    summary,
    open(out_dir / "inspection-finding-classification-data.json", "w", encoding="utf-8"),
    ensure_ascii=False,
    indent=2,
)
print("\nSaved summary JSON")
