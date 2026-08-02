// 관리자 로그인 인증번호 메일을 Gmail SMTP로 발송하는 서버 전용 모듈 (메일 채널 교체 지점)
import nodemailer from 'nodemailer'
import { OTP_TTL_MINUTES } from '@/lib/admin-otp'

const SMTP_HOST = 'smtp.gmail.com'
const SMTP_PORT = 465
const SENDER_NAME = '안전관리시스템'

// 앱 비밀번호로 인증하는 Gmail 전송기를 만든다. env가 없으면 발송 전에 실패시킨다.
function createMailer(): { transporter: nodemailer.Transporter; sender: string } {
  const user = process.env.ADMIN_MAIL_USER
  const pass = process.env.ADMIN_MAIL_PASS
  if (!user || !pass) {
    throw new Error('메일 발송 설정이 없습니다. ADMIN_MAIL_USER·ADMIN_MAIL_PASS 환경 변수를 설정해야 합니다.')
  }
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: true,
    auth: { user, pass },
  })
  return { transporter, sender: user }
}

// 관리자 인증번호 메일 1종을 발송한다. 실패는 호출부가 처리하도록 예외로 올린다.
export async function sendAdminOtpMail(to: string, code: string): Promise<void> {
  const { transporter, sender } = createMailer()
  const text = [
    `관리자 로그인 인증번호는 ${code} 입니다.`,
    `${OTP_TTL_MINUTES}분 이내에 입력해 주세요. 시간이 지나면 다시 발송해야 합니다.`,
    '본인이 요청한 것이 아니라면 이 메일을 무시해 주세요.',
  ].join('\n')
  const html = `
    <div style="font-family:sans-serif;font-size:14px;color:#111827;line-height:1.7">
      <p>관리자 로그인 인증번호입니다.</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>
      <p>${OTP_TTL_MINUTES}분 이내에 입력해 주세요. 시간이 지나면 다시 발송해야 합니다.</p>
      <p style="color:#6b7280">본인이 요청한 것이 아니라면 이 메일을 무시해 주세요.</p>
    </div>
  `

  await transporter.sendMail({
    from: `"${SENDER_NAME}" <${sender}>`,
    to,
    // 잠금화면 알림 미리보기에 코드가 노출되지 않도록 제목엔 코드를 넣지 않는다.
    subject: `[${SENDER_NAME}] 관리자 로그인 인증번호 (${OTP_TTL_MINUTES}분 유효)`,
    text,
    html,
  })
}
