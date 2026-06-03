import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common'
import { Client, Pool } from 'pg'
import { LeadsService } from '../leads/leads.service'

@Injectable()
export class CalcomDbService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(CalcomDbService.name)
  private pool: Pool | null = null
  private listenerClient: Client | null = null
  private enabled = false
  private shuttingDown = false

  constructor(private readonly leadsService: LeadsService) {}

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async onApplicationBootstrap() {
    if (!process.env.CALCOM_DB_HOST) {
      this.logger.warn('CALCOM_DB_HOST not set — Cal.com DB integration disabled')
      return
    }

    this.enabled = true
    const config = this.dbConfig()

    this.pool = new Pool(config)
    this.pool.on('error', (err) => this.logger.error(`Cal.com DB pool error: ${err.message}`))

    await this.bootstrapTrigger()
    await this.startListening()
  }

  async onApplicationShutdown() {
    this.shuttingDown = true
    try { await this.listenerClient?.end() } catch { /* ignore */ }
    try { await this.pool?.end() } catch { /* ignore */ }
  }

  // ── Trigger bootstrap (survives Cal.com updates) ─────────────────────────────

  private async bootstrapTrigger() {
    try {
      await this.pool!.query(`
        CREATE OR REPLACE FUNCTION notify_erp_booking()
        RETURNS trigger AS $$
        BEGIN
          PERFORM pg_notify('erp_new_booking', row_to_json(NEW)::text);
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `)

      await this.pool!.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgname = 'erp_booking_notify'
          ) THEN
            CREATE TRIGGER erp_booking_notify
            AFTER INSERT ON "Booking"
            FOR EACH ROW EXECUTE FUNCTION notify_erp_booking();
          END IF;
        END;
        $$;
      `)

      this.logger.log('Cal.com DB trigger bootstrapped ✓')
    } catch (err) {
      this.logger.error(`Failed to bootstrap trigger: ${(err as Error).message}`)
    }
  }

  // ── LISTEN / NOTIFY ──────────────────────────────────────────────────────────

  private async startListening() {
    if (this.shuttingDown) return

    try {
      const client = new Client(this.dbConfig())
      await client.connect()
      await client.query('LISTEN erp_new_booking')

      client.on('notification', async (msg) => {
        if (msg.channel !== 'erp_new_booking' || !msg.payload) return
        this.logger.log(`Cal.com NOTIFY received: ${msg.payload.slice(0, 120)}`)
        try {
          const row = JSON.parse(msg.payload) as Record<string, unknown>
          await this.processBookingNotification(row)
        } catch (err) {
          this.logger.error(`Booking notification processing error: ${(err as Error).message}`)
        }
      })

      client.on('error', (err) => {
        this.logger.error(`Cal.com DB listener error: ${err.message} — reconnecting in 5s`)
        this.scheduleReconnect()
      })

      client.on('end', () => {
        if (!this.shuttingDown) {
          this.logger.warn('Cal.com DB listener connection ended — reconnecting in 5s')
          this.scheduleReconnect()
        }
      })

      this.listenerClient = client
      this.logger.log('Listening for Cal.com bookings via NOTIFY ✓')
    } catch (err) {
      this.logger.error(`Failed to start Cal.com DB listener: ${(err as Error).message} — retrying in 5s`)
      this.scheduleReconnect()
    }
  }

  private scheduleReconnect() {
    if (this.shuttingDown) return
    setTimeout(() => this.startListening(), 5000)
  }

  // ── Process a booking row from NOTIFY ────────────────────────────────────────

  private async processBookingNotification(row: Record<string, unknown>) {
    const status = (row.status as string | undefined)?.toLowerCase()
    if (status !== 'accepted') {
      this.logger.log(`Cal.com NOTIFY: booking status="${row.status}" — skipping`)
      return
    }

    const bookingId = row.id as number

    try {
      const { rows } = await this.pool!.query<{
        uid: string
        startTime: string
        endTime: string
        location: string
        meeting_url: string | null
        organizer_email: string
        organizer_name: string
        attendee_email: string
        attendee_name: string
      }>(`
        SELECT
          b.uid,
          b."startTime",
          b."endTime",
          b.location,
          br."meetingUrl" AS meeting_url,
          u.email AS organizer_email,
          u.name  AS organizer_name,
          a.email AS attendee_email,
          a.name  AS attendee_name
        FROM "Booking" b
        JOIN users u ON u.id = b."userId"
        LEFT JOIN "Attendee" a ON a."bookingId" = b.id
        LEFT JOIN "BookingReference" br ON br."bookingId" = b.id AND br."meetingUrl" IS NOT NULL
        WHERE b.id = $1
        LIMIT 1
      `, [bookingId])

      if (!rows[0]) {
        this.logger.warn(`processBookingNotification(${bookingId}): booking not found in DB`)
        return
      }
      const r = rows[0]

      // Prefer BookingReference.meetingUrl, fall back to location if it looks like a URL
      const meetLink = r.meeting_url
        ?? (r.location?.startsWith('http') ? r.location : undefined)
        ?? ''

      this.logger.log(`Cal.com BOOKING_CREATED: attendee=${r.attendee_email}, organizer=${r.organizer_email}, meet=${meetLink}`)

      await this.leadsService.handleCalComWebhook({
        triggerEvent: 'BOOKING_CREATED',
        payload: {
          uid:       r.uid,
          startTime: r.startTime,
          endTime:   r.endTime,
          location:  meetLink,
          organizer: { email: r.organizer_email, name: r.organizer_name },
          attendees: [{ email: r.attendee_email, name: r.attendee_name }],
        },
      })
    } catch (err) {
      this.logger.error(`processBookingNotification(${bookingId}) error: ${(err as Error).message}`)
    }
  }

  // ── Auto-discover booking URL for a user ─────────────────────────────────────

  async getBookingUrl(userEmail: string): Promise<string | null> {
    if (!this.enabled || !this.pool) return null

    try {
      const baseUrl = process.env.CALCOM_BASE_URL ?? 'https://cal.ecomafricapro.com'

      const { rows } = await this.pool.query<{ username: string; slug: string }>(`
        SELECT u.username, et.slug
        FROM users u
        JOIN "EventType" et ON et."userId" = u.id
        WHERE u.email = $1
          AND et."hidden" = false
        ORDER BY et."position" ASC, et.id ASC
        LIMIT 1
      `, [userEmail])

      if (!rows[0]) return null
      return `${baseUrl}/${rows[0].username}/${rows[0].slug}`
    } catch (err) {
      this.logger.error(`getBookingUrl(${userEmail}) error: ${(err as Error).message}`)
      return null
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  private dbConfig() {
    return {
      host:     process.env.CALCOM_DB_HOST!,
      port:     Number(process.env.CALCOM_DB_PORT ?? 5432),
      database: process.env.CALCOM_DB_NAME ?? 'calcom',
      user:     process.env.CALCOM_DB_USER,
      password: process.env.CALCOM_DB_PASSWORD,
    }
  }
}
