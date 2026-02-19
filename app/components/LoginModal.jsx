'use client';

import { MailIcon } from './Icons';

export default function LoginModal({
  onClose,
  loginEmail,
  setLoginEmail,
  loginOtp,
  setLoginOtp,
  loginLoading,
  loginError,
  loginSuccess,
  handleSendOtp,
  handleVerifyEmailOtp
}) {
  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="登录"
      onClick={onClose}
    >
      <div className="glass card modal login-modal" onClick={(e) => e.stopPropagation()}>
        <div className="title" style={{ marginBottom: 16 }}>
          <MailIcon width="20" height="20" />
          <span>邮箱登录</span>
          <span className="muted">使用邮箱验证登录</span>
        </div>

        <form onSubmit={handleSendOtp}>
          <div className="form-group" style={{ marginBottom: 16 }}>
            <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
              请输入邮箱，我们将发送验证码到您的邮箱
            </div>
            <input
              style={{ width: '100%' }}
              className="input"
              type="email"
              placeholder="your@email.com"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              disabled={loginLoading || !!loginSuccess}
            />
          </div>

          {loginSuccess && (
            <div className="login-message success" style={{ marginBottom: 12 }}>
              <span>{loginSuccess}</span>
            </div>
          )}

          {loginSuccess && (
            <div className="form-group" style={{ marginBottom: 16 }}>
              <div className="muted" style={{ marginBottom: 8, fontSize: '0.8rem' }}>
                请输入邮箱验证码以完成注册/登录
              </div>
              <input
                className="input"
                type="text"
                placeholder="输入验证码"
                value={loginOtp}
                onChange={(e) => setLoginOtp(e.target.value)}
                disabled={loginLoading}
                maxLength={6}
              />
            </div>
          )}
          {loginError && (
            <div className="login-message error" style={{ marginBottom: 12 }}>
              <span>{loginError}</span>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', gap: 12 }}>
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={loginLoading}
            >
              取消
            </button>
            <button
              className="button"
              type={loginSuccess ? 'button' : 'submit'}
              onClick={loginSuccess ? handleVerifyEmailOtp : undefined}
              disabled={loginLoading || (loginSuccess && !loginOtp)}
            >
              {loginLoading ? '处理中...' : loginSuccess ? '确认验证码' : '发送邮箱验证码'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
