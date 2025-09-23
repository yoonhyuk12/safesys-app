'use client'

import { useEffect } from 'react'

const ServiceWorkerRegistration = () => {
  useEffect(() => {
    // 개발 모드에서는 SW 등록 비활성화 (번들 경로 충돌 방지)
    if (process.env.NODE_ENV !== 'production') {
      // 기존 등록된 SW가 있다면 해제 시도
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations?.().then((regs) => {
          regs.forEach((r) => r.unregister().catch(() => {}))
        }).catch(() => {})
      }
      return
    }

    if ('serviceWorker' in navigator) {
      const isSecure = window.location.protocol === 'https:'
      const isLocalhost = window.location.hostname === 'localhost'
      if (!(isSecure || isLocalhost)) return

      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .then((registration) => {
            console.log('SW registered: ', registration)
          })
          .catch((registrationError) => {
            console.log('SW registration failed: ', registrationError)
          })
      })
    }
  }, [])

  return null
}

export default ServiceWorkerRegistration