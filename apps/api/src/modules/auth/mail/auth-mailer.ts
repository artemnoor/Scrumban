import nodemailer from 'nodemailer'
import type Mail from 'nodemailer/lib/mailer'
import { createLogger } from '@scrumbun/config'
import type { ApiEnv } from '../../../shared/config/env'

const logger = createLogger('apps/api/auth-mailer')
const DEFAULT_CONNECTION_TIMEOUT_MS = 60_000
const DEFAULT_GREETING_TIMEOUT_MS = 30_000
const DEFAULT_SOCKET_TIMEOUT_MS = 60_000
const DEFAULT_DNS_TIMEOUT_MS = 30_000

export type SendVerificationEmailInput = {
  email: string
  displayName: string
  verificationUrl: string
  expiresAt: Date
}

export interface AuthMailer {
  sendVerificationEmail(input: SendVerificationEmailInput): Promise<void>
}

type TransportAttempt = {
  label: string
  options: Mail.Options & Record<string, unknown>
}

export class SmtpAuthMailer implements AuthMailer {
  constructor(private readonly env: ApiEnv) {}

  async sendVerificationEmail(input: SendVerificationEmailInput) {
    logger.info('Sending verification email', {
      email: input.email,
      expiresAt: input.expiresAt.toISOString(),
      host: this.env.SMTP_HOST,
      port: this.env.SMTP_PORT
    })

    const message = {
      from: {
        address: this.env.SMTP_FROM_EMAIL,
        name: this.env.SMTP_FROM_NAME
      },
      to: input.email,
      subject: 'Подтвердите email в Scrumbun',
      text: [
        `Здравствуйте, ${input.displayName}!`,
        '',
        'Подтвердите ваш email, чтобы активировать аккаунт Scrumbun.',
        `Ссылка для подтверждения: ${input.verificationUrl}`,
        `Ссылка действует до: ${input.expiresAt.toISOString()}`,
        '',
        'Если вы не создавали аккаунт, просто проигнорируйте это письмо.'
      ].join('\n'),
      html: `
        <div style="background:#050505;padding:32px;font-family:Arial,sans-serif;color:#ffffff;">
          <div style="max-width:560px;margin:0 auto;border:1px solid rgba(255,255,255,0.12);border-radius:24px;padding:32px;background:#0b0b0b;">
            <div style="font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:rgba(255,255,255,0.56);margin-bottom:16px;">Scrumbun // Email Verification</div>
            <h1 style="margin:0 0 16px;font-size:32px;line-height:1;color:#ffffff;">Подтвердите ваш email</h1>
            <p style="margin:0 0 24px;color:rgba(255,255,255,0.72);line-height:1.6;">
              Здравствуйте, ${escapeHtml(input.displayName)}. Чтобы активировать аккаунт в Scrumbun, подтвердите email по кнопке ниже.
            </p>
            <p style="margin:0 0 24px;">
              <a href="${input.verificationUrl}" style="display:inline-block;padding:14px 22px;border-radius:999px;background:#ffffff;color:#000000;text-decoration:none;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">Подтвердить email</a>
            </p>
            <p style="margin:0 0 16px;color:rgba(255,255,255,0.56);line-height:1.6;">
              Эта ссылка действует до ${input.expiresAt.toISOString()}.
            </p>
            <p style="margin:0;color:rgba(255,255,255,0.44);line-height:1.6;">
              Если кнопка не открывается, используйте эту ссылку:
              <br />
              <a href="${input.verificationUrl}" style="color:#ffffff;word-break:break-all;">${input.verificationUrl}</a>
            </p>
          </div>
        </div>
      `
    } satisfies Mail.Options

    const attempts = this.buildAttempts()
    let lastError: unknown = null

    for (const attempt of attempts) {
      const transporter = nodemailer.createTransport(attempt.options)

      try {
        logger.debug('Attempting SMTP delivery', {
          email: input.email,
          attempt: attempt.label
        })

        await transporter.sendMail(message)

        logger.info('Verification email sent', {
          email: input.email,
          attempt: attempt.label
        })
        return
      } catch (error) {
        lastError = error
        logger.warn('SMTP delivery attempt failed', {
          email: input.email,
          attempt: attempt.label,
          message: error instanceof Error ? error.message : 'Unknown mailer error'
        })
      } finally {
        transporter.close()
      }
    }

    throw lastError instanceof Error ? lastError : new Error('SMTP delivery failed')
  }

  private buildAttempts(): TransportAttempt[] {
    const password = this.env.SMTP_PASS?.replace(/\s+/g, '')
    const auth =
      this.env.SMTP_USER && password
        ? {
            user: this.env.SMTP_USER,
            pass: password
          }
        : undefined

    const base = {
      auth,
      name: 'localhost',
      connectionTimeout: DEFAULT_CONNECTION_TIMEOUT_MS,
      greetingTimeout: DEFAULT_GREETING_TIMEOUT_MS,
      socketTimeout: DEFAULT_SOCKET_TIMEOUT_MS,
      dnsTimeout: DEFAULT_DNS_TIMEOUT_MS,
      tls: {
        servername: this.env.SMTP_HOST,
        minVersion: 'TLSv1.2'
      }
    }

    const primary: TransportAttempt = {
      label: `primary:${this.env.SMTP_HOST}:${this.env.SMTP_PORT}`,
      options: {
        ...base,
        host: this.env.SMTP_HOST,
        port: this.env.SMTP_PORT,
        secure: this.env.SMTP_SECURE
      }
    }

    if (this.env.SMTP_HOST !== 'smtp.gmail.com') {
      return [primary]
    }

    return [
      primary,
      {
        label: 'gmail-starttls-587',
        options: {
          ...base,
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          requireTLS: true
        }
      },
      {
        label: 'gmail-opportunistic-587',
        options: {
          ...base,
          host: 'smtp.gmail.com',
          port: 587,
          secure: false
        }
      },
      {
        label: 'gmail-ssl-465',
        options: {
          ...base,
          host: 'smtp.gmail.com',
          port: 465,
          secure: true
        }
      }
    ]
  }
}

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
