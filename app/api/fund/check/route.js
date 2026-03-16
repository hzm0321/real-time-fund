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

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (!userId || userId !== session.userId) {
      return NextResponse.json({ error: '无效的用户ID' }, { status: 400 });
    }

    const data = await query(
      'SELECT id, funds, `groups`, dca_plans, holdings FROM fund_configs WHERE user_id = ?',
      [userId]
    );

    if (!data || data.length === 0) {
      return NextResponse.json({ status: 'not_found' });
    }

    const row = data[0];
    const hasData = (row.funds && row.funds.length > 0) ||
                    (row.groups && row.groups.length > 0) ||
                    (row.dca_plans && Object.keys(row.dca_plans).length > 0) ||
                    (row.holdings && Object.keys(row.holdings).length > 0);

    if (!hasData) {
      return NextResponse.json({ status: 'empty' });
    }

    return NextResponse.json({ status: 'found' });
  } catch (error) {
    console.error('Check fund config error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
