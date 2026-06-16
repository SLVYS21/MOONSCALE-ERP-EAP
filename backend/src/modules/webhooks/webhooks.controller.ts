import {
  Controller, Post, Body, Query, Headers, Req,
  HttpCode, HttpStatus, Logger, BadRequestException,
} from '@nestjs/common'
import type { RawBodyRequest } from '@nestjs/common'
import type { Request } from 'express'
import * as crypto from 'crypto'
import { StudentsService } from '../students/students.service'
import { FinancesService } from '../finances/finances.service'
import { LeadsService } from '../leads/leads.service'

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseTallyPayload(payload: Record<string, unknown>) {
  const fields = (payload?.data as Record<string, unknown>)?.fields as Array<Record<string, unknown>>
  if (!fields) return {}
  const map: Record<string, unknown> = {}
  for (const f of fields) {
    const key = f.key as string
    if (f.type === 'MULTIPLE_CHOICE' && Array.isArray(f.value)) {
      const opts = (f.options as Array<{ id: string; text: string }>).filter((o) =>
        (f.value as string[]).includes(o.id),
      )
      map[key] = opts.length === 1 ? opts[0].text : opts.map((o) => o.text)
    } else if (f.type === 'FILE_UPLOAD' && Array.isArray(f.value)) {
      map[key] = (f.value as Array<{ url: string; name: string }>).map((fi) => ({
        url: fi.url, name: fi.name,
      }))
    } else {
      map[key] = f.value
    }
  }
  return map
}

/**
 * Verify a Stripe webhook signature.
 * Stripe signs with HMAC-SHA256: `t=<timestamp>.rawBody`
 */
