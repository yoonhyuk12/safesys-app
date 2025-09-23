import { supabase } from './supabase'
import { User } from '@supabase/supabase-js'

export interface AuthState {
  user: User | null
  loading: boolean
}

export interface SignUpData {
  email: string
  password: string
  full_name: string
  phone_number: string
  position: string
  role: '발주청' | '감리단' | '시공사'
  hq_division: string
  branch_division: string
  company_name: string | null
}

// 현재 사용자 정보 가져오기
export const getCurrentUser = async () => {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) {
    console.error('Error getting user:', error)
    return null
  }
  return user
}

// 임시 더미 로그인 (테스트용)
export const dummySignIn = async (email: string, password: string) => {
  // 더미 사용자 데이터
  if (email === 'test@example.com' && password === 'Test123!@#') {
    return {
      data: {
        user: {
          id: 'dummy-user-id',
          email: 'test@example.com',
          user_metadata: {}
        },
        session: {
          access_token: 'dummy-token',
          refresh_token: 'dummy-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: {
            id: 'dummy-user-id',
            email: 'test@example.com'
          }
        }
      },
      error: null
    }
  }
  
  throw new Error('잘못된 이메일 또는 비밀번호입니다.')
}

// 로그인
export const signIn = async (email: string, password: string) => {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      console.error('SignIn error details:', error)
      
      // 구체적인 에러 메시지 제공
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
      } else if (error.message.includes('Email not confirmed')) {
        throw new Error('이메일 인증이 필요합니다. 이메일을 확인해주세요.')
      } else if (error.message.includes('Too many requests')) {
        throw new Error('너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.')
      } else {
        throw new Error(error.message || '로그인에 실패했습니다.')
      }
    }

    return data
  } catch (error) {
    console.error('SignIn catch error:', error)
    throw error
  }
}

// 회원가입
export const signUp = async (email: string, password: string, userData: SignUpData) => {
  try {
    // 1. 사용자 계정 생성 (한글 데이터 제외)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      // options.data에서 한글 문자 제거
    })

    if (authError) {
      console.error('Auth signup error:', authError)
      throw new Error('회원가입에 실패했습니다')
    }

    if (!authData.user) {
      throw new Error('회원가입에 실패했습니다')
    }

    // 2. 사용자 프로필 생성 (한글 데이터 포함)
    const profileData = {
      id: authData.user.id,
      email: userData.email,
      full_name: userData.full_name,
      phone_number: userData.phone_number,
      position: userData.position,
      role: userData.role,
      hq_division: userData.role === '발주청' ? userData.hq_division : null,
      branch_division: userData.role === '발주청' ? userData.branch_division : null,
      company_name: userData.company_name
    }

    const { error: profileError } = await supabase
      .from('user_profiles')
      .insert(profileData)

    if (profileError) {
      console.error('Profile creation error:', profileError)
      // 프로필 생성 실패 시 사용자 계정 정리는 Supabase에서 자동으로 처리됨
      throw new Error('프로필 생성에 실패했습니다')
    }

    return authData
  } catch (error) {
    console.error('SignUp error:', error)
    if (error instanceof Error) {
      throw error
    }
    throw new Error('회원가입 중 오류가 발생했습니다')
  }
}

// 로그아웃
export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

// 사용자 권한 확인
export const checkUserRole = async (userId: string): Promise<string | null> => {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('id', userId)
    .single()
  
  if (error) {
    console.error('Error checking user role:', error)
    return null
  }
  
  return data?.role || null
} 

// 이메일 중복 확인
export const checkEmailExists = async (email: string): Promise<boolean> => {
  try {
    // user_profiles 테이블에서 이메일 확인
    const { data, error } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('email', email)
      .limit(1)

    // 테이블이 없거나 데이터가 없는 경우는 사용 가능한 이메일로 처리
    if (error) {
      // 테이블이 존재하지 않는 경우 (42P01) 또는 권한 없음 (42501)
      if (error.code === '42P01' || error.code === '42501') {
        return false // 이메일 사용 가능
      }
      console.error('Email check error:', error.code, error.message)
      return false // 에러 시에도 사용 가능으로 처리
    }

    // 데이터가 있으면 중복, 없으면 사용 가능
    return data && data.length > 0
  } catch (err) {
    console.error('Unexpected error in checkEmailExists:', err)
    return false // 예외 발생 시에도 사용 가능으로 처리
  }
}

// 비밀번호 찾기 (재설정 요청)
export const resetPassword = async (email: string, name: string, phone: string) => {
  try {
    // 1. 사용자 정보 확인
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, phone_number')
      .eq('email', email)
      .eq('full_name', name)
      .eq('phone_number', phone)
      .single()

    if (profileError || !userProfile) {
      throw new Error('입력하신 정보와 일치하는 계정을 찾을 수 없습니다.')
    }

    // 2. 비밀번호 재설정 이메일 발송
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })

    if (resetError) {
      console.error('Password reset error:', resetError)
      throw new Error('비밀번호 재설정 이메일 발송에 실패했습니다.')
    }

    return { success: true }
  } catch (error) {
    console.error('Reset password error:', error)
    throw error
  }
} 