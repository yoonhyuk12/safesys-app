import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/contexts/AuthContext'
import SupabaseProvider from '@/providers/SupabaseProvider'
import ServiceWorkerRegistration from '@/components/common/ServiceWorkerRegistration'
import UpdateNotifier from '@/components/common/UpdateNotifier'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'KRC안전 - 안전관리 시스템',
  description: '스마트한 안전관리 솔루션으로 작업장의 안전을 지켜보세요',
  manifest: '/manifest.json',
  icons: {
    icon: '/shield.svg',
    apple: '/shield.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'KRC안전',
  },
  other: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#2563eb',
  colorScheme: 'light only',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="color-scheme" content="light only" />
        <script 
          type="text/javascript" 
          src="https://map.vworld.kr/js/vworldMapInit.js.do?apiKey=CE948BCA-7A65-3ED3-A1ED-F6D3F0F8B8BB&domain=localhost"
        />
        <script 
          type="text/javascript" 
          src="//dapi.kakao.com/v2/maps/sdk.js?appkey=b063321f61b035d423af3a02be79e6cf&libraries=services"
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ServiceWorkerRegistration />
        <UpdateNotifier />
        <SupabaseProvider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </SupabaseProvider>
      </body>
    </html>
  )
}
