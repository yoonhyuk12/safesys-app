'use client'

import { useEffect, useState } from 'react'

export default function UpdateNotifier() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        // 새로운 Service Worker가 활성화됨
        setShowUpdatePrompt(true)
      })

      navigator.serviceWorker.ready.then((registration) => {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // 새 버전이 설치되었지만 이전 버전이 아직 실행 중
                setShowUpdatePrompt(true)
              }
            })
          }
        })
      })
    }

    // 페이지 포커스 시 새로고침 체크 비활성화 (불필요한 페이지 리로딩 방지)
    // const handleFocus = () => {
    //   const lastCheck = localStorage.getItem('lastUpdateCheck')
    //   const now = Date.now()
    //   
    //   // 5분마다 체크 (개발 중에는 더 자주)
    //   if (!lastCheck || now - parseInt(lastCheck) > 5 * 60 * 1000) {
    //     // 실제 운영환경에서는 서버에서 버전 정보를 가져와 비교할 수 있음
    //     const shouldUpdate = Math.random() < 0.1 // 10% 확률로 업데이트 알림 (테스트용)
    //     if (shouldUpdate) {
    //       setShowUpdatePrompt(true)
    //     }
    //     localStorage.setItem('lastUpdateCheck', now.toString())
    //   }
    // }

    // window.addEventListener('focus', handleFocus)
    // handleFocus() // 초기 체크

    // return () => {
    //   window.removeEventListener('focus', handleFocus)
    // }
  }, [])

  const handleUpdate = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          registration.unregister()
        })
      })
    }
    
    // 캐시 클리어
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          caches.delete(name)
        })
      })
    }
    
    // 강제 새로고침
    window.location.reload()
  }

  const handleDismiss = () => {
    setShowUpdatePrompt(false)
  }

  if (!showUpdatePrompt) return null

  return (
    <div className="fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm">
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold">새 버전 사용 가능</h3>
        <p className="text-sm">
          SafeSys가 업데이트되었습니다. 새로고침하여 최신 버전을 사용하세요.
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleUpdate}
            className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100"
          >
            새로고침
          </button>
          <button
            onClick={handleDismiss}
            className="bg-blue-700 text-white px-3 py-1 rounded text-sm hover:bg-blue-800"
          >
            나중에
          </button>
        </div>
      </div>
    </div>
  )
}