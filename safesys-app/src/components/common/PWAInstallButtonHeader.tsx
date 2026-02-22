'use client'

import React, { useState, useEffect } from 'react'
import { Download } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed'
    platform: string
  }>
  prompt(): Promise<void>
}

const PWAInstallButtonHeader: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showInstallPrompt, setShowInstallPrompt] = useState(false)
  const [isInstallable, setIsInstallable] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    setMounted(true)
    // 이미 설치된 앱인지 확인
    const checkIfInstalled = () => {
      // PWA가 standalone 모드로 실행 중인지 확인
      if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsInstalled(true)
        return
      }

      // iOS Safari에서 홈 스크린에 추가되었는지 확인
      if ((window.navigator as any).standalone === true) {
        setIsInstalled(true)
        return
      }

      // 로컬 스토리지에서 설치 상태 확인
      const installStatus = localStorage.getItem('pwa-installed')
      if (installStatus === 'true') {
        setIsInstalled(true)
        return
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setIsInstallable(true)
      if (!isInstalled) {
        setShowInstallPrompt(true)
      }
    }

    const handleAppInstalled = () => {
      setDeferredPrompt(null)
      setIsInstallable(false)
      setShowInstallPrompt(false)
      setIsInstalled(true)
      localStorage.setItem('pwa-installed', 'true')
    }

    checkIfInstalled()

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [isInstalled])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return

    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      setDeferredPrompt(null)
      setIsInstallable(false)
      setShowInstallPrompt(false)
    }
  }

  // PWA 설치 조건을 만족하지 않아도 버튼 표시 (크롬의 엄격한 조건 우회)
  const shouldShowButton = mounted && typeof window !== 'undefined' && !isInstalled && !window.matchMedia('(display-mode: standalone)').matches

  const handleManualInstall = () => {
    if (deferredPrompt) {
      // 정상적인 설치 프롬프트가 있는 경우
      handleInstallClick()
    } else {
      // 수동 설치 안내
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      const isAndroidChrome = /Android/.test(navigator.userAgent) && /Chrome/.test(navigator.userAgent)

      if (isIOS) {
        alert('Safari에서 공유 버튼 → "홈 화면에 추가"를 선택하여 앱을 설치할 수 있습니다.')
      } else if (isAndroidChrome) {
        alert('크롬 메뉴(⋮) → "홈 화면에 추가" 또는 "앱 설치"를 선택하여 설치할 수 있습니다.')
      } else {
        alert('브라우저 메뉴에서 "앱 설치" 또는 "홈 화면에 추가" 옵션을 찾아 설치할 수 있습니다.')
      }
    }
  }

  const handleShareLink = async () => {
    const url = 'https://safesys.vercel.app/'
    try {
      if (navigator.share) {
        await navigator.share({ title: 'SafeSys', url })
      } else {
        await navigator.clipboard.writeText(url)
        alert('링크가 복사되었습니다!\n' + url)
      }
    } catch {
      try {
        await navigator.clipboard.writeText(url)
        alert('링크가 복사되었습니다!\n' + url)
      } catch {
        alert('링크: ' + url)
      }
    }
  }

  return (
    <div className="relative flex items-center gap-1">
      <button
        onClick={handleShareLink}
        className="flex items-center space-x-1 px-2 lg:px-3 py-2 text-xs lg:text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
        title="링크 공유하기"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        <span className="hidden sm:inline">공유</span>
      </button>
      {shouldShowButton && (
        <button
          onClick={handleManualInstall}
          className="flex items-center space-x-1 px-2 lg:px-3 py-2 text-xs lg:text-sm text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors group"
          title="앱 설치하기"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">설치</span>
        </button>
      )}
    </div>
  )
}

export default PWAInstallButtonHeader