import { NextResponse } from 'next/server';
import { verifySession } from '../../lib/auth';
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
    
    const results = await query(
      'SELECT data, updated_at FROM user_configs WHERE user_id = ?',
      [session.userId]
    );
    
    if (results.length === 0) {
      return NextResponse.json({ data: null });
    }
    
    return NextResponse.json({ 
      data: results[0].data,
      updatedAt: results[0].updated_at
    });
  } catch (error) {
    console.error('Get config error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    const session = await verifySession(token);
    
    if (!session) {
      return NextResponse.json({ error: '会话已过期' }, { status: 401 });
    }
    
    const { data } = await request.json();
    
    if (!data) {
      return NextResponse.json({ error: '数据不能为空' }, { status: 400 });
    }
    
    const existing = await query(
      'SELECT id FROM user_configs WHERE user_id = ?',
      [session.userId]
    );
    
    if (existing.length > 0) {
      await query(
        'UPDATE user_configs SET data = ?, updated_at = NOW() WHERE user_id = ?',
        [JSON.stringify(data), session.userId]
      );
    } else {
      await query(
        'INSERT INTO user_configs (user_id, data) VALUES (?, ?)',
        [session.userId, JSON.stringify(data)]
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Save config error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const token = request.cookies.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }
    
    const session = await verifySession(token);
    
    if (!session) {
      return NextResponse.json({ error: '会话已过期' }, { status: 401 });
    }
    
    const { data: partialData } = await request.json();
    
    if (!partialData) {
      return NextResponse.json({ error: '数据不能为空' }, { status: 400 });
    }
    
    const existing = await query(
      'SELECT data FROM user_configs WHERE user_id = ?',
      [session.userId]
    );
    
    let mergedData = partialData;
    
    if (existing.length > 0) {
      const currentData = existing[0].data || {};
      mergedData = { ...currentData, ...partialData };
    }
    
    if (existing.length > 0) {
      await query(
        'UPDATE user_configs SET data = ?, updated_at = NOW() WHERE user_id = ?',
        [JSON.stringify(mergedData), session.userId]
      );
    } else {
      await query(
        'INSERT INTO user_configs (user_id, data) VALUES (?, ?)',
        [session.userId, JSON.stringify(mergedData)]
      );
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Patch config error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
