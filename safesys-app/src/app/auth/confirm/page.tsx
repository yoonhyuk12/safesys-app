'use client'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react'
import ShieldIcon from '@/components/ui/ShieldIcon'

function ConfirmContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const [countdown, setCountdown] = useState(5)

    const status = searchParams.get('status')
    const message = searchParams.get('message')

    // 성공 시 5초 후 자동 리다이렉트
    useEffect(() => {
        if (status === 'success') {
            const timer = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        clearInterval(timer)
                        router.push('/login')
                        return 0
                    }
                    return prev - 1
                })
            }, 1000)

            return () => clearInterval(timer)
        }
    }, [status, router])

    const getContent = () => {
        switch (status) {
            case 'success':
                return {
                    icon: <CheckCircle className="h-16 w-16 text-green-500" />,
                    title: '이메일 인증 완료',
                    description: '이메일 인증이 성공적으로 완료되었습니다.',
                    subDescription: `${countdown}초 후 로그인 페이지로 이동합니다.`,
                    bgColor: 'bg-green-50',
                    borderColor: 'border-green-200',
                    textColor: 'text-green-700',
                    showLoginButton: true,
                    showSignupButton: false,
                }

            case 'expired':
                return {
                    icon: <Clock className="h-16 w-16 text-amber-500" />,
                    title: '인증 링크 만료',
                    description: '인증 링크가 만료되었습니다.',
                    subDescription: '인증 링크는 24시간 동안만 유효합니다.\n다시 회원가입을 진행해주세요.',
                    bgColor: 'bg-amber-50',
                    borderColor: 'border-amber-200',
                    textColor: 'text-amber-700',
                    showLoginButton: false,
                    showSignupButton: true,
                }

            case 'error':
            default:
                return {
                    icon: <XCircle className="h-16 w-16 text-red-500" />,
                    title: '인증 실패',
                    description: message || '이메일 인증에 실패했습니다.',
                    subDescription: '문제가 지속되면 관리자에게 문의해주세요.',
                    bgColor: 'bg-red-50',
                    borderColor: 'border-red-200',
                    textColor: 'text-red-700',
                    showLoginButton: true,
                    showSignupButton: true,
                }
        }
    }

    const content = getContent()

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full">
                <div className="bg-white rounded-2xl shadow-xl px-8 py-10 space-y-6">
                    {/* 헤더 */}
                    <div>
                        <div className="flex justify-center">
                            <div className="bg-blue-100 rounded-full p-4">
                                <ShieldIcon />
                            </div>
                        </div>
                        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                            안전관리 시스템
                        </h2>
                    </div>

                    {/* 상태 표시 */}
                    <div className={`${content.bgColor} ${content.borderColor} border rounded-xl p-6 text-center`}>
                        <div className="flex justify-center mb-4">
                            {content.icon}
                        </div>
                        <h3 className={`text-xl font-bold ${content.textColor} mb-2`}>
                            {content.title}
                        </h3>
                        <p className={`${content.textColor} mb-2`}>
                            {content.description}
                        </p>
                        <p className={`${content.textColor} text-sm whitespace-pre-line`}>
                            {content.subDescription}
                        </p>
                    </div>

                    {/* 버튼 */}
                    <div className="space-y-3">
                        {content.showLoginButton && (
                            <button
                                onClick={() => router.push('/login')}
                                className="w-full flex justify-center items-center gap-2 py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shadow-lg hover:shadow-xl"
                            >
                                로그인 페이지로 이동
                            </button>
                        )}

                        {content.showSignupButton && (
                            <button
                                onClick={() => router.push('/signup/terms')}
                                className={`w-full flex justify-center items-center gap-2 py-3 px-4 border text-sm font-medium rounded-lg transition-colors ${content.showLoginButton
                                        ? 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                                        : 'border-transparent text-white bg-blue-600 hover:bg-blue-700 shadow-lg hover:shadow-xl'
                                    }`}
                            >
                                <RefreshCw className="h-4 w-4" />
                                다시 회원가입하기
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default function AuthConfirmPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-100 to-indigo-200">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        }>
            <ConfirmContent />
        </Suspense>
    )
}
