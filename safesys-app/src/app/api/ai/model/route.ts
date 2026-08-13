// 화면 라벨이 관리자 설정과 같은 모델명을 표시하도록 기능 키별 현재 AI 모델명을 조회하는 API 라우트
import { NextRequest, NextResponse } from 'next/server'
import { DEFAULT_AI_MODELS, getAiModel, type AiFeatureKey } from '@/lib/ai-models'

const FEATURE_KEYS: readonly string[] = DEFAULT_AI_MODELS.map((entry) => entry.featureKey)

function isFeatureKey(value: string | null): value is AiFeatureKey {
  return value !== null && FEATURE_KEYS.includes(value)
}

export async function GET(request: NextRequest) {
  const feature = request.nextUrl.searchParams.get('feature')

  if (!isFeatureKey(feature)) {
    return NextResponse.json(
      { success: false, error: '알 수 없는 AI 기능 키입니다.' },
      { status: 400 }
    )
  }

  try {
    // getAiModel이 60초 캐시를 갖고 있어 별도 캐시는 두지 않는다.
    const model = await getAiModel(feature)
    return NextResponse.json({ success: true, feature, model })
  } catch (error) {
    console.error('AI 모델명 조회 실패:', error)
    return NextResponse.json(
      { success: false, error: 'AI 모델명 조회에 실패했습니다.' },
      { status: 500 }
    )
  }
}