function verifyStripeSignature(rawBody: Buffer, sigHeader: string, secret: string): boolean {
  try {
    const parts = sigHeader.split(',')
    const timestamp = parts.find((p) => p.startsWith('t='))?.slice(2)
    const signature = parts.find((p) => p.startsWith('v1='))?.slice(3)
    if (!timestamp || !signature) return false

    // Reject events older than 5 minutes
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false

    const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`
    const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

/**
 * Verify HMAC-SHA256 signature sent as a hex header.
 * Used by PawaPay (`X-PawaPay-Signature`) and FedaPay (`X-Fedapay-Signature`).
 */
function verifyHmacHeader(rawBody: Buffer, signature: string, secret: string): boolean {
  try {
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch {
    return false
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name)

  constructor(
    private studentsService: StudentsService,
    private financesService: FinancesService,
    private leadsService: LeadsService,
  ) {}

  // ── Tally → nouveau formulaire d'inscription ──────────────────────────────

  @Post('test')
  @HttpCode(HttpStatus.OK)
  async handleTest(@Body() body: Record<string, unknown>) {
    console.log(body);
    return { received: true }
  }

  @Post('tally')
  @HttpCode(HttpStatus.OK)
  async handleTally(@Body() body: Record<string, unknown>) {
    try {
      const data = parseTallyPayload(body)
      const email = data['question_je4N41'] as string
      const name  = data['question_rD979X'] as string

      if (!email) {
        this.logger.warn('Tally webhook: no email found')
        return { message: 'ignored' }
      }

      const modality = (data['question_o98vA1'] as string) ?? 'Complet'
      const amount   = Number(data['question_BEJl7e']) || 0
      const currency = (data['question_Vp7gWj'] as string) ?? 'F CFA'
      const product  = (data['question_o9NW8b'] as string) ?? 'ECOM AFRICA PRO'
      const gateway  = data['question_GeEWOe'] as string
      const proofs   = (data['question_PRQKZ1'] as Array<{ url: string }> | undefined)?.map((f) => f.url) ?? []

      await this.studentsService.findOrCreateStudent({
        email,
        name: name ?? email,
        whatsapp: data['question_2jd0dM'] as string,
        occupation: data['question_RWepqK'] as string,
        source: data['question_xVbKbk'] as string,
      })

      await this.studentsService.createPayment({
        studentEmail: email,
        studentName: name ?? email,
        modality: modality as 'Complet' | 'Partiel',
        amount,
        currency,
        product,
        gateway,
        proofImages: proofs,
        source: 'tally',
      })

      return { message: 'success' }
    } catch (err: unknown) {
      this.logger.error(`Tally webhook error: ${(err as Error).message}`)
      throw err
    }
  }

  // ── Chariow → paiement coaching ──────────────────────────────────────────

  @Post('chariow')
  @HttpCode(HttpStatus.OK)
  async handleChariow(
    @Body() body: any,
    @Query('tag') tag: string,
    @Query() query: any
  ) {
    try {
      console.log('Chariow webhook: ', body, JSON.stringify(query, null, 2));
      const customer = body.customer as Record<string, unknown>
      const email  = customer?.email as string
      const name   = customer?.name as string
      const product = body.product as Record<string, unknown>
      const price   = (product?.price as Record<string, unknown>)
      const amount  = Number(price?.value) || Number(body.sale?.amount?.value as any) || 0
      const currency = (price?.currency as string) ?? 'XOF'
      const reference = (body.id ?? body.order_id ?? body.transaction_id) as string | undefined

      if (!email) {
        this.logger.warn('Chariow webhook: missing email')
        return { message: 'ignored' }
      }

      // Create student payment
      // const payment = await this.studentsService.createPayment({
      //   studentEmail: email,
      //   studentName: name ?? email,
      //   modality: 'Complet',
      //   amount,
      //   currency,
      //   product: 'COACHING',
      //   gateway: 'Chariow',
      //   source: 'chariow',
      // })

      // Process immediately with the Circle plan tag
      // await this.studentsService.treatPayment(
      //   (payment._id as { toString: () => string }).toString(),
      //   'system',
      //   { planKey: tag },
      // )

      const productName = (product?.name as string) ?? null

      // Log financial transaction
      await this.financesService.recordGatewayTransaction({
        gateway: 'chariow',
        type: 'income',
        amount,
        currency: this.normalizeCurrency(currency),
        description: `Coaching — ${name ?? email}`,
        reference: reference ?? null,
        date: new Date(),
        customerEmail: email ?? null,
        customerName: name ?? null,
        productName,
        metadata: { tag },
      })

      return { message: 'coaching payment processed' }
    } catch (err: unknown) {
      this.logger.error(`Chariow webhook error: ${(err as Error).message}`)
      throw err
    }
  }

  // ── Stripe ────────────────────────────────────────────────────────────────

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handleStripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sigHeader: string,
  ) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET
    const rawBody = req.rawBody

    if (secret && rawBody && sigHeader) {
      if (!verifyStripeSignature(rawBody, sigHeader, secret)) {
        this.logger.warn('Stripe webhook: invalid signature')
        throw new BadRequestException('Invalid Stripe signature')
      }
    } else if (secret) {
      this.logger.warn('Stripe webhook: missing raw body or signature header — check rawBody config')
    }

    const event = req.body as {
      id: string
      type: string
      data: { object: Record<string, unknown> }
    }

    this.logger.log(`Stripe event: ${event.type} (${event.id})`)

    try {
      await this.processStripeEvent(event.type, event.data.object, event.id)
    } catch (err: unknown) {
      this.logger.error(`Stripe event processing error: ${(err as Error).message}`)
    }

    // Always return 200 to Stripe to avoid retries on our processing errors
    return { received: true }
  }

  private async processStripeEvent(type: string, obj: Record<string, unknown>, eventId: string) {
    switch (type) {
      case 'payment_intent.succeeded': {
        const amountCents = Number(obj.amount_received ?? obj.amount)
        const currency = (obj.currency as string).toUpperCase()
        const billing = obj.billing_details as Record<string, unknown> | undefined
        const meta = obj.metadata as Record<string, unknown> | undefined
        await this.financesService.recordGatewayTransaction({
          gateway: 'stripe',
          type: 'income',
          amount: amountCents / 100,
          currency: this.normalizeCurrency(currency),
          description: (obj.description as string) || 'Stripe payment',
          reference: (obj.id as string) ?? eventId,
          date: new Date(Number(obj.created) * 1000),
          customerEmail: (billing?.email as string) ?? null,
          customerName: (billing?.name as string) ?? null,
          productName: (meta?.product as string) ?? (obj.description as string) ?? null,
          metadata: { customerId: obj.customer },
        })
        break
      }
      case 'charge.succeeded': {
        // Skip if this accompanies a payment_intent (avoid double recording)
        if (obj.payment_intent) break
        const amountCents = Number(obj.amount)
        const currency = (obj.currency as string).toUpperCase()
        const billing = obj.billing_details as Record<string, unknown> | undefined
        const meta = obj.metadata as Record<string, unknown> | undefined
        await this.financesService.recordGatewayTransaction({
          gateway: 'stripe',
          type: 'income',
          amount: amountCents / 100,
          currency: this.normalizeCurrency(currency),
          description: (obj.description as string) || 'Stripe charge',
          reference: (obj.id as string) ?? eventId,
          date: new Date(Number(obj.created) * 1000),
          customerEmail: (billing?.email as string) ?? null,
          customerName: (billing?.name as string) ?? null,
          productName: (meta?.product as string) ?? (obj.description as string) ?? null,
          metadata: { customerId: obj.customer },
        })
        break
      }
      case 'charge.refunded': {
        const refunds = obj.refunds as { data: Array<{ amount: number; created: number }> }
        const lastRefund = refunds?.data?.[0]
        if (!lastRefund) break
        const currency = (obj.currency as string).toUpperCase()
        const billing = obj.billing_details as Record<string, unknown> | undefined
        await this.financesService.recordGatewayTransaction({
          gateway: 'stripe',
          type: 'expense',
          amount: lastRefund.amount / 100,
          currency: this.normalizeCurrency(currency),
          description: `Remboursement Stripe — ${(obj.id as string)}`,
          reference: obj.id as string,
          date: new Date(lastRefund.created * 1000),
          customerEmail: (billing?.email as string) ?? null,
          customerName: (billing?.name as string) ?? null,
          metadata: { originalCharge: obj.id },
          status: 'refunded',
        })
        break
      }
      case 'payment_intent.payment_failed':
      case 'charge.failed': {
        const amountCents = Number(obj.amount)
        const currency = (obj.currency as string).toUpperCase()
        const billing = obj.billing_details as Record<string, unknown> | undefined
        await this.financesService.recordGatewayTransaction({
          gateway: 'stripe',
          type: 'income',
          amount: amountCents / 100,
          currency: this.normalizeCurrency(currency),
          description: (obj.description as string) || 'Stripe paiement échoué',
          reference: (obj.id as string) ?? eventId,
          date: new Date(Number(obj.created) * 1000),
          customerEmail: (billing?.email as string) ?? null,
          customerName: (billing?.name as string) ?? null,
          status: 'failed',
          metadata: { failureMessage: obj.failure_message },
        })
        break
      }
      default:
        this.logger.debug(`Stripe: unhandled event type ${type}`)
    }
  }

  // ── PawaPay ───────────────────────────────────────────────────────────────

  @Post('pawapay')
  @HttpCode(HttpStatus.OK)
  async handlePawaPay(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-pawapay-signature') sigHeader: string,
  ) {
    const secret = process.env.PAWAPAY_WEBHOOK_SECRET
    if (secret && sigHeader && req.rawBody) {
      if (!verifyHmacHeader(req.rawBody, sigHeader, secret)) {
        this.logger.warn('PawaPay webhook: invalid signature')
        throw new BadRequestException('Invalid PawaPay signature')
      }
    }

    const body = req.body as Record<string, unknown>
    this.logger.log(`PawaPay webhook: status=${body.status}, type=${body.depositId ? 'deposit' : 'payout'}`)

    try {
      await this.processPawaPayEvent(body)
    } catch (err: unknown) {
      this.logger.error(`PawaPay processing error: ${(err as Error).message}`)
    }

    return { received: true }
  }

  private async processPawaPayEvent(body: Record<string, unknown>) {
    const status = body.status as string
    const amount = Number(body.amount)
    const currency = (body.currency as string ?? 'XOF').toUpperCase()
    const isDeposit = !!body.depositId
    const id = (body.depositId ?? body.payoutId) as string
    const correspondent = body.correspondent as string
    const description = (body.statementDescription as string) || (isDeposit ? 'PawaPay collecte' : 'PawaPay paiement sortant')
    const createdAt = new Date((body.created ?? body.customerTimestamp) as string || Date.now())

    const payer = body.payer as Record<string, unknown> | undefined
    const payerPhone = (payer?.address as Record<string, unknown>)?.value as string | undefined

    let txStatus: 'completed' | 'failed' | 'pending' = 'pending'
    if (status === 'COMPLETED') txStatus = 'completed'
    else if (status === 'FAILED' || status === 'REJECTED') txStatus = 'failed'

    await this.financesService.recordGatewayTransaction({
      gateway: 'pawapay',
      type: isDeposit ? 'income' : 'expense',
      amount,
      currency: this.normalizeCurrency(currency),
      description,
      reference: id,
      date: createdAt,
      status: txStatus,
      customerPhone: payerPhone ?? null,
      metadata: { correspondent, recipient: body.recipient },
    })
  }

  // ── FedaPay ───────────────────────────────────────────────────────────────

  @Post('fedapay')
  @HttpCode(HttpStatus.OK)
  async handleFedaPay(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-fedapay-signature') sigHeader: string,
  ) {
    //console.log(req.body);
    const secret = process.env.FEDAPAY_WEBHOOK_SECRET;
    // if (secret && sigHeader && req.rawBody) {
    //   if (!verifyHmacHeader(req.rawBody, sigHeader, secret)) {
    //     this.logger.warn('FedaPay webhook: invalid signature')
    //     throw new BadRequestException('Invalid FedaPay signature')
    //   }
    // }

    // FedaPay sends { name: 'transaction.approved', object: 'transaction', entity: {...} }
    const body = req.body as { name: string; event?: string; entity: Record<string, unknown> }
    const eventName = body.name ?? body.event ?? 'unknown'
    this.logger.log(`FedaPay webhook: event=${eventName}`)

    try {
      await this.processFedaPayEvent(eventName, body.entity)
    } catch (err: unknown) {
      this.logger.error(`FedaPay processing error: ${(err as Error).message}`)
    }

    return { received: true }
  }

  private async processFedaPayEvent(event: string, entity: Record<string, unknown>) {
    const amount = Number(entity.amount ?? entity.amount_in_cents)

    // currency is an object: { iso: 'XOF', ... } in full webhook payloads
    const currencyObj = entity.currency as Record<string, unknown> | undefined
    const rawCurrency = (currencyObj?.iso as string) ?? 'XOF'
    const currency = this.normalizeCurrency(rawCurrency.toUpperCase())

    const reference = (entity.reference ?? entity.transaction_key ?? entity.id) as string
    const description = (entity.description as string) || 'FedaPay transaction'

    // Prefer approved_at then created_at for the transaction date
    const dateStr = (entity.approved_at ?? entity.created_at ?? entity.updated_at) as string | undefined
    const createdAt = dateStr ? new Date(dateStr) : new Date()

    // Customer object embedded in the entity
    const customer = entity.customer as Record<string, unknown> | undefined
    const customerEmail = (customer?.email as string) ?? null
    const firstName = ((customer?.firstname as string) ?? '').trim()
    const lastName  = ((customer?.lastname  as string) ?? '').trim()
    const customerName = customer?.full_name
      ? (customer.full_name as string).trim() || null
      : [firstName, lastName].filter(Boolean).join(' ') || null

    // Phone number is in payment_method.number, not customer
    const paymentMethod = entity.payment_method as Record<string, unknown> | undefined
    const customerPhone = (paymentMethod?.number as string) ?? null

    let type: 'income' | 'expense' = 'income'
    let status: 'completed' | 'failed' | 'pending' | 'refunded' = 'pending'

    switch (event) {
      case 'transaction.approved':
        status = 'completed'
        type = 'income'
        break
      case 'transaction.declined':
      case 'transaction.canceled':
        status = 'failed'
        type = 'income'
        break
      case 'transaction.refunded':
        status = 'refunded'
        type = 'expense'
        break
      default:
        this.logger.debug(`FedaPay: unhandled event ${event}`)
        return
    }

    // FedaPay descriptions are always generic payment-link text — not usable as productName
    await this.financesService.recordGatewayTransaction({
      gateway: 'fedapay',
      type,
      amount,
      currency,
      description: customerName ? `${customerName} — ${customerEmail ?? reference}` : description,
      reference: String(reference),
      date: createdAt,
      status,
      customerEmail,
      customerName,
      customerPhone,
      productName: null,
      metadata: { event, mode: entity.mode },
    })
  }

  // ── Typebot → nouveau lead ────────────────────────────────────────────────
  @Post('typebot')
  @HttpCode(HttpStatus.OK)
  async handleTypebot(
    @Body() body: Record<string, unknown>,
    @Query('utm_source') utmSource?: string,
    @Query('typebot_id') typebotId?: string,
    @Query('typebot_name') typebotName?: string,
  ) {
    /*
    {
      submittedAt: '2026-05-29T14:14:47.493Z',
      message: 'This is a sample result, it has been generated ⬇️',
      Prenom: 'answer value',
      Nom: 'answer value',
      Age: '20',
      Email: 'test@email.com',
      WhatsApp: '+33665566773',
      'Pays  de résidence': 'answer value',
      'Situation professionnelle': 'Chômeur',
      'Expérience e-commerce Afrique': 'Jamais',
      'Déjà investi en formation': 'Oui',
      'Connaissance Myril SEKOU': 'Je viens de le découvrir',
      'Motivation formation présentielle': 'answer value',
      'Objectif gain 6 mois': '0 - 300.000 FCFA',
      'Pack choisi': 'A — Moins de 200 000 FCFA  (Disqualifié)',
      'Commentaire libre': 'answer value',
      Intro: 'DÉMARRER🔥',
      'Résumé': 'Envoyer ma candidature 👍',
      'ghl-ID': 'content',
      'Ville de résidence': 'content',
      'Disponible présentiel Cotonou': 'content',
      'Revenu mensuel': 'content',
      'Mode de paiement': 'content',
      'Montant mobilisable immédiatement': 'content'
    }
*/
    try {
      console.log(body);
      const lead = await this.leadsService.handleTypebotWebhook(body, utmSource, typebotId, typebotName)
      return { message: 'success', leadId: (lead as unknown as { _id: unknown })._id }
    } catch (err: unknown) {
      this.logger.error(`Typebot webhook error: ${(err as Error).message}`)
      throw err
    }
  }

  // ── Cal.com → RDV programmé ───────────────────────────────────────────────

  @Post('calcom')
  @HttpCode(HttpStatus.OK)
  async handleCalCom(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-cal-signature-256') sigHeader: string,
  ) {
    const secret = process.env.CALCOM_WEBHOOK_SECRET
    if (secret && sigHeader && req.rawBody) {
      // Cal.com sends "sha256=<hex>"
      const hex = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader
      if (!verifyHmacHeader(req.rawBody, hex, secret)) {
        this.logger.warn('Cal.com webhook: invalid signature')
        throw new BadRequestException('Invalid Cal.com signature')
      }
    }

    const body = req.body as Record<string, unknown>
    try {
      await this.leadsService.handleCalComWebhook(body)
      return { message: 'received' }
    } catch (err: unknown) {
      this.logger.error(`Cal.com webhook error: ${(err as Error).message}`)
      throw err
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────────
  private normalizeCurrency(raw: string): string {
    const map: Record<string, string> = {
      'F CFA': 'XOF', 'FCFA': 'XOF', 'CFA': 'XOF', 'XOF': 'XOF',
      'EUR': 'EUR', 'USD': 'USD', 'MAD': 'MAD', 'CAD': 'CAD',
    }
    return map[raw.toUpperCase()] ?? 'XOF'
  }
}
