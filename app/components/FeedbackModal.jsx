'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { CloseIcon, SettingsIcon } from './Icons';
import { submitFeedback } from '../api/fund';

export default function FeedbackModal({ onClose, user, onOpenWeChat }) {
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const formData = new FormData(e.target);
    const nickname = formData.get("nickname")?.trim();
    if (!nickname) {
      formData.set("nickname", "匿名");
    }

    // Web3Forms Access Key
    formData.append("access_key", process.env.NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY || '');
    formData.append("subject", "基估宝 - 用户反馈");

    try {
      const data = await submitFeedback(formData);
      if (data.success) {
        setSucceeded(true);
      } else {
        setError(data.message || "提交失败，请稍后再试");
      }
    } catch (err) {
      setError("网络错误，请检查您的连接");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="意见反馈"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="glass card modal feedback-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="title" style={{ marginBottom: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SettingsIcon width="20" height="20" />
            <span>意见反馈</span>
          </div>
          <button className="icon-button" onClick={onClose} style={{ border: 'none', background: 'transparent' }}>
            <CloseIcon width="20" height="20" />
          </button>
        </div>

        {succeeded ? (
          <div className="success-message" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '48px', marginBottom: 16 }}>🎉</div>
            <h3 style={{ marginBottom: 8 }}>感谢您的反馈！</h3>
            <p className="muted">我们已收到您的建议，会尽快查看。</p>
            <button className="button" onClick={onClose} style={{ marginTop: 24, width: '100%' }}>
              关闭
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="feedback-form">
            <div className="form-group" style={{ marginBottom: 16 }}>
              <label htmlFor="nickname" className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                您的昵称（可选）
              </label>
              <input
                id="nickname"
                type="text"
                name="nickname"
                className="input"
                placeholder="匿名"
                style={{ width: '100%' }}
              />
            </div>
            <input type="hidden" name="email" value={user?.email || ''} />
            <div className="form-group" style={{ marginBottom: 20 }}>
              <label htmlFor="message" className="muted" style={{ display: 'block', marginBottom: 8, fontSize: '14px' }}>
                反馈内容
              </label>
              <textarea
                id="message"
                name="message"
                className="input"
                required
                placeholder="请描述您遇到的问题或建议..."
                style={{ width: '100%', minHeight: '120px', padding: '12px', resize: 'vertical' }}
              />
            </div>
            {error && (
              <div className="error-text" style={{ marginBottom: 16, textAlign: 'center' }}>
                {error}
              </div>
            )}

            <button className="button" type="submit" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? '发送中...' : '提交反馈'}
            </button>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', textAlign: 'center' }}>
              <p className="muted" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                如果您有 Github 账号，也可以在本项目
                <a
                  href="https://github.com/hzm0321/real-time-fund/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-button"
                  style={{ color: 'var(--primary)', textDecoration: 'underline', padding: '0 4px', fontWeight: 600 }}
                >
                  Issues
                </a>
                区留言互动
              </p>
              <p className="muted" style={{ fontSize: '12px', lineHeight: '1.6' }}>
                或加入我们的
                <a
                  className="link-button"
                  style={{ color: 'var(--primary)', textDecoration: 'underline', padding: '0 4px', fontWeight: 600, cursor: 'pointer' }}
                  onClick={onOpenWeChat}
                >
                  微信用户交流群
                </a>
              </p>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
