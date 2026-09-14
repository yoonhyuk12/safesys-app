// 장비 안내 도해 — 작성 폼과 상세가 함께 쓰는 원본 비율 유지 이미지 묶음이다.

import { equipmentGuideImages } from '@/lib/equipment-inspection-guides'

interface EquipmentGuideImagesProps {
  /** 카탈로그 장비 ID(제출 기록에서는 equipment_type). */
  equipmentId: string | null | undefined
  /** 대체 텍스트에 쓰는 장비 이름. */
  equipmentName: string
}

/** 안내 도해가 없는 장비(준설선·쇄석기)와 알 수 없는 ID에서는 아무것도 그리지 않는다. */
export default function EquipmentGuideImages({ equipmentId, equipmentName }: EquipmentGuideImagesProps) {
  const images = equipmentGuideImages(equipmentId)
  if (images.length === 0) return null

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-200 px-3 py-2">
        <h3 className="text-sm font-medium text-gray-700">
          {equipmentName} 주요 부위 <span className="text-gray-500">(원본 점검표 안내 그림)</span>
        </h3>
      </div>
      {/* 좁은 화면에서는 한 장씩 세로로 쌓고, 넓어지면 덤프트럭의 두 장을 나란히 둔다. */}
      <div className={`p-3 grid grid-cols-1 gap-3 ${images.length > 1 ? 'sm:grid-cols-2' : ''}`}>
        {images.map((image, index) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={image.src}
            src={image.src}
            width={image.width}
            height={image.height}
            alt={`${equipmentName} 안내 그림 ${index + 1}`}
            // 원본 비율 그대로 칸 너비에 맞추되 원본 픽셀 폭을 넘겨 늘리지 않는다 —
            // 확대하면 라벨이 뭉개지고 세로가 커져 점검 항목이 화면 아래로 밀린다.
            style={{ maxWidth: image.width }}
            className="mx-auto w-full h-auto object-contain rounded-md border border-gray-200 bg-white"
          />
        ))}
      </div>
    </div>
  )
}
