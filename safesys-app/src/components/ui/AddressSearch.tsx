'use client'

import React, { useEffect } from 'react'
import { MapPin, Search } from 'lucide-react'

interface AddressSearchProps {
  onAddressSelect: (address: string, roadAddress: string) => void
  placeholder?: string
  disabled?: boolean
}

declare global {
  interface Window {
    daum: any
  }
}

const AddressSearch: React.FC<AddressSearchProps> = ({
  onAddressSelect,
  placeholder = "주소를 검색해주세요",
  disabled = false
}) => {
  useEffect(() => {
    // 카카오 주소 검색 스크립트 로드
    const script = document.createElement('script')
    script.src = '//t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
    script.async = true
    document.head.appendChild(script)

    return () => {
      // 컴포넌트 언마운트 시 스크립트 제거
      document.head.removeChild(script)
    }
  }, [])

  const handleAddressSearch = () => {
    if (disabled) return

    if (!window.daum) {
      alert('주소 검색 서비스를 불러오는 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }

    new window.daum.Postcode({
      oncomplete: function(data: any) {
        // 사용자가 선택한 주소 정보
        let addr = '' // 주소 변수
        let extraAddr = '' // 참고항목 변수

        // 사용자가 선택한 주소 타입에 따라 해당 주소 값을 가져온다.
        if (data.userSelectedType === 'R') { // 도로명 주소
          addr = data.roadAddress
        } else { // 지번 주소
          addr = data.jibunAddress
        }

        // 도로명 주소인 경우 참고항목을 조합한다.
        if(data.userSelectedType === 'R'){
          // 법정동명이 있을 경우 추가한다. (법정리는 제외)
          if(data.bname !== '' && /[동|로|가]$/g.test(data.bname)){
            extraAddr += data.bname
          }
          // 건물명이 있고, 공동주택일 경우 추가한다.
          if(data.buildingName !== '' && data.apartment === 'Y'){
            extraAddr += (extraAddr !== '' ? ', ' + data.buildingName : data.buildingName)
          }
          // 표시할 참고항목이 있을 경우, 괄호까지 추가한 최종 문자열을 만든다.
          if(extraAddr !== ''){
            extraAddr = ' (' + extraAddr + ')'
          }
        }

        // 선택된 주소를 부모 컴포넌트로 전달
        const fullAddress = addr + extraAddr
        onAddressSelect(fullAddress, data.roadAddress || data.jibunAddress)
      },
      theme: {
        bgColor: "#FFFFFF",
        searchBgColor: "#0B65C8",
        contentBgColor: "#FFFFFF",
        pageBgColor: "#FFFFFF",
        textColor: "#333333",
        queryTextColor: "#FFFFFF",
        postcodeTextColor: "#FA4256",
        emphTextColor: "#008BD3"
      },
      width: '100%',
      height: '100%'
    }).open()
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleAddressSearch}
        disabled={disabled}
        className="w-full flex items-center px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-left"
      >
        <MapPin className="h-5 w-5 text-gray-400 mr-2" />
        <span className="flex-1 text-sm text-gray-500">
          {placeholder}
        </span>
        <Search className="h-4 w-4 text-gray-400" />
      </button>
    </div>
  )
}

export default AddressSearch 