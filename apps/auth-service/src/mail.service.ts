import { Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

export interface MockMailMessage {
  id: number;
  to: string;
  subject: string;
  html: string;
  actionUrl: string;
  createdAt: string;
}

@Injectable()
export class MailService {
  private readonly transporter?: Transporter;
  private readonly mockMessages: MockMailMessage[] = [];
  private nextMockId = 1;

  constructor() {
    if (!this.isMockMode() && process.env.SMTP_HOST) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
          : undefined,
      });
    }
  }

  isMockMode(): boolean {
    return process.env.MAIL_MODE === 'mock';
  }

  getMockMessages(): MockMailMessage[] {
    return [...this.mockMessages].reverse();
  }

  clearMockMessages(): void {
    this.mockMessages.length = 0;
  }

  async sendInvitation(
    email: string,
    firstName: string,
    link: string,
  ): Promise<void> {
    await this.send(
      email,
      'You’re invited to OrderOut',
      `<h2>Welcome${firstName ? `, ${this.escape(firstName)}` : ''}!</h2><p>You have been invited to join OrderOut.</p><p><a href="${link}">Create your password</a></p><p>This link expires in 24 hours.</p>`,
      link,
    );
  }

  async sendPasswordReset(email: string, link: string): Promise<void> {
    await this.send(
      email,
      'Reset your OrderOut password',
      `<h2>Reset password</h2><p>Use the link below to create a new password.</p><p><a href="${link}">Reset password</a></p><p>This link expires in one hour. If you did not request this, ignore this email.</p>`,
      link,
    );
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    previewLink: string,
  ): Promise<void> {
    if (this.isMockMode()) {
      this.mockMessages.push({
        id: this.nextMockId++,
        to,
        subject,
        html,
        actionUrl: previewLink,
        createdAt: new Date().toISOString(),
      });
      console.log(`📧 [Mock mailbox] ${subject} -> ${to}: ${previewLink}`);
      return;
    }

    if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from:
            process.env.MAIL_FROM ||
            'Pinaka Delivery Hub <onboarding@resend.dev>',
          to: [to],
          subject,
          html,
          reply_to: process.env.MAIL_REPLY_TO || undefined,
        }),
      });
      if (!response.ok) {
        const error = await response.text();
        throw new Error(
          `Resend rejected the email (${response.status}): ${error}`,
        );
      }
      return;
    }

    if (!this.transporter) {
      console.log(`📧 [Mail preview] ${subject} -> ${to}: ${previewLink}`);
      return;
    }
    await this.transporter.sendMail({
      from: process.env.MAIL_FROM || 'OrderOut <no-reply@example.com>',
      to,
      subject,
      html,
    });
  }

  private escape(value: string): string {
    return value.replace(
      /[&<>'"]/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;',
        })[character] || character,
    );
  }
}
