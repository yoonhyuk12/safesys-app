import React from 'react'

const LoadingSpinner: React.FC = () => {
  return (
    <div className="flex flex-col items-center">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-200 border-t-blue-500"></div>
      <p className="mt-4 text-gray-400">로딩 중...</p>
    </div>
  )
}

export default LoadingSpinner 