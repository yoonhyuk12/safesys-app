// 관리자 세션의 로그아웃 성공과 화면 이동 순서를 보장한다
export async function performAdminSignOut(
  signOut: () => Promise<{ error: Error | null }>,
  redirect: (path: '/login') => void
): Promise<void> {
  const { error } = await signOut()
  if (error) throw error
  redirect('/login')
}
