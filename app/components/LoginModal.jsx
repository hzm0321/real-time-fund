'use client';

import Image from 'next/image';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { MailIcon } from './Icons';
import githubImg from "../assets/github.svg";

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
  handleVerifyEmailOtp,
  handleGithubLogin
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
              <InputOTP
                maxLength={6}
                value={loginOtp}
                onChange={(value) => setLoginOtp(value)}
                disabled={loginLoading}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                  <InputOTPSlot index={4} />
                  <InputOTPSlot index={5} />
                </InputOTPGroup>
              </InputOTP>
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

        {handleGithubLogin && !loginSuccess && (
          <>
            <div
              className="login-divider"
              style={{
                display: 'flex',
                alignItems: 'center',
                margin: '20px 0',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span className="muted" style={{ fontSize: '12px', whiteSpace: 'nowrap' }}>或使用</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <button
              type="button"
              className="github-login-btn"
              onClick={handleGithubLogin}
              disabled={loginLoading}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '12px 16px',
                border: '1px solid var(--border)',
                borderRadius: 8,
                background: 'var(--bg)',
                color: 'var(--text)',
                cursor: loginLoading ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                opacity: loginLoading ? 0.6 : 1,
                transition: 'all 0.2s ease',
              }}
            >
          <span className="github-icon-wrap">
            <Image unoptimized alt="项目Github地址" src={githubImg} style={{ width: '24px', height: '24px', cursor: 'pointer' }} onClick={() => window.open("https://github.com/hzm0321/real-time-fund")} />
          </span>
              <span>使用 GitHub 登录</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
