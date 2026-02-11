import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function GET(request: NextRequest) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')
    const token_hash = requestUrl.searchParams.get('token_hash')
    const type = requestUrl.searchParams.get('type')
    const error = requestUrl.searchParams.get('error')
    const error_description = requestUrl.searchParams.get('error_description')

    const origin = requestUrl.origin

    // 에러가 있는 경우 (토큰 만료 등)
    if (error) {
        console.error('Auth callback error:', error, error_description)

        // 토큰 만료 에러 처리
        if (error_description?.includes('expired') ||
            error_description?.includes('invalid') ||
            error === 'access_denied') {
            return NextResponse.redirect(
                `${origin}/auth/confirm?status=expired`
            )
        }

        return NextResponse.redirect(
            `${origin}/auth/confirm?status=error&message=${encodeURIComponent(error_description || error)}`
        )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // PKCE flow - code를 사용하는 경우
    if (code) {
        try {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

            if (exchangeError) {
                console.error('Code exchange error:', exchangeError)

                // 토큰 만료 에러
                if (exchangeError.message?.toLowerCase().includes('expired') ||
                    exchangeError.message?.toLowerCase().includes('invalid') ||
                    exchangeError.code === 'otp_expired') {
                    return NextResponse.redirect(
                        `${origin}/auth/confirm?status=expired`
                    )
                }

                return NextResponse.redirect(
                    `${origin}/auth/confirm?status=error&message=${encodeURIComponent(exchangeError.message)}`
                )
            }

            // 성공
            return NextResponse.redirect(`${origin}/auth/confirm?status=success`)
        } catch (err: any) {
            console.error('Auth callback exception:', err)
            return NextResponse.redirect(
                `${origin}/auth/confirm?status=error&message=${encodeURIComponent(err.message || 'Unknown error')}`
            )
        }
    }

    // Token hash flow - 이메일 인증 링크에서 사용
    if (token_hash && type) {
        try {
            const { error: verifyError } = await supabase.auth.verifyOtp({
                token_hash,
                type: type as any,
            })

            if (verifyError) {
                console.error('OTP verification error:', verifyError)

                // 토큰 만료 에러
                if (verifyError.message?.toLowerCase().includes('expired') ||
                    verifyError.message?.toLowerCase().includes('invalid') ||
                    verifyError.code === 'otp_expired') {
                    return NextResponse.redirect(
                        `${origin}/auth/confirm?status=expired`
                    )
                }

                return NextResponse.redirect(
                    `${origin}/auth/confirm?status=error&message=${encodeURIComponent(verifyError.message)}`
                )
            }

            // 성공
            return NextResponse.redirect(`${origin}/auth/confirm?status=success`)
        } catch (err: any) {
            console.error('OTP verification exception:', err)
            return NextResponse.redirect(
                `${origin}/auth/confirm?status=error&message=${encodeURIComponent(err.message || 'Unknown error')}`
            )
        }
    }

    // 파라미터가 없는 경우
    return NextResponse.redirect(`${origin}/auth/confirm?status=error&message=Invalid request`)
}
