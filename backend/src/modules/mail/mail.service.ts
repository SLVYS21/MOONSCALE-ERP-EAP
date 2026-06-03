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
      secure: true,
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

  async sendCustom(
    to: string,
    subject: string,
    html: string,
    attachments?: nodemailer.SendMailOptions['attachments'],
  ): Promise<void> {
    return this.send(to, subject, html, attachments)
  }

  async sendBookingConfirmation(params: {
    to: string
    leadName: string
    closerName: string
    startTime: Date
    endTime: Date
    meetLink: string
    icsContent: string
  }): Promise<void> {
    const { to, leadName, closerName, startTime, endTime, meetLink, icsContent } = params

    const dateStr = startTime.toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Abidjan',
    })
    const timeStr = startTime.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan',
    })
    const endTimeStr = endTime.toLocaleTimeString('fr-FR', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Abidjan',
    })

    const html = this.bookingConfirmationTemplate({ leadName, closerName, dateStr, timeStr, endTimeStr, meetLink })
    const attachments: nodemailer.SendMailOptions['attachments'] = [
      {
        filename: 'rendez-vous.ics',
        content: icsContent,
        contentType: 'text/calendar; charset=utf-8; method=REQUEST',
      },
    ]

    await this.send(to, '✅ Votre rendez-vous est confirmé', html, attachments)
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    attachments?: nodemailer.SendMailOptions['attachments'],
  ): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html, attachments })
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

  private bookingConfirmationTemplate(p: {
    leadName: string
    closerName: string
    dateStr: string
    timeStr: string
    endTimeStr: string
    meetLink: string
  }): string {
    return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
        <div style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 24px;text-align:center">
          <p style="color:#c7d2fe;font-size:13px;margin:0 0 8px;text-transform:uppercase;letter-spacing:1px">Moonscale</p>
          <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700">Votre rendez-vous est confirmé ✅</h1>
        </div>
        <div style="padding:32px 24px">
          <p style="color:#374151;font-size:15px;margin:0 0 24px">Bonjour <strong>${p.leadName}</strong>,</p>
          <p style="color:#4b5563;font-size:14px;margin:0 0 24px">
            Votre appel avec <strong>${p.closerName}</strong> est bien enregistré.
            Voici les détails de votre rendez-vous :
          </p>

          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:20px 24px;margin-bottom:24px">
            <table style="width:100%;border-collapse:collapse">
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px;width:110px">📅 Date</td>
                <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600;text-transform:capitalize">${p.dateStr}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px">🕐 Heure</td>
                <td style="padding:8px 0;color:#111827;font-size:14px;font-weight:600">${p.timeStr} – ${p.endTimeStr} (heure de Dakar / Abidjan)</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#6b7280;font-size:13px">📹 Format</td>
                <td style="padding:8px 0;color:#111827;font-size:14px">Appel vidéo Google Meet</td>
              </tr>
            </table>
          </div>

          <div style="text-align:center;margin-bottom:28px">
            <a href="${p.meetLink}" style="display:inline-block;padding:14px 32px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;letter-spacing:0.3px">
              📹 Rejoindre le Google Meet
            </a>
            <p style="color:#9ca3af;font-size:12px;margin-top:10px">
              Ou copiez ce lien : <span style="color:#6366f1">${p.meetLink}</span>
            </p>
          </div>

          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px 18px;margin-bottom:24px">
            <p style="color:#92400e;font-size:13px;margin:0">
              ⚠️ <strong>Rappel :</strong> Le fichier d'agenda (.ics) joint à cet email vous permettra d'ajouter ce rendez-vous à votre calendrier en un clic.
            </p>
          </div>

          <p style="color:#6b7280;font-size:13px;margin:0">
            Pour toute question ou en cas d'empêchement, répondez à cet email. Nous ferons notre maximum pour trouver un nouveau créneau.
          </p>
        </div>
        <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 24px;text-align:center">
          <p style="color:#9ca3af;font-size:12px;margin:0">© Moonscale — Vous recevez cet email car vous avez réservé un appel avec notre équipe.</p>
        </div>
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
