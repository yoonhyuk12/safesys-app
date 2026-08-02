'use client'

// 관리자 아이디 확인 후 메일 인증번호로 로그인하는 2단계 화면
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const RESEND_COOLDOWN_SECONDS = 60

interface SendResponse {
  success?: boolean
  error?: string
  maskedEmail?: string
}

interface VerifyResponse {
  success?: boolean
  error?: string
  session?: {
    access_token: string
    refresh_token: string
  }
}

export default function AdminLoginPage() {
  const router = useRouter()
  const [step, setStep] = useState<'id' | 'otp'>('id')
  const [loginId, setLoginId] = useState('')
  const [maskedEmail, setMaskedEmail] = useState('')
  const [token, setToken] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return

    const timer = window.setTimeout(() => {
      setCooldown((current) => Math.max(0, current - 1))
    }, 1000)

    return () => window.clearTimeout(timer)
  }, [cooldown])

  const sendOtp = async (isResend = false) => {
    const normalizedId = loginId.trim()
    if (!normalizedId) {
      setErrorMessage('관리자 아이디를 입력해 주세요.')
      return
    }

    setSending(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/admin/otp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: normalizedId }),
      })
      const result = (await response.json()) as SendResponse
      if (!response.ok || !result.success) {
        setErrorMessage(result.error || '인증번호를 발송하지 못했습니다.')
        return
      }

      setMaskedEmail(result.maskedEmail || '')
      setToken('')
      setStep('otp')
      setCooldown(RESEND_COOLDOWN_SECONDS)
    } catch {
      setErrorMessage(
        isResend
          ? '인증번호를 다시 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.'
          : '인증번호를 발송하지 못했습니다. 잠시 후 다시 시도해 주세요.'
      )
    } finally {
      setSending(false)
    }
  }

  const verifyOtp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!/^\d{6}$/.test(token)) {
      setErrorMessage('6자리 인증번호를 입력해 주세요.')
      return
    }

    setVerifying(true)
    setErrorMessage('')

    try {
      const response = await fetch('/api/admin/otp/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: loginId.trim(), token }),
      })
      const result = (await response.json()) as VerifyResponse
      if (!response.ok || !result.success || !result.session) {
        setErrorMessage(result.error || '인증번호가 올바르지 않거나 만료되었습니다.')
        return
      }

      const { error } = await supabase.auth.setSession({
        access_token: result.session.access_token,
        refresh_token: result.session.refresh_token,
      })
      if (error) {
        setErrorMessage('로그인 세션을 설정하지 못했습니다. 다시 시도해 주세요.')
        return
      }

      router.replace('/admin')
    } catch {
      setErrorMessage('인증 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 flex items-center justify-center">
      <section className="w-full max-w-sm rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gray-900 text-white">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">관리자 로그인</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            관리자 아이디 확인 후 메일로 발송되는 인증번호를 입력해 주세요.
          </p>
        </div>

        {step === 'id' ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void sendOtp()
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">관리자 아이디</span>
              <div className="relative">
                <UserRound className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                <input
                  type="text"
                  value={loginId}
                  onChange={(event) => setLoginId(event.target.value)}
                  autoComplete="username"
                  required
                  autoFocus
                  className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm text-gray-900 outline-none transition focus:border-gray-700 focus:ring-2 focus:ring-gray-200"
                  placeholder="admin"
                />
              </div>
            </label>

            {errorMessage && (
              <p role="alert" className="text-sm text-red-600">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {sending ? '발송 중...' : '인증번호 발송'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp} className="space-y-4">
            <div className="rounded-lg bg-gray-50 px-3 py-2.5 text-sm text-gray-600">
              <p>메일로 발송된 인증번호를 입력하세요.</p>
              {maskedEmail && <p className="mt-1 truncate font-medium text-gray-900">{maskedEmail}</p>}
            </div>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-gray-700">6자리 인증번호</span>
              <input
                type="text"
                value={token}
                onChange={(event) => setToken(event.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-center text-lg font-semibold tracking-[0.35em] text-gray-900 outline-none transition focus:border-gray-700 focus:ring-2 focus:ring-gray-200"
                placeholder="000000"
              />
            </label>

            {errorMessage && (
              <p role="alert" className="text-sm text-red-600">
                {errorMessage}
              </p>
            )}

            <button
              type="submit"
              disabled={verifying || token.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {verifying && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {verifying ? '확인 중...' : '확인'}
            </button>

            <button
              type="button"
              onClick={() => void sendOtp(true)}
              disabled={sending || verifying || cooldown > 0}
              className="flex w-full items-center justify-center gap-1.5 text-sm text-gray-500 transition hover:text-gray-900 disabled:cursor-not-allowed disabled:text-gray-400"
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {sending ? '재발송 중...' : cooldown > 0 ? `${cooldown}초 후 재발송` : '인증번호 재발송'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
