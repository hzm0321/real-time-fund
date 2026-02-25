import { NextResponse } from 'next/server';
import { createOTP } from '../../../lib/auth';
import { sendOTPEmail } from '../../../lib/email';

export async function POST(request) {
  try {
    const { email } = await request.json();
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: '请输入有效的邮箱地址' },
        { status: 400 }
      );
    }
    
    const code = await createOTP(email);
    
    try {
      await sendOTPEmail(email, code);
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError);
      return NextResponse.json(
        { error: '发送验证码失败，请检查邮箱配置' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
