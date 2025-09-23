import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const areaNo = searchParams.get('areaNo') || '';
    const time = searchParams.get('time');

    if (!time) {
      return NextResponse.json(
        { error: 'time 파라미터가 필요합니다. 형식: YYYY-MM-DD HH:mm' },
        { status: 400 }
      );
    }

    const apiKey = "ptN2Cl7gvmcWwHRgvN4UI4PF5sHIu6M1VuiDP9yvRJwRKBg8GCsFFTDtVBFtNzFQHlUWD7G4rSOtV3hTg3ny8w==";
    
    console.log('서버사이드 생활기상지수 API 호출:', { areaNo: areaNo || '전체지점', time });

    // 기상청 생활기상지수서비스 API 호출
    const url = `https://apis.data.go.kr/1360000/LivingWthrIdxServiceV4/getLifeWthrIdxV3`;
    const params = new URLSearchParams({
      serviceKey: apiKey,
      numOfRows: '50',
      pageNo: '1',
      dataType: 'JSON',
      areaNo: areaNo,
      time: time,
      requestCode: 'A48' // 건설현장
    });

    const response = await fetch(`${url}?${params}`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`기상청 API 호출 실패: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    console.log('기상청 API 응답 (처음 500자):', responseText.substring(0, 500));
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('JSON 파싱 오류:', parseError);
      console.error('응답 전체 내용:', responseText);
      return NextResponse.json({
        success: false,
        error: 'API 응답 파싱 실패',
        details: parseError instanceof Error ? parseError.message : String(parseError),
        rawResponse: responseText.substring(0, 1000)
      }, { status: 500 });
    }
    
    // API 응답 성공 여부 확인
    if (data.response?.header?.resultCode !== '00') {
      console.error(`생활기상지수 API 오류 - 코드: ${data.response?.header?.resultCode}`, 
                   `메시지: ${data.response?.header?.resultMsg}`);
      
      return NextResponse.json({
        success: false,
        error: `기상청 API 오류: ${data.response?.header?.resultMsg}`,
        resultCode: data.response?.header?.resultCode,
        rawResponse: data
      }, { status: 400 });
    }

    // 응답 데이터 반환
    const items = data.response?.body?.items?.item || [];
    console.log('생활기상지수 API 아이템 개수:', items.length);
    console.log('첫 번째 아이템:', items[0]);

    return NextResponse.json({
      success: true,
      resultCode: data.response.header.resultCode,
      resultMsg: data.response.header.resultMsg,
      totalCount: data.response?.body?.totalCount || 0,
      items: items,
      requestParams: {
        areaNo: areaNo || '전체지점',
        time: time,
        requestCode: 'A48'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('생활기상지수 API Route 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: '생활기상지수 조회 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { areaNo, time } = body;

    if (!time) {
      return NextResponse.json(
        { error: 'time 필드가 필요합니다.' },
        { status: 400 }
      );
    }

    // GET과 동일한 로직으로 처리
    const url = new URL(request.url);
    url.searchParams.set('areaNo', areaNo || '');
    url.searchParams.set('time', time);
    
    // GET 메서드로 재호출
    return GET(new NextRequest(url, { method: 'GET' }));

  } catch (error) {
    console.error('생활기상지수 POST API 오류:', error);
    
    return NextResponse.json({
      success: false,
      error: '요청 처리 중 오류가 발생했습니다.',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}