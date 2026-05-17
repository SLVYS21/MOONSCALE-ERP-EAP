import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import * as nodemailer from 'nodemailer'

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter
  private readonly logger = new Logger(MailService.name)

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get('SMTP_USER'),
        pass: this.config.get('SMTP_PASS'),
      },
    })
  }

  private get from() {
    return `"Moonscale ERP" <${this.config.get('SMTP_USER')}>`
  }

  async sendInvitation(to: string, inviteLink: string): Promise<void> {
    await this.send(to, 'Invitation à rejoindre Moonscale ERP', this.invitationTemplate(inviteLink))
  }

  async sendPaymentReminder(to: string, name: string, amount: number, currency: string): Promise<void> {
    await this.send(to, 'Rappel de paiement — Moonscale', this.paymentReminderTemplate(name, amount, currency))
  }

  async sendCustom(to: string, subject: string, html: string): Promise<void> {
    return this.send(to, subject, html)
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html })
    } catch (err) {
      this.logger.error(`Failed to send email to ${to}: ${err}`)
      throw err
    }
  }

  private invitationTemplate(link: string): string {
    return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1e1e2e;margin-bottom:16px">Vous avez été invité à rejoindre Moonscale ERP</h2>
        <p style="color:#4b5563">Cliquez sur le bouton ci-dessous pour créer votre compte. Ce lien expire dans 7 jours.</p>
        <a href="${link}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Accepter l'invitation
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px">Si vous n'attendiez pas cette invitation, ignorez cet email.</p>
      </div>
    `
  }

  private paymentReminderTemplate(name: string, amount: number, currency: string): string {
    const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount)
    return `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1e1e2e">Rappel de paiement</h2>
        <p style="color:#4b5563">Bonjour ${name},</p>
        <p style="color:#4b5563">Un solde de <strong>${formatted}</strong> est toujours en attente sur votre formation Moonscale.</p>
        <p style="color:#4b5563">Merci de procéder au règlement dès que possible.</p>
        <p style="color:#9ca3af;font-size:12px;margin-top:32px">Pour toute question, répondez à cet email.</p>
      </div>
    `
  }
}
