import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.qq.com',
  port: parseInt(process.env.SMTP_PORT || '465'),
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendOTPEmail(email, code) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || '基金实时展示';
  
  const mailOptions = {
    from: `"${appName}" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${appName} - 验证码`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #333;">您的验证码</h2>
        <p style="font-size: 16px; color: #666;">您正在登录 ${appName}，验证码如下：</p>
        <div style="background: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
        </div>
        <p style="font-size: 14px; color: #999;">验证码有效期为 10 分钟，请勿将验证码告知他人。</p>
        <p style="font-size: 14px; color: #999;">如果您没有请求此验证码，请忽略此邮件。</p>
      </div>
    `,
  };
  
  await transporter.sendMail(mailOptions);
}

export async function sendEmail(to, subject, html) {
  const mailOptions = {
    from: `"${process.env.NEXT_PUBLIC_APP_NAME || '基金实时展示'}" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  };
  
  await transporter.sendMail(mailOptions);
}
