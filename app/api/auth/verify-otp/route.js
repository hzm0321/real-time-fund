import { NextResponse } from 'next/server';
import { verifyOTP, createOrUpdateUser, createSession } from '../../../lib/auth';

export async function POST(request) {
  try {
    const { email, code } = await request.json();
    
    if (!email || !code) {
      return NextResponse.json(
        { error: '请输入邮箱和验证码' },
        { status: 400 }
      );
    }
    
    const isValid = await verifyOTP(email, code);
    
    if (!isValid) {
      return NextResponse.json(
        { error: '验证码无效或已过期' },
        { status: 400 }
      );
    }
    
    const userId = await createOrUpdateUser(email);
    const token = await createSession(userId);
    
    const response = NextResponse.json({ 
      success: true,
      user: { id: userId, email }
    });
    
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });
    
    return response;
  } catch (error) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
