import { NextResponse } from 'next/server';
import { verifySession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    const session = await verifySession(token);
    
    if (!session) {
      return NextResponse.json({ error: '会话已过期' }, { status: 401 });
    }
    
    const { since } = Object.fromEntries(new URL(request.url).searchParams);
    
    let results;
    if (since) {
      results = await query(
        'SELECT data, updated_at FROM user_configs WHERE user_id = ? AND updated_at > ?',
        [session.userId, since]
      );
    } else {
      results = await query(
        'SELECT data, updated_at FROM user_configs WHERE user_id = ?',
        [session.userId]
      );
    }
    
    if (results.length === 0) {
      return NextResponse.json({ data: null, updatedAt: null });
    }
    
    return NextResponse.json({ 
      data: results[0].data,
      updatedAt: results[0].updated_at
    });
  } catch (error) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
