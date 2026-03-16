import { NextResponse } from 'next/server';
import { deleteSession, deleteUserSessions, verifySession } from '../../../lib/auth';

export async function POST(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    const { scope } = await request.json().catch(() => ({}));
    
    if (token) {
      if (scope === 'global') {
        const payload = await verifySession(token);
        if (payload?.userId) {
          await deleteUserSessions(payload.userId);
        }
      } else {
        await deleteSession(token);
      }
    }
    
    const response = NextResponse.json({ success: true });
    response.cookies.delete('auth_token');
    return response;
  } catch (error) {
    console.error('Sign out error:', error);
    const response = NextResponse.json({ success: true });
    response.cookies.delete('auth_token');
    return response;
  }
}
