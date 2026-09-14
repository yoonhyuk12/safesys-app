// 원본 일일안전점검 체크리스트 PDF 6~28쪽의 23종 471개 항목을 보존한다.
import type { EquipmentChecklist } from './equipment-inspection-types'

// 원본의 표현·수치는 수정하지 않으며 현행 법규의 적합성을 주장하지 않는다.
export const EQUIPMENT_CHECKLISTS: EquipmentChecklist[] = [
  {
    "id": "equipment-01",
    "name": "타워크레인",
    "sourcePage": 6,
    "items": [
      {
        "id": "equipment-01-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가?\n(3톤미만 : 소형타워크레인, 3톤이상 : 타워크레인)"
      },
      {
        "id": "equipment-01-02",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-01-03",
        "category": "기본사항",
        "text": "방호울, 출입문 시건상태는 양호한가?"
      },
      {
        "id": "equipment-01-04",
        "category": "기본사항",
        "text": "날씨는 양호한가? (작업중지:순간풍속15m/s이상, 강우량 시간당\n1mm이상, 강설량 시간당 1cm이상)"
      },
      {
        "id": "equipment-01-05",
        "category": "작업전점검",
        "text": "마스트 및 지브는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-01-06",
        "category": "작업전점검",
        "text": "턴테이블은 균열, 풀림, 누유 등이 없는가?"
      },
      {
        "id": "equipment-01-07",
        "category": "작업전점검",
        "text": "와이어로프는 손상, 훼손이 없고, 감김 상태, 급유 및 외관\n상태는 양호한가?"
      },
      {
        "id": "equipment-01-08",
        "category": "작업전점검",
        "text": "브레이크는 편마모, 누유, 탈락 등이 없는가?"
      },
      {
        "id": "equipment-01-09",
        "category": "작업전점검",
        "text": "훅 해지장치, 줄걸이용구의 상태는 양호한가?"
      },
      {
        "id": "equipment-01-10",
        "category": "작업전점검",
        "text": "무전기의 상태는 양호한가?"
      },
      {
        "id": "equipment-01-11",
        "category": "작동검사",
        "text": "모니터 각 부의 표시, 정격하중, 후크 카메라는 양호한가?"
      },
      {
        "id": "equipment-01-12",
        "category": "작동검사",
        "text": "권과방지장치, 비상정지장치, 리미트스위치, 충돌경고장치,\n부저는 정상작동하는가?"
      },
      {
        "id": "equipment-01-13",
        "category": "작동검사",
        "text": "선회/호이스트/기복/트롤리는 정상 작동하는가?"
      },
      {
        "id": "equipment-01-14",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      }
    ]
  },
  {
    "id": "equipment-02",
    "name": "이동식 크레인",
    "sourcePage": 7,
    "items": [
      {
        "id": "equipment-02-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (이동식 크레인 : 기중기,\n카고크레인 : 기중기 또는 안전공단 교육수료증)"
      },
      {
        "id": "equipment-02-02",
        "category": "기본사항",
        "text": "작업계획서, 유해위험방지계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-02-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-02-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-02-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착 방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-02-06",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-02-07",
        "category": "기본사항",
        "text": "지반은 평탄하고 단단한가?"
      },
      {
        "id": "equipment-02-08",
        "category": "작업전점검",
        "text": "철판 받침판은 수평으로 설치되었는가?"
      },
      {
        "id": "equipment-02-09",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-02-10",
        "category": "작업전점검",
        "text": "와이어로프 손상, 훼손이 없고, 감김 상태, 급유 및 외관\n상태는 양호한가?"
      },
      {
        "id": "equipment-02-11",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가? (무한궤도식:트랙손상, 마모,\n누유, 볼트풀림 등 / 타이어식:타이어 마모, 손상, 펑크,\n볼트풀림 등)"
      },
      {
        "id": "equipment-02-12",
        "category": "작업전점검",
        "text": "기복실린더, 드럼 유압감속기, 아우트리거 및 유압호스 의\n누유는 없는가?"
      },
      {
        "id": "equipment-02-13",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-02-14",
        "category": "작업전점검",
        "text": "무전기의 상태는 양호한가?"
      },
      {
        "id": "equipment-02-15",
        "category": "작동검사",
        "text": "권과방지장치, 과부하방지장치, 비상정지장치는 작동하는가?"
      },
      {
        "id": "equipment-02-16",
        "category": "작동검사",
        "text": "모니터 각 부의 표시, 정격하중 표시는 양호한가?"
      },
      {
        "id": "equipment-02-17",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-02-18",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-02-19",
        "category": "작동검사",
        "text": "아웃트리거의 작동상태 및 지반의 외관상태는 양호한가?"
      },
      {
        "id": "equipment-02-20",
        "category": "작동검사",
        "text": "전후진, 조향 및 제동장치는 양호한가?"
      },
      {
        "id": "equipment-02-21",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-02-22",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      }
    ]
  },
  {
    "id": "equipment-03",
    "name": "클램셀",
    "sourcePage": 8,
    "items": [
      {
        "id": "equipment-03-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (기중기 면허)"
      },
      {
        "id": "equipment-03-02",
        "category": "기본사항",
        "text": "작업계획서, 유해위험방지계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-03-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-03-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-03-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착 방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-03-06",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-03-07",
        "category": "기본사항",
        "text": "지반은 평탄하고 단단한가?"
      },
      {
        "id": "equipment-03-08",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-03-09",
        "category": "작업전점검",
        "text": "와이어로프 손상, 훼손이 없고, 감김 상태, 급유 및 외관\n상태는 양호한가?"
      },
      {
        "id": "equipment-03-10",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가? (무한궤도식:트랙손상, 마모,\n누유, 볼트풀림 등 / 타이어식:타이어 마모, 손상, 펑크,\n볼트풀림 등)"
      },
      {
        "id": "equipment-03-11",
        "category": "작업전점검",
        "text": "기복실린더, 드럼 유압감속기, 아우트리거 및 유압호스 의\n누유는 없는가?"
      },
      {
        "id": "equipment-03-12",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-03-13",
        "category": "작업전점검",
        "text": "무전기의 상태는 양호한가?"
      },
      {
        "id": "equipment-03-14",
        "category": "작업전점검",
        "text": "토사Box 및 게이트는 균열 및 파손이 없고, 줄걸이 용구는\n양호한가?"
      },
      {
        "id": "equipment-03-15",
        "category": "작동검사",
        "text": "권과방지장치, 과부하방지장치, 비상정지장치는 작동하는가?"
      },
      {
        "id": "equipment-03-16",
        "category": "작동검사",
        "text": "모니터 각 부의 표시, 정격하중 표시는 양호한가?"
      },
      {
        "id": "equipment-03-17",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-03-18",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-03-19",
        "category": "작동검사",
        "text": "아웃트리거의 작동상태 및 지반의 외관상태는 양호한가?"
      },
      {
        "id": "equipment-03-20",
        "category": "작동검사",
        "text": "전후진, 조향 및 제동장치는 양호한가?"
      },
      {
        "id": "equipment-03-21",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-03-22",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      }
    ]
  },
  {
    "id": "equipment-04",
    "name": "항타항발기",
    "sourcePage": 9,
    "items": [
      {
        "id": "equipment-04-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (천공기 면허)"
      },
      {
        "id": "equipment-04-02",
        "category": "기본사항",
        "text": "작업계획서, 유해위험방지계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-04-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-04-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-04-05",
        "category": "기본사항",
        "text": "발전기 등의 부착상태는 견고하고 이탈염려가 없는가?"
      },
      {
        "id": "equipment-04-06",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-04-07",
        "category": "기본사항",
        "text": "작업 구역 지반은 평탄하고 침하가 없으며, 철판의 설치\n상태는 양호한가? (지반의 경사는 작업구간 5도이내, 이동구간\n7도이내일 것)"
      },
      {
        "id": "equipment-04-08",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-04-09",
        "category": "작업전점검",
        "text": "상부/하부오거, 해머, 스크류의 외관상태 및 체결상태는 양호한가?"
      },
      {
        "id": "equipment-04-10",
        "category": "작업전점검",
        "text": "와이어로프 손상, 훼손이 없고, 감김 상태, 급유 및 외관\n상태는 양호한가?"
      },
      {
        "id": "equipment-04-11",
        "category": "작업전점검",
        "text": "무한궤도의 트랙, 아이들러의 손상, 풀림, 누유는 없는가?"
      },
      {
        "id": "equipment-04-12",
        "category": "작업전점검",
        "text": "시브의 작동상태, 클립/클램프 등은 양호한가?"
      },
      {
        "id": "equipment-04-13",
        "category": "작업전점검",
        "text": "냉각수 및 오일류의 누설이 없는가?"
      },
      {
        "id": "equipment-04-14",
        "category": "작업전점검",
        "text": "무전기의 상태는 양호한가?"
      },
      {
        "id": "equipment-04-15",
        "category": "작업전점검",
        "text": "운전자의 시야확보 상태는 양호한가?"
      },
      {
        "id": "equipment-04-16",
        "category": "작동검사",
        "text": "권과방지장치, 과부하방지장치, 비상정지장치는 작동하는가?"
      },
      {
        "id": "equipment-04-17",
        "category": "작동검사",
        "text": "전후진 주행성능, 선회 및 주행제동성은 양호한가?"
      },
      {
        "id": "equipment-04-18",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-04-19",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-04-20",
        "category": "작동검사",
        "text": "전후진, 조향 및 제동장치는 양호한가?"
      },
      {
        "id": "equipment-04-21",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-04-22",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      }
    ]
  },
  {
    "id": "equipment-05",
    "name": "천공기",
    "sourcePage": 10,
    "items": [
      {
        "id": "equipment-05-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (5톤미만 : 소형 천공기,\n5톤이상 : 천공기 면허)"
      },
      {
        "id": "equipment-05-02",
        "category": "기본사항",
        "text": "작업계획서, 유해위험방지계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-05-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-05-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-05-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-05-06",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-05-07",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-05-08",
        "category": "작업전점검",
        "text": "드릴 비트의 깨어짐, 균열, 마모상태 등 외관상태는 양호한가?"
      },
      {
        "id": "equipment-05-09",
        "category": "작업전점검",
        "text": "와이어로프 손상, 훼손이 없고, 감김 상태, 급유 및 외관\n상태는 양호한가?"
      },
      {
        "id": "equipment-05-10",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가?"
      },
      {
        "id": "equipment-05-11",
        "category": "작업전점검",
        "text": "냉각수 및 오일류의 누설이 없는가?"
      },
      {
        "id": "equipment-05-12",
        "category": "작동검사",
        "text": "권과방지장치, 비상정지장치는 작동하는가?"
      },
      {
        "id": "equipment-05-13",
        "category": "작동검사",
        "text": "전후진 주행성능, 선회 및 주행제동성은 양호한가?"
      },
      {
        "id": "equipment-05-14",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-05-15",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-05-16",
        "category": "작동검사",
        "text": "전후진, 조향 및 제동장치는 양호한가?"
      },
      {
        "id": "equipment-05-17",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-05-18",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      }
    ]
  },
  {
    "id": "equipment-06",
    "name": "굴착기",
    "sourcePage": 11,
    "items": [
      {
        "id": "equipment-06-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (3톤미만 : 소형 굴착기,\n3톤이상 : 굴착기 면허)"
      },
      {
        "id": "equipment-06-02",
        "category": "기본사항",
        "text": "작업계획서, 유해위험방지계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-06-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-06-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-06-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-06-06",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-06-07",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-06-08",
        "category": "작업전점검",
        "text": "버킷 탈락방지장치(안전핀)는 확실히 체결되어 있는가?"
      },
      {
        "id": "equipment-06-09",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가?"
      },
      {
        "id": "equipment-06-10",
        "category": "작업전점검",
        "text": "냉각수 및 오일류의 누설이 없는가?"
      },
      {
        "id": "equipment-06-11",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-06-12",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동하는가?"
      },
      {
        "id": "equipment-06-13",
        "category": "작동검사",
        "text": "퀵커플러의 작동 및 안전핀의 체결상태는 양호한가?"
      },
      {
        "id": "equipment-06-14",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-06-15",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-06-16",
        "category": "작동검사",
        "text": "전후진, 조향 및 제동장치는 양호한가?"
      },
      {
        "id": "equipment-06-17",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-06-18",
        "category": "작동검사",
        "text": "비상정지 스위치, 안전레버는 정상작동 되는가?"
      }
    ]
  },
  {
    "id": "equipment-07",
    "name": "지게차",
    "sourcePage": 12,
    "items": [
      {
        "id": "equipment-07-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (3톤미만 : 소형 지게차,\n3톤이상 : 지게차 면허)"
      },
      {
        "id": "equipment-07-02",
        "category": "기본사항",
        "text": "작업계획서, 유해위험방지계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-07-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-07-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-07-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-07-06",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-07-07",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-07-08",
        "category": "작업전점검",
        "text": "안전벨트는 훼손되지 않고 확실히 체결되는가?"
      },
      {
        "id": "equipment-07-09",
        "category": "작업전점검",
        "text": "타이어는 훼손되지 않고, 볼트 풀림이 없고, 트레드 마크의 홈 깊이가\n1.6mm이상인가?"
      },
      {
        "id": "equipment-07-10",
        "category": "작업전점검",
        "text": "후사경과 룸미러로 시야확보가 되는가?"
      },
      {
        "id": "equipment-07-11",
        "category": "작업전점검",
        "text": "냉각수 및 오일류의 누설이 없는가?"
      },
      {
        "id": "equipment-07-12",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-07-13",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동하는가?"
      },
      {
        "id": "equipment-07-14",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-07-15",
        "category": "작동검사",
        "text": "전후진, 조향 및 제동장치는 양호한가?"
      },
      {
        "id": "equipment-07-16",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-07-17",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-07-18",
        "category": "작동검사",
        "text": "주차브레이크를 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-07-19",
        "category": "작동검사",
        "text": "비상정지 스위치, 안전레버는 정상작동 되는가?"
      }
    ]
  },
  {
    "id": "equipment-08",
    "name": "고소작업대 (테이블 리프트)",
    "sourcePage": 13,
    "items": [
      {
        "id": "equipment-08-01",
        "category": "기본사항",
        "text": "안전인증(KcS) 인증서는 부착되었는가?"
      },
      {
        "id": "equipment-08-02",
        "category": "기본사항",
        "text": "작업계획서, 유해위험방지계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-08-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-08-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-08-05",
        "category": "기본사항",
        "text": "작업구간은 평탄하고 지반이 단단한가?"
      },
      {
        "id": "equipment-08-06",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-08-07",
        "category": "작업전점검",
        "text": "조작대 커버는 잘 부착되어 있는가?"
      },
      {
        "id": "equipment-08-08",
        "category": "작업전점검",
        "text": "풋스위치는 미끄럼 방지 표면구조이고 잠금이 해제되지\n않았는가?"
      },
      {
        "id": "equipment-08-09",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-08-10",
        "category": "작업전점검",
        "text": "안전벨트는 훼손되지 않고 확실히 체결되는가?"
      },
      {
        "id": "equipment-08-11",
        "category": "작업전점검",
        "text": "타이어는 훼손되지 않고, 볼트 풀림이 없고, 트레드 마크의 홈 깊이가\n1.6mm이상인가?"
      },
      {
        "id": "equipment-08-12",
        "category": "작업전점검",
        "text": "배터리 단자 커버는 잘 시공되어 있는가?"
      },
      {
        "id": "equipment-08-13",
        "category": "작업전점검",
        "text": "유압장치 및 실린더 등에서 유압유의 누설 등은 없는가?"
      },
      {
        "id": "equipment-08-14",
        "category": "작업전점검",
        "text": "작업대의 안전난간은 견고하게 설치되어 있는가?"
      },
      {
        "id": "equipment-08-15",
        "category": "작업전점검",
        "text": "출입문은 탑승 후 완전히 닫히는가?"
      },
      {
        "id": "equipment-08-16",
        "category": "작동검사",
        "text": "수직형 과상승 방지장치 4개가 원활하게 작동되는가?"
      },
      {
        "id": "equipment-08-17",
        "category": "작동검사",
        "text": "수평 안전바는 원활하게 작동되는가?"
      },
      {
        "id": "equipment-08-18",
        "category": "작동검사",
        "text": "수직상승시 포트홀 바는 정상적으로 완전히 작동되는가?"
      },
      {
        "id": "equipment-08-19",
        "category": "작동검사",
        "text": "풋스위치를 밟은 상태에서 작동이 되는가?"
      },
      {
        "id": "equipment-08-20",
        "category": "작동검사",
        "text": "비상정지장치는 원활히 작동되는가? (조작대, 차량 측면)"
      },
      {
        "id": "equipment-08-21",
        "category": "작동검사",
        "text": "작동 시 작동을 알릴 수 있는 경보장치는 작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-09",
    "name": "고소작업대 (차량탑재형)",
    "sourcePage": 14,
    "items": [
      {
        "id": "equipment-09-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (기중기 면허 또는 안전공단\n교육수료증)"
      },
      {
        "id": "equipment-09-02",
        "category": "기본사항",
        "text": "정기검사는 시행되었는가? (합격필증 확인)"
      },
      {
        "id": "equipment-09-03",
        "category": "기본사항",
        "text": "작업계획서, 유해위험방지계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-09-04",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-09-05",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-09-06",
        "category": "기본사항",
        "text": "작업구간은 평탄하고 지반이 단단한가?"
      },
      {
        "id": "equipment-09-07",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-09-08",
        "category": "기본사항",
        "text": "작업 근로자는 안전벨트, 안전모, 개인보호구 착용을 하였는가?"
      },
      {
        "id": "equipment-09-09",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-09-10",
        "category": "작업전점검",
        "text": "작업대 체결상태, 붐의 외관, 체인 또는 와이어로프의 체결상태\n등은 양호한가?"
      },
      {
        "id": "equipment-09-11",
        "category": "작업전점검",
        "text": "작업대 하부 고정볼트는 풀림이 없고 견고히 설치되었는가?"
      },
      {
        "id": "equipment-09-12",
        "category": "작업전점검",
        "text": "작업대의 안전난간대는 설치되어있는가? (4면 기본, 작업면\n승인 후 해체가능)"
      },
      {
        "id": "equipment-09-13",
        "category": "작업전점검",
        "text": "타이어는 훼손되지 않고, 볼트 풀림이 없고, 트레드 마크의 홈\n깊이가 1.6mm이상인가?"
      },
      {
        "id": "equipment-09-14",
        "category": "작업전점검",
        "text": "유압장치 및 실린더 등에서 유압유의 누설 등은 없는가?"
      },
      {
        "id": "equipment-09-15",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-09-16",
        "category": "작동검사",
        "text": "인디게이터 각 부의 차량표시, 정격하중의 표시는 적합한가?"
      },
      {
        "id": "equipment-09-17",
        "category": "작동검사",
        "text": "비상정지장치는 정상작동되는가? (작업대, 차량부, 원격조작기)"
      },
      {
        "id": "equipment-09-18",
        "category": "작동검사",
        "text": "아우트리거의 작동상태 및 지반의 외관상태는 양호한가?"
      },
      {
        "id": "equipment-09-19",
        "category": "작동검사",
        "text": "4개아우트리거의 램프는 모두 녹색으로 점등되었는가?\n(램프부착형)"
      },
      {
        "id": "equipment-09-20",
        "category": "작동검사",
        "text": "붐길이, 각도 센서는 정상적으로 동작되는가?"
      },
      {
        "id": "equipment-09-21",
        "category": "작동검사",
        "text": "붐 상승상태에서 아우트리거는 작동이 제한되어 있는가?"
      },
      {
        "id": "equipment-09-22",
        "category": "작동검사",
        "text": "정격하중에 따라 작업반경이 정상적으로 설정되는가?"
      },
      {
        "id": "equipment-09-23",
        "category": "작동검사",
        "text": "붐 인출, 회전 시 이상소음 및 진동이 없는가?"
      },
      {
        "id": "equipment-09-24",
        "category": "작동검사",
        "text": "전조등, 후미등, 방향지시등은 정상작동되는가?"
      },
      {
        "id": "equipment-09-25",
        "category": "작동검사",
        "text": "조향장치, 제동장치는 정상작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-10",
    "name": "건설용 리프트",
    "sourcePage": 15,
    "items": [
      {
        "id": "equipment-10-01",
        "category": "기본사항",
        "text": "정기검사는 시행되었는가? (합격필증 확인)"
      },
      {
        "id": "equipment-10-02",
        "category": "기본사항",
        "text": "방호울, 출입문 시건상태는 양호한가?"
      },
      {
        "id": "equipment-10-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-10-04",
        "category": "기본사항",
        "text": "기기 이름판(적재하중, 형식번호, 제작년월 및 제작사 등)과\n안전수칙(비상시 응급조치요령)이 부착되어 있는가?"
      },
      {
        "id": "equipment-10-05",
        "category": "기본사항",
        "text": "운반구 상부 안전난간대는 정상적으로 부착되어 있는가?"
      },
      {
        "id": "equipment-10-06",
        "category": "작업전점검",
        "text": "기초, 마스트, 수평지지대는 휨, 균열, 탈락 등이 없는가?"
      },
      {
        "id": "equipment-10-07",
        "category": "작업전점검",
        "text": "운반구, 출입문은 휨, 균열, 탈락 등이 없는가?"
      },
      {
        "id": "equipment-10-08",
        "category": "작업전점검",
        "text": "와이어로프, 배선의 상태는 양호한가?"
      },
      {
        "id": "equipment-10-09",
        "category": "작업전점검",
        "text": "승강로의 연결부분 및 볼트, 너트는 풀림 및 부식이 없는가?"
      },
      {
        "id": "equipment-10-10",
        "category": "작업전점검",
        "text": "수직 가이드레일은 수직으로 정확히 고정되어 있고, 손상, 균열\n및 풀림 등은 없는가?"
      },
      {
        "id": "equipment-10-11",
        "category": "작업전점검",
        "text": "운반구는 수평으로 안착되어 있고, 손상 및 균열 등이 없는가?"
      },
      {
        "id": "equipment-10-12",
        "category": "작업전점검",
        "text": "최상단의 기계식 스토퍼는 탈락, 훼손이 없는가?"
      },
      {
        "id": "equipment-10-13",
        "category": "작업전점검",
        "text": "랙 및 피니언의 풀림, 탈락, 변형 등이 없는가?"
      },
      {
        "id": "equipment-10-14",
        "category": "작업전점검",
        "text": "운반구 내 전선 등의 벗겨짐, 훼손 등은 없는가?"
      },
      {
        "id": "equipment-10-15",
        "category": "작동검사",
        "text": "자동운행 제어반은 정상적으로 작동하는가?"
      },
      {
        "id": "equipment-10-16",
        "category": "작동검사",
        "text": "모든 비상정지 스위치는 작동하는가?"
      },
      {
        "id": "equipment-10-17",
        "category": "작동검사",
        "text": "3상 전원차단장치는 작동하는가?"
      },
      {
        "id": "equipment-10-18",
        "category": "작동검사",
        "text": "출입문 연동장치는 작동하는가?"
      },
      {
        "id": "equipment-10-19",
        "category": "작동검사",
        "text": "운반구가 없는 상태에서 외부에서 방호울의 안전문이 열리지\n않을 것"
      },
      {
        "id": "equipment-10-20",
        "category": "작동검사",
        "text": "방호울 안전문이 완전히 닫히지 않은 상태에서 운반구가\n작동하지 않을 것"
      },
      {
        "id": "equipment-10-21",
        "category": "작동검사",
        "text": "상승, 하강 리미트 스위치는 정상작동 되는가?"
      },
      {
        "id": "equipment-10-22",
        "category": "작동검사",
        "text": "상승, 하강 시 경보와 함께 작동되는가?"
      },
      {
        "id": "equipment-10-23",
        "category": "작동검사",
        "text": "원하는 층고와 위치에 정상적으로 정지하는가?"
      },
      {
        "id": "equipment-10-24",
        "category": "작동검사",
        "text": "운반구 작동범위 외(최저층 이하, 최고층 이상)로 층고 버튼이\n작동되지 않을것"
      }
    ]
  },
  {
    "id": "equipment-11",
    "name": "곤돌라",
    "sourcePage": 16,
    "items": [
      {
        "id": "equipment-11-01",
        "category": "기본사항",
        "text": "안전인증(KcS) 인증서, 합격필증은 부착되었는가?"
      },
      {
        "id": "equipment-11-02",
        "category": "기본사항",
        "text": "적재하중, 형식번호 및 제조번호, 제조년월, 제조자명, 경고표시\n등 안전수칙은 부착되었는가?"
      },
      {
        "id": "equipment-11-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-11-04",
        "category": "기본사항",
        "text": "날씨는 양호한가? (바람이 많이 불지 않고, 비가 오지 않을 것)"
      },
      {
        "id": "equipment-11-05",
        "category": "기본사항",
        "text": "구명줄은 16mm이상이고 부식 및 훼손이 없는가?"
      },
      {
        "id": "equipment-11-06",
        "category": "기본사항",
        "text": "작업근로자는 안전벨트, 안전모, 개인보호구 착용을 하였는가?"
      },
      {
        "id": "equipment-11-07",
        "category": "기본사항",
        "text": "운전자는 산안법 제29조3항에 따른 특별교육을 수료하였는가?"
      },
      {
        "id": "equipment-11-08",
        "category": "작업전점검",
        "text": "바닥판재는 틈새가 없고 틀에 확실히 고정되고 균열, 부식,\n변형 등이 없는가?"
      },
      {
        "id": "equipment-11-09",
        "category": "작업전점검",
        "text": "본체는 균열, 부식, 변형이 없고 볼트 풀림이 없는가?"
      },
      {
        "id": "equipment-11-10",
        "category": "작업전점검",
        "text": "안전난간대는 견고하고, 높이가 90CM이상이며, 하부에\n10cm높이의 발끝막이판이 사방으로 설치되어 있는가?"
      },
      {
        "id": "equipment-11-11",
        "category": "작업전점검",
        "text": "암(Arm)은 균열, 휨, 앵커의 풀림 등이 없는가?"
      },
      {
        "id": "equipment-11-12",
        "category": "작업전점검",
        "text": "밸런스 웨이트의 부착상태가 확실하고 헐거움은 없는가?"
      },
      {
        "id": "equipment-11-13",
        "category": "작업전점검",
        "text": "와이어로프는 소선단선, 변형, 압착 등 훼손이 없는가?"
      },
      {
        "id": "equipment-11-14",
        "category": "작동검사",
        "text": "작동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-11-15",
        "category": "작동검사",
        "text": "좌우 와인더(Winder)가 동시에 작동되고 편차가 크지 않아야\n하며, 각각 작동되어 높낮이 조절이 가능한가?"
      },
      {
        "id": "equipment-11-16",
        "category": "작동검사",
        "text": "추락 방지를 위한 안전블록은 정상작동되는가?"
      },
      {
        "id": "equipment-11-17",
        "category": "작동검사",
        "text": "팬던트 스위치의 조작버튼을 손을 떼면 곤돌라의 작동이\n정지되는가?"
      },
      {
        "id": "equipment-11-18",
        "category": "작동검사",
        "text": "비상정지장치는 정상작동되는가? (팬던트 스위치, 제어반\n2개소)"
      },
      {
        "id": "equipment-11-19",
        "category": "작동검사",
        "text": "권과방지장치는 정상작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-12",
    "name": "콘크리트 펌프카",
    "sourcePage": 17,
    "items": [
      {
        "id": "equipment-12-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (대형운전면허)"
      },
      {
        "id": "equipment-12-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-12-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-12-04",
        "category": "기본사항",
        "text": "작업구간은 평탄하고 단단한가?"
      },
      {
        "id": "equipment-12-05",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-12-06",
        "category": "기본사항",
        "text": "작업경계 표시 및 신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-12-07",
        "category": "기본사항",
        "text": "레미콘 트럭 타이어 스토퍼는 구비되고, 확실하게 고정되어\n있는가?"
      },
      {
        "id": "equipment-12-08",
        "category": "작업전점검",
        "text": "차체, 아웃트리거 등는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-12-09",
        "category": "작업전점검",
        "text": "턴테이블, 링 기어의 균열, 볼트 풀림 등은 없는가?"
      },
      {
        "id": "equipment-12-10",
        "category": "작업전점검",
        "text": "붐, 압송관는 휨, 균열, 연결클램프 풀림 등이 없는가?"
      },
      {
        "id": "equipment-12-11",
        "category": "작업전점검",
        "text": "자바라(토출 말단 호스)는 규격품이며 1단(6m)인가?"
      },
      {
        "id": "equipment-12-12",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가? (타이어마모, 손상, 펑크,\n볼트풀림 등)"
      },
      {
        "id": "equipment-12-13",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-12-14",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-12-15",
        "category": "작동검사",
        "text": "각 레버, 스위치, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-12-16",
        "category": "작동검사",
        "text": "턴테이블 선회, 제동상태는 양호한가?"
      },
      {
        "id": "equipment-12-17",
        "category": "작동검사",
        "text": "아웃트리거 작동상태는 양호한가?"
      },
      {
        "id": "equipment-12-18",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      }
    ]
  },
  {
    "id": "equipment-13",
    "name": "콘크리트 플레이싱 붐(CPB)",
    "sourcePage": 18,
    "items": [
      {
        "id": "equipment-13-01",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-13-02",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-13-03",
        "category": "기본사항",
        "text": "날씨 상태는 양호한가?"
      },
      {
        "id": "equipment-13-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-13-05",
        "category": "기본사항",
        "text": "장비 열쇠, 리모콘은 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-13-06",
        "category": "작업전점검",
        "text": "기초, 마스트는 휨, 균열, 탈락, 볼트 풀림 등이 없는가?"
      },
      {
        "id": "equipment-13-07",
        "category": "작업전점검",
        "text": "턴테이블, 링 기어의 균열, 볼트 풀림 등은 없는가?"
      },
      {
        "id": "equipment-13-08",
        "category": "작업전점검",
        "text": "붐, 압송관는 휨, 균열, 연결클램프 풀림 등이 없는가?"
      },
      {
        "id": "equipment-13-09",
        "category": "작업전점검",
        "text": "자바라(토출 말단 호스)는 규격품이며 1단(6m)인가?"
      },
      {
        "id": "equipment-13-10",
        "category": "작업전점검",
        "text": "붐 실린더, 유압배관의 누유는 없는가?"
      },
      {
        "id": "equipment-13-11",
        "category": "작업전점검",
        "text": "전기배선의 단선, 고정상태는 양호한가?"
      },
      {
        "id": "equipment-13-12",
        "category": "작동검사",
        "text": "각 레버, 스위치는 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-13-13",
        "category": "작동검사",
        "text": "선회 및 붐 확장 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-13-14",
        "category": "작동검사",
        "text": "유압장치의 계기판, 압력계는 정상 작동하는가?"
      },
      {
        "id": "equipment-13-15",
        "category": "작동검사",
        "text": "비상정지스위치, 턴테이블 회전 리미트스위치는 작동하는가?"
      },
      {
        "id": "equipment-13-16",
        "category": "작동검사",
        "text": "붐 인출상태에서 자연 하강하지 않는가?"
      }
    ]
  },
  {
    "id": "equipment-14",
    "name": "로더",
    "sourcePage": 19,
    "items": [
      {
        "id": "equipment-14-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가?(3톤미만, 5톤미만 :\n소형롤러면허, 5톤이상 : 롤러면허)"
      },
      {
        "id": "equipment-14-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-14-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-14-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-14-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착 방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-14-06",
        "category": "기본사항",
        "text": "지반은 평탄하고 단단한가?"
      },
      {
        "id": "equipment-14-07",
        "category": "기본사항",
        "text": "유도원은 배치되었는가?"
      },
      {
        "id": "equipment-14-08",
        "category": "작업전점검",
        "text": "주요구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-14-09",
        "category": "작업전점검",
        "text": "버킷 및 핀 체결상태는 양호한가?"
      },
      {
        "id": "equipment-14-10",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가?(무한궤도식:트랙손상, 마모, 누유,\n볼트풀림 등 / 타이어식:타이어마모, 손상, 펑크, 볼트풀림 등)"
      },
      {
        "id": "equipment-14-11",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-14-12",
        "category": "작업전점검",
        "text": "붐 실린더, 유압배관의 누유는 없는가?"
      },
      {
        "id": "equipment-14-13",
        "category": "작업전점검",
        "text": "운전자의 시야확보상태는 양호한가?"
      },
      {
        "id": "equipment-14-14",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동되는가?"
      },
      {
        "id": "equipment-14-15",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-14-16",
        "category": "작동검사",
        "text": "유압장치의 각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-14-17",
        "category": "작동검사",
        "text": "전후진 주행, 및 조향 및 제동기능이 양호한가?"
      },
      {
        "id": "equipment-14-18",
        "category": "작동검사",
        "text": "붐 인출상태에서 자연 하강하지 후진 시 경고음 및\n후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-14-19",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-14-20",
        "category": "작동검사",
        "text": "비상정지스위치는 정상 작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-15",
    "name": "롤러",
    "sourcePage": 20,
    "items": [
      {
        "id": "equipment-15-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (롤러면허)"
      },
      {
        "id": "equipment-15-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-15-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-15-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-15-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착 방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-15-06",
        "category": "기본사항",
        "text": "지반은 평탄하고 단단한가?"
      },
      {
        "id": "equipment-15-07",
        "category": "기본사항",
        "text": "유도원은 배치되었는가?"
      },
      {
        "id": "equipment-15-08",
        "category": "작업전점검",
        "text": "주요구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-15-09",
        "category": "작업전점검",
        "text": "롤러의 표면상태, 이물질 제거 상태는 양호한가?"
      },
      {
        "id": "equipment-15-10",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가?(무한궤도식:트랙손상, 마모, 누유,\n볼트풀림 등 / 타이어식:타이어마모, 손상, 펑크, 볼트풀림 등)"
      },
      {
        "id": "equipment-15-11",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-15-12",
        "category": "작업전점검",
        "text": "유압배관의 누유는 없는가?"
      },
      {
        "id": "equipment-15-13",
        "category": "작업전점검",
        "text": "운전자의 시야확보상태는 양호한가?"
      },
      {
        "id": "equipment-15-14",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동되는가?"
      },
      {
        "id": "equipment-15-15",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-15-16",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-15-17",
        "category": "작동검사",
        "text": "전후진 주행, 및 조향 및 제동기능이 양호한가?"
      },
      {
        "id": "equipment-15-18",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-15-19",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-15-20",
        "category": "작동검사",
        "text": "비상정지스위치는 정상 작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-16",
    "name": "불도저",
    "sourcePage": 21,
    "items": [
      {
        "id": "equipment-16-01",
        "category": "기본사항",
        "text": "조종사의 자격여부는 적합한가?(5톤미만:소형불도저면허,\n5톤이상:불도저면허)"
      },
      {
        "id": "equipment-16-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-16-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-16-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-16-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착 방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-16-06",
        "category": "기본사항",
        "text": "작업구간 내 전도, 추락, 낙석의 위험은 없는가?"
      },
      {
        "id": "equipment-16-07",
        "category": "기본사항",
        "text": "유도원은 배치되었는가?"
      },
      {
        "id": "equipment-16-08",
        "category": "작업전점검",
        "text": "주요구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-16-09",
        "category": "작업전점검",
        "text": "버킷 및 핀 체결상태는 양호한가?"
      },
      {
        "id": "equipment-16-10",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가?(무한궤도식:트랙손상, 마모, 누유,\n볼트풀림 등 / 타이어식:타이어마모, 손상, 펑크, 볼트풀림 등)"
      },
      {
        "id": "equipment-16-11",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-16-12",
        "category": "작업전점검",
        "text": "붐 실린더, 유압배관의 누유는 없는가?"
      },
      {
        "id": "equipment-16-13",
        "category": "작업전점검",
        "text": "운전자의 시야확보상태는 양호한가?"
      },
      {
        "id": "equipment-16-14",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동되는가?"
      },
      {
        "id": "equipment-16-15",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-16-16",
        "category": "작동검사",
        "text": "유압장치의 각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-16-17",
        "category": "작동검사",
        "text": "전후진 주행, 및 조향 및 제동기능이 양호한가?"
      },
      {
        "id": "equipment-16-18",
        "category": "작동검사",
        "text": "붐 인출상태에서 자연 하강하지 후진 시 경고음 및\n후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-16-19",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-16-20",
        "category": "작동검사",
        "text": "비상정지스위치는 정상 작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-17",
    "name": "모터그레이더",
    "sourcePage": 22,
    "items": [
      {
        "id": "equipment-17-01",
        "category": "기본사항",
        "text": "조종사의 자격여부는 적합한가?(롤러면허증)"
      },
      {
        "id": "equipment-17-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-17-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-17-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-17-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착 방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-17-06",
        "category": "기본사항",
        "text": "작업구간 내 전도, 추락, 낙석의 위험은 없는가?"
      },
      {
        "id": "equipment-17-07",
        "category": "기본사항",
        "text": "유도원은 배치되었는가?"
      },
      {
        "id": "equipment-17-08",
        "category": "작업전점검",
        "text": "주요구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-17-09",
        "category": "작업전점검",
        "text": "토공판의 표면상태, 이물질 제거 상태는 양호한가?"
      },
      {
        "id": "equipment-17-10",
        "category": "작업전점검",
        "text": "타이어 손상, 고정볼트 풀림은 없는가?"
      },
      {
        "id": "equipment-17-11",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-17-12",
        "category": "작업전점검",
        "text": "실린더, 유압배관의 누유는 없는가?"
      },
      {
        "id": "equipment-17-13",
        "category": "작업전점검",
        "text": "운전자의 시야확보상태는 양호한가?"
      },
      {
        "id": "equipment-17-14",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동되는가?"
      },
      {
        "id": "equipment-17-15",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-17-16",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-17-17",
        "category": "작동검사",
        "text": "블레이드 등 작업장치는 상하좌우, 회전 등 정상적으로\n작동되는가?"
      },
      {
        "id": "equipment-17-18",
        "category": "작동검사",
        "text": "전후진 주행, 및 조향 및 제동기능이 양호한가?"
      },
      {
        "id": "equipment-17-19",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-17-20",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-17-21",
        "category": "작동검사",
        "text": "비상정지스위치는 정상 작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-18",
    "name": "스크레퍼",
    "sourcePage": 23,
    "items": [
      {
        "id": "equipment-18-01",
        "category": "기본사항",
        "text": "조종사의 자격여부는 적합한가? (롤러면허증)"
      },
      {
        "id": "equipment-18-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-18-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-18-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-18-05",
        "category": "기본사항",
        "text": "후방 반사판 및 협착 방지봉의 부착상태는 양호한가?"
      },
      {
        "id": "equipment-18-06",
        "category": "기본사항",
        "text": "작업구간 내 전도, 추락, 낙석의 위험은 없는가?"
      },
      {
        "id": "equipment-18-07",
        "category": "기본사항",
        "text": "유도원은 배치되었는가?"
      },
      {
        "id": "equipment-18-08",
        "category": "작업전점검",
        "text": "주요구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-18-09",
        "category": "작업전점검",
        "text": "보울, 에이프런, 이젝터, 요크는 양호한가?"
      },
      {
        "id": "equipment-18-10",
        "category": "작업전점검",
        "text": "타이어 손상, 고정볼트 풀림은 없는가?"
      },
      {
        "id": "equipment-18-11",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-18-12",
        "category": "작업전점검",
        "text": "실린더, 유압배관의 누유는 없는가?"
      },
      {
        "id": "equipment-18-13",
        "category": "작업전점검",
        "text": "운전자의 시야확보상태는 양호한가?"
      },
      {
        "id": "equipment-18-14",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동되는가?"
      },
      {
        "id": "equipment-18-15",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-18-16",
        "category": "작동검사",
        "text": "각 레버, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-18-17",
        "category": "작동검사",
        "text": "전후진 주행, 및 조향 및 제동기능이 양호한가?"
      },
      {
        "id": "equipment-18-18",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라, AVM이 정상작동 되는가?"
      },
      {
        "id": "equipment-18-19",
        "category": "작동검사",
        "text": "램프 및 경고등을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-18-20",
        "category": "작동검사",
        "text": "비상정지스위치는 정상 작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-19",
    "name": "공기압축기",
    "sourcePage": 24,
    "items": [
      {
        "id": "equipment-19-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (「2.83㎥/분」이상 :\n공기압축기, 「2.83㎥/분」미만:자격없음)"
      },
      {
        "id": "equipment-19-02",
        "category": "기본사항",
        "text": "운전원은 산안법 제29조3항에 따른 특별교육을 수료하였는가?"
      },
      {
        "id": "equipment-19-03",
        "category": "기본사항",
        "text": "안전인증(KcS) 인증서, 합격필증은 부착되었는가?"
      },
      {
        "id": "equipment-19-04",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-19-05",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-19-06",
        "category": "기본사항",
        "text": "설치한 지반은 평탄하고 단단한가?"
      },
      {
        "id": "equipment-19-07",
        "category": "기본사항",
        "text": "타이어 앞뒤를 고임목으로 고정하였는가?"
      },
      {
        "id": "equipment-19-08",
        "category": "기본사항",
        "text": "설치구역은 경계표시 및 근로자 출입이 통제되었는가?"
      },
      {
        "id": "equipment-19-09",
        "category": "작업전점검",
        "text": "공기저장 압력용기의 외관은 부식 및 변형 등이 없는가?"
      },
      {
        "id": "equipment-19-10",
        "category": "작업전점검",
        "text": "드레인밸브를 작동시켜 응축수를 배출하였는가?"
      },
      {
        "id": "equipment-19-11",
        "category": "작업전점검",
        "text": "연료, 윤활유등의 잔량 및 누유상태는 양호한가?"
      },
      {
        "id": "equipment-19-12",
        "category": "작업전점검",
        "text": "회전부의 덮개 또는 울의 상태는 양호한가?"
      },
      {
        "id": "equipment-19-13",
        "category": "작업전점검",
        "text": "공기호스는 근로자와 건설기계의 통행과 간섭이 발생하지\n않는가?"
      },
      {
        "id": "equipment-19-14",
        "category": "작업전점검",
        "text": "공기호스 외관은 피복이 벗겨지거나 훼손되지 않았는가?"
      },
      {
        "id": "equipment-19-15",
        "category": "작업전점검",
        "text": "공기호스 연결부는 탈락방지를 위한 와이어가 정상적으로\n고정되었는가?"
      },
      {
        "id": "equipment-19-16",
        "category": "작업전점검",
        "text": "각 연결부 볼트, 너트 등의 체결상태는 양호한가?"
      },
      {
        "id": "equipment-19-17",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-19-18",
        "category": "작동검사",
        "text": "호스 연결부위에서 압축공기가 누설되지 않는가?"
      },
      {
        "id": "equipment-19-19",
        "category": "작동검사",
        "text": "압력계는 정상범위에서 운전되는가?"
      },
      {
        "id": "equipment-19-20",
        "category": "작동검사",
        "text": "압력방출장치, 언로드밸브는 작동하는가?"
      },
      {
        "id": "equipment-19-21",
        "category": "작동검사",
        "text": "비상정지스위치는 정상 작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-20",
    "name": "준설선",
    "sourcePage": 25,
    "items": [
      {
        "id": "equipment-20-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가?(준설선)"
      },
      {
        "id": "equipment-20-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-20-03",
        "category": "기본사항",
        "text": "피난에 대한 예비선 동원계획은 수립되었는가?"
      },
      {
        "id": "equipment-20-04",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-20-05",
        "category": "기본사항",
        "text": "준설선 시동열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-20-06",
        "category": "기본사항",
        "text": "구명보트는 준비되어 있는가?"
      },
      {
        "id": "equipment-20-07",
        "category": "기본사항",
        "text": "전 탑승자는 구명조끼를 착용하고 있는가?"
      },
      {
        "id": "equipment-20-08",
        "category": "기본사항",
        "text": "구명환은 적재적소에 구비되어 있는가?"
      },
      {
        "id": "equipment-20-09",
        "category": "기본사항",
        "text": "타 작업선과의 연락체계는 구축되어 있는가?"
      },
      {
        "id": "equipment-20-10",
        "category": "기본사항",
        "text": "작업지휘자 선정 및 승선인원은 파악되었는가?"
      },
      {
        "id": "equipment-20-11",
        "category": "기본사항",
        "text": "응급처치용품은 구비되어 있는가?"
      },
      {
        "id": "equipment-20-12",
        "category": "기본사항",
        "text": "소화기는 각 위치에 비치되어 있고, 바늘은 녹색범위에\n있는가?"
      },
      {
        "id": "equipment-20-13",
        "category": "기본사항",
        "text": "파고와 바람 등 기상상황은 양호한가?"
      },
      {
        "id": "equipment-20-14",
        "category": "기본사항",
        "text": "선상에 작업표식을 게양하였는가?"
      },
      {
        "id": "equipment-20-15",
        "category": "기본사항",
        "text": "작업구간내 오염방지망, 오일펜스 등은 설치되었는가?"
      },
      {
        "id": "equipment-20-16",
        "category": "작업전점검",
        "text": "해상 충돌방지시설은 구비되어 있는가?"
      },
      {
        "id": "equipment-20-17",
        "category": "작업전점검",
        "text": "기어, 축, 벨트 등 각 회전부의 덮개는 양호한가?"
      },
      {
        "id": "equipment-20-18",
        "category": "작업전점검",
        "text": "각 기계부의 볼트, 너트 등의 체결은 양호한가?"
      },
      {
        "id": "equipment-20-19",
        "category": "작업전점검",
        "text": "엔진의 누유, 누수는 없는가?"
      },
      {
        "id": "equipment-20-20",
        "category": "작업전점검",
        "text": "이동식 크레인 또는 디퍼의 하부는 확실히 고정되었는가?\n(그래브 준설선, 디퍼준설선)"
      },
      {
        "id": "equipment-20-21",
        "category": "작업전점검",
        "text": "이동식 크레인 또는 디퍼는 일일점검을 실시하였는가? (그래브\n준설선, 디퍼준설선)"
      },
      {
        "id": "equipment-20-22",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-20-23",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동되는가?"
      },
      {
        "id": "equipment-20-24",
        "category": "작동검사",
        "text": "와이어로프, 체인 등의 상태는 양호한가?"
      },
      {
        "id": "equipment-20-25",
        "category": "작동검사",
        "text": "펌프 작동 시 이상소음 및 진동은 없는가? (펌프준설선)"
      },
      {
        "id": "equipment-20-26",
        "category": "작동검사",
        "text": "배수펌프의 작동은 양호한가?"
      },
      {
        "id": "equipment-20-27",
        "category": "작동검사",
        "text": "통신설비의 작동상태는 양호한가?"
      },
      {
        "id": "equipment-20-28",
        "category": "작동검사",
        "text": "조난신호, 자동발신기의 작동상태는 양호한가?"
      },
      {
        "id": "equipment-20-29",
        "category": "작동검사",
        "text": "탐조등의 작동상태는 양호한가?"
      }
    ]
  },
  {
    "id": "equipment-21",
    "name": "쇄석기",
    "sourcePage": 26,
    "items": [
      {
        "id": "equipment-21-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (쇄석기)"
      },
      {
        "id": "equipment-21-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-21-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-21-04",
        "category": "기본사항",
        "text": "쇄석기 시동열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-21-05",
        "category": "기본사항",
        "text": "지반은 평탄하고 단단한가?"
      },
      {
        "id": "equipment-21-06",
        "category": "기본사항",
        "text": "작업경계는 표시되어 있는가?"
      },
      {
        "id": "equipment-21-07",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-21-08",
        "category": "작업전점검",
        "text": "기어, 축, 벨트 등 각 회전부의 덮개는 양호한가?"
      },
      {
        "id": "equipment-21-09",
        "category": "작업전점검",
        "text": "각 기계부의 볼트, 너트 등의 체결은 양호한가?"
      },
      {
        "id": "equipment-21-10",
        "category": "작업전점검",
        "text": "엔진의 누유, 누수는 없는가?"
      },
      {
        "id": "equipment-21-11",
        "category": "작업전점검",
        "text": "벨트 컨베이어, 스크류 컨베이어 등의 보호커버의 부착상태는\n양호한가?"
      },
      {
        "id": "equipment-21-12",
        "category": "작업전점검",
        "text": "컨베이어의 벨트 또는 스크류는 찢어짐, 휨 등이 없는가?"
      },
      {
        "id": "equipment-21-13",
        "category": "작업전점검",
        "text": "벨트 컨베이어의 롤러는 훼손, 탈락, 이상마모가 없는가?"
      },
      {
        "id": "equipment-21-14",
        "category": "작업전점검",
        "text": "컨베이어 벨트의 장력은 적합한가?"
      },
      {
        "id": "equipment-21-15",
        "category": "작업전점검",
        "text": "컨베이어, 스크린 등에 운반물이 끼여있지 않는가?"
      },
      {
        "id": "equipment-21-16",
        "category": "작업전점검",
        "text": "본체, 컨베이어 감속기 등에서 누유가 발생하지 않는가?"
      },
      {
        "id": "equipment-21-17",
        "category": "작업전점검",
        "text": "스크린의 철판 또는 메시는 변형 또는 탈락이 없는가?"
      },
      {
        "id": "equipment-21-18",
        "category": "작업전점검",
        "text": "비상정지스위치, 컨베이어 급정지장치 등을 구비되어 있는가?"
      },
      {
        "id": "equipment-21-19",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-21-20",
        "category": "작동검사",
        "text": "엔진 시동 시 계기판은 정상적으로 작동되는가?"
      },
      {
        "id": "equipment-21-21",
        "category": "작동검사",
        "text": "벨트, 체인, 감속기 등의 작동상태는 양호한가?"
      },
      {
        "id": "equipment-21-22",
        "category": "작동검사",
        "text": "각 부 비상정지스위치는 정상작동하는가?"
      },
      {
        "id": "equipment-21-23",
        "category": "작동검사",
        "text": "벨트컨베이어의 급정지장치는 정상작동하는가?"
      },
      {
        "id": "equipment-21-24",
        "category": "작동검사",
        "text": "굴착기와 쇄석기는 작업 시 충돌하지 않는가?"
      }
    ]
  },
  {
    "id": "equipment-22",
    "name": "믹서트럭",
    "sourcePage": 27,
    "items": [
      {
        "id": "equipment-22-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (대형운전면허)"
      },
      {
        "id": "equipment-22-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-22-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-22-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-22-05",
        "category": "기본사항",
        "text": "콘크리트 믹서트럭 또는 콘크리트 펌프와 충돌을 방지하기\n위한 스토퍼는 구비되어 있고 충돌의 위험은 없는가?"
      },
      {
        "id": "equipment-22-06",
        "category": "기본사항",
        "text": "이동구간 내 전도, 전복, 추락 등의 위험은 없는가?"
      },
      {
        "id": "equipment-22-07",
        "category": "기본사항",
        "text": "작업구간은 평탄하고 차량이 안정되게 정차할 수 있는가?"
      },
      {
        "id": "equipment-22-08",
        "category": "기본사항",
        "text": "신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-22-09",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-22-10",
        "category": "작업전점검",
        "text": "콘크리트 반출슈트의 체결, 회전상태는 양호한가?"
      },
      {
        "id": "equipment-22-11",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가? (타이어마모, 손상, 펑크,\n볼트풀림 등)"
      },
      {
        "id": "equipment-22-12",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-22-13",
        "category": "작업전점검",
        "text": "판스프링의 탈락, 균열 등은 없는가?"
      },
      {
        "id": "equipment-22-14",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-22-15",
        "category": "작동검사",
        "text": "각 레버, 스위치, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-22-16",
        "category": "작동검사",
        "text": "전조등, 후미등, 방향지시등은 정상작동되는가?"
      },
      {
        "id": "equipment-22-17",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라가 정상작동 되는가?"
      },
      {
        "id": "equipment-22-18",
        "category": "작동검사",
        "text": "전후진, 조향 및 제동장치는 양호한가?"
      },
      {
        "id": "equipment-22-19",
        "category": "작동검사",
        "text": "비상정지장치는 정상작동되는가?"
      }
    ]
  },
  {
    "id": "equipment-23",
    "name": "덤프트럭",
    "sourcePage": 28,
    "items": [
      {
        "id": "equipment-23-01",
        "category": "기본사항",
        "text": "운전원의 자격여부는 적합한가? (대형운전면허)"
      },
      {
        "id": "equipment-23-02",
        "category": "기본사항",
        "text": "작업계획서는 승인받고 비치되어 있는가?"
      },
      {
        "id": "equipment-23-03",
        "category": "기본사항",
        "text": "소화기는 비치되어 있고, 바늘은 녹색범위에 있는가?"
      },
      {
        "id": "equipment-23-04",
        "category": "기본사항",
        "text": "차량 열쇠는 운전원만 소지하고 있는가?"
      },
      {
        "id": "equipment-23-05",
        "category": "기본사항",
        "text": "이동구간 내 전도, 전복, 추락 등의 위험은 없는가?"
      },
      {
        "id": "equipment-23-06",
        "category": "기본사항",
        "text": "작업구간은 평탄하고 차량이 안정되게 정차할 수 있는가?"
      },
      {
        "id": "equipment-23-07",
        "category": "기본사항",
        "text": "신호수(유도원)는 배치되었는가?"
      },
      {
        "id": "equipment-23-08",
        "category": "작업전점검",
        "text": "주요 구조부는 휨, 균열, 탈락, 부식 등이 없는가?"
      },
      {
        "id": "equipment-23-09",
        "category": "작업전점검",
        "text": "주행장치의 상태는 양호한가? (타이어마모, 손상, 펑크,\n볼트풀림 등)"
      },
      {
        "id": "equipment-23-10",
        "category": "작업전점검",
        "text": "냉각수 및 오일 류의 누설이 없는가?"
      },
      {
        "id": "equipment-23-11",
        "category": "작업전점검",
        "text": "판스프링의 탈락, 균열 등은 없는가?"
      },
      {
        "id": "equipment-23-12",
        "category": "작업전점검",
        "text": "적재함과 적재함 안전커버는 견고히 차량에 부착되어 있는가?"
      },
      {
        "id": "equipment-23-13",
        "category": "작동검사",
        "text": "엔진 시동 시 이상소음, 진동, 냄새 등이 없는가?"
      },
      {
        "id": "equipment-23-14",
        "category": "작동검사",
        "text": "각 레버, 스위치, 페달을 작동하여 이상이 없는가?"
      },
      {
        "id": "equipment-23-15",
        "category": "작동검사",
        "text": "전조등, 후미등, 방향지시등은 정상작동되는가?"
      },
      {
        "id": "equipment-23-16",
        "category": "작동검사",
        "text": "후진 시 경고음 및 후방카메라가 정상작동 되는가?"
      },
      {
        "id": "equipment-23-17",
        "category": "작동검사",
        "text": "전후진, 조향 및 제동장치는 양호한가?"
      },
      {
        "id": "equipment-23-18",
        "category": "작동검사",
        "text": "적재함과 안전커버는 정상적으로 위아래 작동되는가?"
      },
      {
        "id": "equipment-23-19",
        "category": "작동검사",
        "text": "하물 적재 시 낙하 등의 위험은 없는가?"
      }
    ]
  }
]
