'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MapPin, Search, X } from 'lucide-react'

interface AddressResult {
  address: string
  roadAddress: string
  coords?: {
    lat: number
    lng: number
  }
}

interface VworldAddressSearchProps {
  onAddressSelect: (address: string, roadAddress: string, coords?: {lat: number, lng: number}) => void
  placeholder?: string
  disabled?: boolean
  value?: string
}

const VworldAddressSearch: React.FC<VworldAddressSearchProps> = ({
  onAddressSelect,
  placeholder = "주소를 검색해주세요",
  disabled = false,
  value = ""
}) => {
  const [searchTerm, setSearchTerm] = useState(value)
  const [searchResults, setSearchResults] = useState<AddressResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [isAddressSelected, setIsAddressSelected] = useState(false) // 주소 선택 상태 추가
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)

  // value prop이 변경될 때 searchTerm 업데이트 (주소 선택 중이 아닐 때만)
  useEffect(() => {
    // 주소가 이미 선택된 상태에서 외부 value가 변경되더라도 무시
    if (!isAddressSelected) {
      setSearchTerm(value)
    }
  }, [value, isAddressSelected])

  // 검색어 변경 시 자동 검색 (디바운싱)
  useEffect(() => {
    if (searchTerm.trim().length < 2 || isAddressSelected) {
      setSearchResults([])
      setShowResults(false)
      return
    }

    // 이전 타이머 클리어
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    // 500ms 후 검색 실행
    searchTimeoutRef.current = setTimeout(() => {
      performSearch(searchTerm.trim())
    }, 500)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchTerm, isAddressSelected])

  // 외부 클릭 시 결과 숨기기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (resultsRef.current && !resultsRef.current.contains(event.target as Node)) {
        setShowResults(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const performSearch = async (query: string) => {
    if (!query || query.length < 2) return

    setIsLoading(true)
    try {
      console.log('주소 검색 시작:', query)
      
      const apiKey = '2D3F686F-8FE7-39F4-95AC-2C8E1DD0482A'
      
      // jQuery AJAX JSONP 방식으로 CORS 우회 (샘플 코드와 동일한 방식)
      const searchWithJsonp = (searchQuery: string) => {
        return new Promise<any>((resolve, reject) => {
          // jQuery가 없는 경우를 위한 동적 로딩
          if (typeof (window as any).$ === 'undefined') {
            const script = document.createElement('script')
            script.src = 'https://code.jquery.com/jquery-3.6.0.min.js'
            script.onload = () => performAjaxCall()
            script.onerror = () => reject(new Error('jQuery 로딩 실패'))
            document.head.appendChild(script)
          } else {
            performAjaxCall()
          }
          
          function performAjaxCall() {
            const $ = (window as any).$
            
            // V-world API 검색 서비스 파라미터 (공식 문서 기준)
            const formData = {
              service: 'search',
              request: 'search',
              version: '2.0',
              crs: 'EPSG:4326',
              size: 10,
              page: 1,
              query: searchQuery,
              type: 'PLACE',
              category: 'L4L',
              format: 'json',
              errorformat: 'json',
              key: apiKey
            }
            
            console.log('전송할 데이터:', formData)
            
            // 지번주소 검색 시도
            $.ajax({
              type: "get",
              url: "https://map.vworld.kr/search.do",
              data: {
                category: 'jibun',
                q: searchQuery,
                pageUnit: 10,
                output: 'json',
                pageIndex: 1,
                apiKey: apiKey
              },
              dataType: 'jsonp',
              async: false,
              success: function(data: any) {
                console.log('지번주소 검색 성공:', data)
                if (data.Jibun && data.Jibun > 0) {
                  resolve({ type: 'jibun', data: data })
                } else {
                  // 지번주소 검색 실패 시 도로명주소 검색 시도
                  $.ajax({
                    type: "get",
                    url: "https://map.vworld.kr/search.do",
                    data: {
                      category: 'juso',
                      q: searchQuery,
                      pageUnit: 10,
                      output: 'json',
                      pageIndex: 1,
                      apiKey: apiKey
                    },
                    dataType: 'jsonp',
                    async: false,
                    success: function(data2: any) {
                      console.log('도로명주소 검색 성공:', data2)
                      if (data2.Juso && data2.Juso > 0) {
                        resolve({ type: 'juso', data: data2 })
                      } else {
                        // 마지막으로 POI 검색 시도
                        $.ajax({
                          type: "get",
                          url: "https://map.vworld.kr/search.do",
                          data: {
                            category: 'poi',
                            q: searchQuery,
                            pageUnit: 10,
                            output: 'json',
                            pageIndex: 1,
                            apiKey: apiKey
                          },
                          dataType: 'jsonp',
                          async: false,
                          success: function(data3: any) {
                            console.log('POI 검색 성공:', data3)
                            resolve({ type: 'poi', data: data3 })
                          },
                          error: function(xhr: any, stat: any, err: any) {
                            reject(new Error(`POI 검색 오류: ${stat} - ${err}`))
                          }
                        })
                      }
                    },
                    error: function(xhr: any, stat: any, err: any) {
                      reject(new Error(`도로명주소 검색 오류: ${stat} - ${err}`))
                    }
                  })
                }
              },
              error: function(xhr: any, stat: any, err: any) {
                console.log('지번주소 검색 오류:', stat, err)
                reject(new Error(`지번주소 검색 오류: ${stat} - ${err}`))
              }
            })
          }
        })
      }
      
      // 검색 실행
      const response = await searchWithJsonp(query)
      
      console.log('최종 응답:', response)
      
      let results: AddressResult[] = []
      
      if (response.type === 'jibun' && response.data.Jibun > 0) {
        // 지번주소 결과 처리
        const items = response.data.LIST || []
        results = items.map((item: any) => ({
          address: item.JUSO || '',
          roadAddress: item.JUSO || '',
          coords: {
            lat: parseFloat(item.ypos),
            lng: parseFloat(item.xpos)
          }
        })).filter((result: AddressResult) => result.address.trim() !== '')
        
      } else if (response.type === 'juso' && response.data.Juso > 0) {
        // 도로명주소 결과 처리
        const items = response.data.LIST || []
        results = items.map((item: any) => ({
          address: item.JUSO || '',
          roadAddress: item.JUSO || '',
          coords: {
            lat: parseFloat(item.ypos),
            lng: parseFloat(item.xpos)
          }
        })).filter((result: AddressResult) => result.address.trim() !== '')
        
      } else if (response.type === 'poi' && response.data.Poi > 0) {
        // POI 결과 처리
        const items = response.data.LIST || []
        results = items.map((item: any) => ({
          address: item.nameFull || item.nameDp || '',
          roadAddress: item.juso || item.nameFull || item.nameDp || '',
          coords: {
            lat: parseFloat(item.ypos),
            lng: parseFloat(item.xpos)
          }
        })).filter((result: AddressResult) => result.address.trim() !== '')
      }
      
      if (results.length > 0) {
        console.log('검색 결과 성공:', results)
        setSearchResults(results)
        setShowResults(true)
      } else {
        console.log('검색 결과 없음')
        setSearchResults([])
        setShowResults(false)
      }
      
    } catch (error) {
      console.error('주소 검색 오류:', error)
      setSearchResults([])
      setShowResults(false)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddressSelect = (result: AddressResult) => {
    setSearchTerm(result.address)
    setShowResults(false)
    setIsAddressSelected(true) // 주소 선택 상태로 변경
    
    // 타이머가 있으면 취소 (검색 방지)
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
      searchTimeoutRef.current = null
    }
    
    onAddressSelect(result.address, result.roadAddress, result.coords)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    console.log('VworldAddressSearch - 입력 변경:', newValue)
    setSearchTerm(newValue)
    setIsAddressSelected(false) // 사용자가 직접 입력할 때는 선택 상태 해제
  }

  const handleClear = () => {
    console.log('VworldAddressSearch - 입력 초기화')
    setSearchTerm('')
    setSearchResults([])
    setShowResults(false)
    setIsAddressSelected(false) // 초기화할 때 선택 상태도 해제
  }

  const handleInputFocus = () => {
    console.log('VworldAddressSearch - 입력창 포커스')
    if (searchTerm.trim().length >= 2 && searchResults.length > 0 && !isAddressSelected) {
      setShowResults(true)
    }
  }

  const handleInputClick = () => {
    console.log('VworldAddressSearch - 입력창 클릭')
    if (searchTerm.trim().length >= 2 && searchResults.length > 0 && !isAddressSelected) {
      setShowResults(true)
    }
  }

  return (
    <div className="relative" ref={resultsRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <MapPin className="h-5 w-5 text-gray-400" />
        </div>
        
        <input
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={handleInputFocus}
          onClick={handleInputClick}
          className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        
        <div className="absolute inset-y-0 right-0 flex items-center">
          {isLoading && (
            <div className="pr-3">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}
          
          {searchTerm && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              className="pr-3 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 검색 결과 */}
      {showResults && searchResults.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {searchResults.map((result, index) => (
            <div
              key={index}
              onClick={() => handleAddressSelect(result)}
              className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
            >
              <div className="flex items-start space-x-3">
                <MapPin className="h-4 w-4 text-gray-400 mt-1 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {result.roadAddress}
                  </p>
                  {result.address !== result.roadAddress && (
                    <p className="text-xs text-gray-500 truncate mt-1">
                      {result.address}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 검색 결과 없음 */}
      {showResults && searchResults.length === 0 && !isLoading && searchTerm.length >= 2 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          <div className="px-4 py-3 text-sm text-gray-500 text-center">
            검색 결과가 없습니다.
          </div>
        </div>
      )}
    </div>
  )
}

export default VworldAddressSearch 