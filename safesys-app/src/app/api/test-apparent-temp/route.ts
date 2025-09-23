import { NextRequest, NextResponse } from 'next/server';
import { getEnhancedApparentTemperature } from '@/lib/weather';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = searchParams.get('lat');
    const lng = searchParams.get('lng');
    const areaNo = searchParams.get('areaNo');

    if (!lat || !lng) {
      return NextResponse.json(
        { error: '위도(lat)와 경도(lng) 파라미터가 필요합니다. 예: /api/test-apparent-temp?lat=37.5665&lng=126.9780' },
        { status: 400 }
      );
    }

    const latitude = parseFloat(lat);
    const longitude = parseFloat(lng);

    if (isNaN(latitude) || isNaN(longitude)) {
      return NextResponse.json(
        { error: '위도와 경도는 숫자여야 합니다.' },
        { status: 400 }
      );
    }

    console.log('체감온도 테스트 API 호출:', { lat: latitude, lng: longitude, areaNo });

    // 새로운 향상된 체감온도 API 테스트
    const startTime = Date.now();
    const temperature = await getEnhancedApparentTemperature(latitude, longitude, areaNo || undefined);
    const endTime = Date.now();
    
    const responseData = {
      success: true,
      coordinates: {
        lat: latitude,
        lng: longitude
      },
      areaNo: areaNo || '전체지점',
      apparentTemperature: temperature,
      responseTime: `${endTime - startTime}ms`,
      timestamp: new Date().toISOString(),
      apiMethod: '기상청 단기예보 API (VilageFcstInfoService_2.0)'
    };

    console.log('체감온도 테스트 결과:', responseData);

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('체감온도 테스트 API 오류:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: '체감온도 조회 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lng, areaNo } = body;

    if (!lat || !lng) {
      return NextResponse.json(
        { error: '위도(lat)와 경도(lng)가 필요합니다.' },
        { status: 400 }
      );
    }

    console.log('체감온도 테스트 POST 요청:', { lat, lng, areaNo });

    const startTime = Date.now();
    const temperature = await getEnhancedApparentTemperature(lat, lng, areaNo);
    const endTime = Date.now();
    
    const responseData = {
      success: true,
      coordinates: { lat, lng },
      areaNo: areaNo || '전체지점',
      apparentTemperature: temperature,
      responseTime: `${endTime - startTime}ms`,
      timestamp: new Date().toISOString(),
      apiMethod: '기상청 단기예보 API (VilageFcstInfoService_2.0)'
    };

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('체감온도 테스트 POST API 오류:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: '체감온도 조회 중 오류가 발생했습니다.',
        details: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}