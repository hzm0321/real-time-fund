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
      return NextResponse.json({ success: true, message: '验证码已发送到您的邮箱' });
    } catch (emailError) {
      console.error('Failed to send OTP email:', emailError);
      // 即使邮件发送失败，也返回成功，因为验证码已经生成并存储
      // 这样用户可以继续使用验证码进行验证
      return NextResponse.json({ 
        success: true, 
        message: '验证码生成成功，但邮件发送失败，请检查邮箱配置',
        code: process.env.NODE_ENV === 'development' ? code : undefined
      });
    }
  } catch (error) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
