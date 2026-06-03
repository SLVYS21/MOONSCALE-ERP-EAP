import { Injectable, Logger, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

export interface CalComSlot {
  time: string
}

export interface CalComSlotsResult {
  [date: string]: CalComSlot[]
}

export interface CalComBookingResult {
  uid: string
  id: number
  startTime: string
  endTime: string
  meetLink: string
}

@Injectable()
export class CalComService {
  private readonly logger = new Logger(CalComService.name)
  private readonly http: AxiosInstance

  constructor(private config: ConfigService) {
    const baseURL = this.config.get<string>('CALCOM_BASE_URL', 'https://cal.ecomafricapro.com')
    const apiKey  = this.config.get<string>('CALCOM_API_KEY', '')

    this.http = axios.create({
      baseURL: `${baseURL}/v1`,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    })
  }

  async getSlots(
    eventTypeId: number,
    startTime: string,
    endTime: string,
  ): Promise<CalComSlotsResult> {
    try {
      const { data } = await this.http.get('/slots', {
        params: { eventTypeId, startTime, endTime },
      })
      return (data.slots ?? {}) as CalComSlotsResult
    } catch (err: unknown) {
      this.logger.error(`Cal.com getSlots error: ${(err as Error).message}`)
      throw new BadRequestException('Impossible de récupérer les créneaux Cal.com')
    }
  }

  async createBooking(params: {
    eventTypeId: number
    start: string
    name: string
    email: string
    phone?: string | null
    timeZone?: string
  }): Promise<CalComBookingResult> {
    try {
      const { data } = await this.http.post('/bookings', {
        eventTypeId: params.eventTypeId,
        start: params.start,
        responses: {
          name: params.name,
          email: params.email,
          ...(params.phone ? { phone: params.phone } : {}),
        },
        timeZone: params.timeZone ?? 'Africa/Abidjan',
        language: 'fr',
        metadata: {},
      })

      const meetLink =
        (data as Record<string, unknown>).videoCallData !== undefined
          ? ((data as Record<string, unknown>).videoCallData as Record<string, string>)?.url
          : ((data as Record<string, unknown>).metadata as Record<string, string>)?.videoCallUrl
          ?? ((data as Record<string, unknown>).location as string)
          ?? ''

      return {
        uid:       (data as Record<string, unknown>).uid as string,
        id:        (data as Record<string, unknown>).id as number,
        startTime: (data as Record<string, unknown>).startTime as string,
        endTime:   (data as Record<string, unknown>).endTime as string,
        meetLink,
      }
    } catch (err: unknown) {
      this.logger.error(`Cal.com createBooking error: ${(err as Error).message}`)
      throw new BadRequestException('Échec de la création du booking Cal.com')
    }
  }

  async cancelBooking(bookingUid: string, reason?: string): Promise<void> {
    try {
      await this.http.delete(`/bookings/${bookingUid}`, {
        data: { reason: reason ?? "Annulé depuis l'ERP" },
      })
    } catch (err: unknown) {
      this.logger.error(`Cal.com cancelBooking error: ${(err as Error).message}`)
      throw new BadRequestException("Échec de l'annulation du booking Cal.com")
    }
  }
}
