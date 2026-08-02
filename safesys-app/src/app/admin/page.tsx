// /admin 진입 시 가입자 관리 탭으로 리다이렉트
import { redirect } from 'next/navigation'

export default function AdminIndexPage() {
  redirect('/admin/users')
}
