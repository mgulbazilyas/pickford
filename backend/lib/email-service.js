const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isConfigured = false;
    this.initializeTransporter();
  }

  initializeTransporter() {
    // Check if email configuration is available
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('Email service not configured. Set EMAIL_HOST, EMAIL_USER, and EMAIL_PASS in environment variables.');
      return;
    }

    this.transporter = nodemailer.createTransporter({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    this.isConfigured = true;
  }

  async sendVerificationEmail(email, verificationToken) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping verification email');
      return false;
    }

    const verificationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${verificationToken}`;

    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'Pickford'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Verify your Pickford account',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify your Pickford account</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #e50914;
            }
            .content {
              background: #f8f9fa;
              padding: 30px;
              border-radius: 8px;
              margin-bottom: 20px;
            }
            .button {
              display: inline-block;
              background: #e50914;
              color: white;
              text-decoration: none;
              padding: 12px 24px;
              border-radius: 4px;
              font-weight: bold;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              font-size: 12px;
              color: #666;
              margin-top: 30px;
            }
            .expiry {
              color: #666;
              font-size: 14px;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">Pickford</div>
          </div>

          <div class="content">
            <h2>Welcome to Pickford!</h2>
            <p>Thank you for signing up. To complete your registration and start using Pickford, please verify your email address by clicking the button below:</p>

            <a href="${verificationUrl}" class="button">Verify Email Address</a>

            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #e50914;">${verificationUrl}</p>

            <div class="expiry">
              <p><strong>Note:</strong> This verification link will expire in 24 hours.</p>
            </div>
          </div>

          <div class="footer">
            <p>If you didn't create an account with Pickford, you can safely ignore this email.</p>
            <p>© 2024 Pickford. All rights reserved.</p>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Verification email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('Failed to send verification email:', error);
      return false;
    }
  }

  async sendPasswordResetEmail(email, resetToken) {
    if (!this.isConfigured) {
      console.log('Email service not configured - skipping password reset email');
      return false;
    }

    const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `${process.env.EMAIL_FROM_NAME || 'Pickford'} <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Reset your Pickford password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Reset your Pickford password</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
            }
            .logo {
              font-size: 24px;
              font-weight: bold;
              color: #e50914;
            }
            .content {
              background: #f8f9fa;
              padding: 30px;
              border-radius: 8px;
              margin-bottom: 20px;
            }
            .button {
              display: inline-block;
              background: #e50914;
              color: white;
              text-decoration: none;
              padding: 12px 24px;
              border-radius: 4px;
              font-weight: bold;
              margin: 20px 0;
            }
            .footer {
              text-align: center;
              font-size: 12px;
              color: #666;
              margin-top: 30px;
            }
            .expiry {
              color: #666;
              font-size: 14px;
              margin-top: 15px;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">Pickford</div>
          </div>

          <div class="content">
            <h2>Reset your password</h2>
            <p>We received a request to reset the password for your Pickford account. Click the button below to reset your password:</p>

            <a href="${resetUrl}" class="button">Reset Password</a>

            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #e50914;">${resetUrl}</p>

            <div class="expiry">
              <p><strong>Note:</strong> This password reset link will expire in 1 hour.</p>
            </div>
          </div>

          <div class="footer">
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
            <p>© 2024 Pickford. All rights reserved.</p>
          </div>
        </body>
        </html>
      `
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Password reset email sent to ${email}`);
      return true;
    } catch (error) {
      console.error('Failed to send password reset email:', error);
      return false;
    }
  }

  generateVerificationToken() {
    return {
      token: uuidv4(),
      expiresAt: new Date(Date.now() + this.parseExpiration(process.env.EMAIL_VERIFICATION_TOKEN_EXPIRES_IN || '24h'))
    };
  }

  generatePasswordResetToken() {
    return {
      token: uuidv4(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour
    };
  }

  parseExpiration(timeString) {
    const timeValue = parseInt(timeString);
    const timeUnit = timeString.slice(-1).toLowerCase();

    switch (timeUnit) {
      case 'h':
        return timeValue * 60 * 60 * 1000;
      case 'd':
        return timeValue * 24 * 60 * 60 * 1000;
      case 'm':
        return timeValue * 60 * 1000;
      case 's':
        return timeValue * 1000;
      default:
        return 24 * 60 * 60 * 1000; // Default to 24 hours
    }
  }

  isTokenExpired(expiresAt) {
    return new Date() > new Date(expiresAt);
  }
}

// Create singleton instance
const emailService = new EmailService();

module.exports = { EmailService: emailService };