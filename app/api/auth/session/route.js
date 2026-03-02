import { NextResponse } from 'next/server';
import { verifySession } from '../../../lib/auth';

export async function GET(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ user: null });
    }
    
    const session = await verifySession(token);
    
    if (!session) {
      const response = NextResponse.json({ user: null });
      response.cookies.delete('auth_token');
      return response;
    }
    
    return NextResponse.json({ 
      user: { 
        id: session.userId, 
        email: session.email,
        emailVerified: session.emailVerified
      } 
    });
  } catch (error) {
    console.error('Get session error:', error);
    return NextResponse.json({ user: null });
  }
}
