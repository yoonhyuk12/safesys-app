import { NextRequest, NextResponse } from 'next/server'

async function tryVworldAPI(address: string, vworldApiKey: string): Promise<{lat: number, lng: number} | null> {
  try {
    const baseUrl = 'https://api.vworld.kr/req/address'
    const encodedAddress = encodeURIComponent(address)
    
    const apiUrl = `${baseUrl}?service=address&request=getCoord&format=json&crs=EPSG:4326&key=${vworldApiKey}&type=road&address=${encodedAddress}`

    console.log('V-world API 호출:', apiUrl)
    console.log('시도 주소:', address)
    
    const response = await fetch(apiUrl)
    
    if (!response.ok) {
      throw new Error(`V-world API 호출 실패: ${response.status}`)
    }

    const data = await response.json()
    console.log('V-world API 응답:', JSON.stringify(data, null, 2))
    
    if (data.response && data.response.status === 'OK' && data.response.result && data.response.result.point) {
      const point = data.response.result.point
      const coords = {
        lat: parseFloat(point.y),
        lng: parseFloat(point.x)
      }
      
      console.log('V-world 주소 변환 성공:', { address, coords })
      return coords
    } else {
      console.log('V-world API 결과 없음:', data.response?.status || 'Unknown status')
      return null
    }

  } catch (error) {
    console.error('V-world API 오류:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const address = searchParams.get('address')
    
    if (!address) {
      return NextResponse.json(
        { error: '주소 파라미터가 필요합니다.' },
        { status: 400 }
      )
    }

    const vworldApiKey = 'CE948BCA-7A65-3ED3-A1ED-F6D3F0F8B8BB'
    
    // 1차 시도: 원본 주소
    console.log('=== V-world API 주소 변환 시도 ===')
    let result = await tryVworldAPI(address, vworldApiKey)
    if (result) {
      return NextResponse.json({ success: true, coords: result })
    }

    // 2차 시도: 번지 제거
    const addressWithoutNumber = address.replace(/\s+\d+(-\d+)*$/, '').trim()
    if (addressWithoutNumber !== address) {
      console.log('2차 시도: 번지 제거')
      result = await tryVworldAPI(addressWithoutNumber, vworldApiKey)
      if (result) {
        return NextResponse.json({ success: true, coords: result })
      }
    }

    // 3차 시도: 동/리 제거
    const addressWithoutDongRi = address.replace(/\s+(동|리)(\s+|$)/, ' ').replace(/\s+\d+(-\d+)*$/, '').trim()
    if (addressWithoutDongRi !== address && addressWithoutDongRi !== addressWithoutNumber) {
      console.log('3차 시도: 동/리 제거')
      result = await tryVworldAPI(addressWithoutDongRi, vworldApiKey)
      if (result) {
        return NextResponse.json({ success: true, coords: result })
      }
    }

    // 4차 시도: 시/군 단위만
    const cityOnly = address.split(' ').slice(0, 2).join(' ')
    if (cityOnly !== address) {
      console.log('4차 시도: 시/군 단위만')
      result = await tryVworldAPI(cityOnly, vworldApiKey)
      if (result) {
        return NextResponse.json({ success: true, coords: result })
      }
    }

    console.log('모든 V-world API 시도 실패')
    return NextResponse.json({ 
      success: false, 
      error: 'V-world API에서 결과를 찾을 수 없습니다.',
      attempts: [address, addressWithoutNumber, addressWithoutDongRi, cityOnly].filter((addr, index, arr) => arr.indexOf(addr) === index)
    })

  } catch (error) {
    console.error('V-world API 서버 오류:', error)
    return NextResponse.json(
      { success: false, error: 'V-world API 호출 중 오류가 발생했습니다.' },
      { status: 500 }
    )
  }
} 