'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

interface DocumentFolderProps {
  title: string
  year?: string
  isActive?: boolean
  onClick?: () => void
  projectId?: string
  externalUrl?: string
  projectName?: string
  managingBranch?: string
  isProjectActive?: boolean
}

const DocumentFolder: React.FC<DocumentFolderProps> = ({
  title,
  year = '2025',
  isActive = false,
  onClick,
  projectId,
  externalUrl,
  projectName,
  managingBranch,
  isProjectActive = true
}) => {
  const router = useRouter()

  const handleClick = () => {
    // 폭염대비점검이나 TBM 관련 문서철이고 프로젝트가 비활성 상태인 경우
    if ((title === '폭염대비점검' || title.includes('TBM')) && !isProjectActive) {
      alert('공사중지 상태에서는 사용할 수 없습니다.')
      return
    }
    
    if (title === '폭염대비점검' && projectId) {
      router.push(`/project/${projectId}/heatwave`)
    } else if (title === '관리자 일상점검') {
      // 관리자 일상점검은 onClick 핸들러를 통해 처리
      if (onClick) {
        onClick()
      }
    } else if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer')
    } else if (onClick) {
      onClick()
    }
  }

  // 관리자 일상점검과 본부 불시점검 문서철의 특별한 색상 정의
  const isManagerInspection = title === '관리자 일상점검'
  const isHeadquartersInspection = title === '본부 불시점검'
  const isSpecialInspection = isManagerInspection || isHeadquartersInspection
  const isDisabled = (title === '폭염대비점검' || title.includes('TBM')) && !isProjectActive
  
  let folderBgColor, folderTabColor
  if (isDisabled) {
    folderBgColor = 'bg-gray-200'
    folderTabColor = 'bg-gray-300'
  } else if (isSpecialInspection) {
    folderBgColor = 'bg-sky-300'
    folderTabColor = 'bg-sky-400'
  } else {
    folderBgColor = 'bg-yellow-100'
    folderTabColor = 'bg-yellow-200'
  }

  return (
    <div 
      className={`
        relative w-20 h-56 lg:w-25 lg:h-96 transition-all duration-200 
        ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:scale-105'}
        ${isActive ? 'z-10' : 'z-0'}
      `}
      onClick={handleClick}
    >
      {/* 문서철 본체 */}
      <div className={`
        w-full h-full border-2 ${isDisabled ? 'border-gray-300' : 'border-gray-400'} ${folderBgColor} relative
        ${isActive ? 'shadow-lg border-blue-500' : isDisabled ? 'shadow-sm' : 'shadow-md hover:shadow-lg'}
      `}
      style={isSpecialInspection && !isDisabled ? { backgroundColor: 'rgb(88, 190, 213)' } : {}}
      >
        {/* 문서철 상단 탭 */}
        <div 
          className={`absolute -top-2 lg:-top-3 left-0 right-0 h-4 lg:h-6 ${folderTabColor} border-2 ${isDisabled ? 'border-gray-300' : 'border-gray-400'} border-b-0 rounded-t-sm`}
          style={isSpecialInspection && !isDisabled ? { backgroundColor: 'rgb(68, 170, 193)' } : {}}
        ></div>
        
        {/* 문서철 내용 */}
        <div className="flex flex-col h-full p-2 lg:p-4 justify-between">
          {/* 제목 */}
          <div className="flex-1 flex items-center justify-center overflow-hidden">
            <div className="bg-white border border-gray-200 rounded-sm p-1 m-1 w-full h-full flex items-center justify-center">
              <div className="flex justify-center items-center h-full w-full">
                {title && (() => {
                  // 줄바꿈이 있는 경우 처리
                  const lines = title.split('\n')
                  
                  // 줄바꿈이 있는 경우 각 줄을 세로로 나열
                  if (lines.length > 1) {
                    return (
                      <div className="flex flex-col items-center justify-center space-y-1 h-full">
                        {lines.map((line, lineIndex) => (
                          <div key={lineIndex} className="flex flex-col items-center justify-center">
                            {line.split('').map((char, charIndex) => (
                              <div key={`${lineIndex}-${charIndex}`} className={`text-xs lg:text-sm font-medium ${isDisabled ? 'text-gray-500' : 'text-gray-800'} h-3 lg:h-4 flex items-center justify-center mb-0.5 lg:mb-1`}>
                                {char}
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  }
                  
                  // 줄바꿈이 없는 경우 기존 로직 사용
                  const chars = title.split('')
                  // 문서철 높이를 고려하여 한 열에 들어갈 수 있는 최대 글자 수 (대략 12-13글자)
                  const maxSingleColumnChars = 12
                  
                  // 글자 수가 적으면 1열로, 많으면 2열로 표시
                  if (chars.length <= maxSingleColumnChars) {
                    // 1열 표시
                    return (
                      <div className="flex flex-col items-center justify-center h-full">
                        {chars.map((char, index) => (
                          <div key={index} className={`text-xs lg:text-sm font-medium ${isDisabled ? 'text-gray-500' : 'text-gray-800'} h-3 lg:h-4 flex items-center justify-center mb-0.5 lg:mb-1`}>
                            {char}
                          </div>
                        ))}
                      </div>
                    )
                  } else {
                    // 2열 표시
                    const midPoint = Math.ceil(chars.length / 2)
                    const firstColumn = chars.slice(0, midPoint)
                    const secondColumn = chars.slice(midPoint)
                    
                    return (
                      <div className="flex space-x-1 items-center justify-center h-full">
                        {/* 첫 번째 열 */}
                        <div className="flex flex-col items-center justify-center">
                          {firstColumn.map((char, index) => (
                            <div key={`first-${index}`} className={`text-xs lg:text-sm font-medium ${isDisabled ? 'text-gray-500' : 'text-gray-800'} h-3 lg:h-4 flex items-center justify-center mb-0.5 lg:mb-1`}>
                              {char}
                            </div>
                          ))}
                        </div>
                        {/* 두 번째 열 */}
                        <div className="flex flex-col items-center justify-center">
                          {secondColumn.map((char, index) => (
                            <div key={`second-${index}`} className={`text-xs lg:text-sm font-medium ${isDisabled ? 'text-gray-500' : 'text-gray-800'} h-3 lg:h-4 flex items-center justify-center mb-0.5 lg:mb-1`}>
                              {char}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }
                })()}
              </div>
            </div>
          </div>
          
          {/* 하단 년도 */}
          <div className="border-t border-gray-300 pt-2 lg:pt-3 mt-2 lg:mt-3">
            <div className="text-center text-xs lg:text-sm text-gray-600 font-medium">
              {year}
            </div>
            <div className="text-center text-xs lg:text-sm text-gray-400 mt-1 lg:mt-2">
              안전관리
            </div>
          </div>
        </div>
        
        {/* 문서철 측면 효과 */}
        <div className={`absolute -right-1 lg:-right-2 top-1 lg:top-2 bottom-1 lg:bottom-2 w-2 lg:w-3 bg-gray-200 border-r ${isDisabled ? 'border-gray-300' : 'border-gray-400'}`}></div>
        
        {/* 비활성화 라벨 */}
        {isDisabled && (
          <div className="absolute bottom-2 left-0 right-0 flex justify-center">
            <div className="bg-red-500 text-white text-xs px-2 py-1 rounded-sm font-medium">
              사용불가
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DocumentFolder 