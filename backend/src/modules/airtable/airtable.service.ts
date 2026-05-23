import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

interface AirtableRecord {
  id: string
  fields: Record<string, unknown>
  createdTime: string
}

@Injectable()
export class AirtableService {
  private readonly logger = new Logger(AirtableService.name)
  private readonly client: AxiosInstance
  private readonly baseId: string

  // IDs des tables
  readonly TABLES = {
    PAYMENTS: 'tbl28GhsfLRLdL33y',
    STUDENTS: 'tblAivp3x8I2rB6gG',
    FORMATION: 'tbl9q0IzgxJ0rE8Hc',
    COACHING: 'tblxHkUGph0gVaS4C',
  }

  constructor(private config: ConfigService) {
    this.baseId = this.config.get<string>('AIRTABLE_BASE_ID', 'appSNmx63xwb30s5F')
    this.client = axios.create({
      baseURL: `https://api.airtable.com/v0/${this.baseId}/`,
      headers: {
        Authorization: `Bearer ${this.config.get('AIRTABLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
    })
  }

  // ── Lecture ──────────────────────────────────────────────────────

  async findByEmail(email: string, table: string): Promise<AirtableRecord[]> {
    try {
      const formula = `FIND("${email.toLowerCase()}", LOWER({EMAIL}))`
      const res = await this.client.get(table, {
        params: { filterByFormula: formula, maxRecords: 10 },
      })
      return res.data.records ?? []
    } catch (err: unknown) {
      this.logger.warn(`Airtable findByEmail(${email}, ${table}): ${(err as Error).message}`)
      return []
    }
  }

  async getSample(table: string, limit = 5): Promise<AirtableRecord[]> {
    try {
      const res = await this.client.get(table, { params: { maxRecords: limit } })
      return res.data.records ?? []
    } catch (err: unknown) {
      this.logger.warn(`getSample(${table}): ${(err as Error).message}`)
      return []
    }
  }

  async getAll(table: string): Promise<AirtableRecord[]> {
    const records: AirtableRecord[] = []
    let offset: string | undefined

    do {
      const res = await this.client.get(table, {
        params: { pageSize: 100, ...(offset ? { offset } : {}) },
      })
      records.push(...(res.data.records ?? []))
      offset = res.data.offset
      // Respecter le rate limit Airtable (5 req/sec)
      if (offset) await this.sleep(250)
    } while (offset)

    return records
  }

  // ── Écriture (toutes les mutations passent par ici) ─────────────

  async createStudent(fields: Record<string, unknown>): Promise<AirtableRecord | null> {
    return this.createRecord(this.TABLES.STUDENTS, fields)
  }

  async createPayment(fields: Record<string, unknown>): Promise<AirtableRecord | null> {
    return this.createRecord(this.TABLES.PAYMENTS, fields)
  }

  async createOrUpdateFormation(
    email: string,
    fields: Record<string, unknown>,
    studentAirtableId?: string,
    circleId?: number,
  ): Promise<AirtableRecord | null> {
    const existing = await this.findByEmail(email, this.TABLES.FORMATION)
    if (existing.length > 0) {
      return this.updateRecord(this.TABLES.FORMATION, existing[0].id, fields)
    }
    return this.createRecord(this.TABLES.FORMATION, {
      ...(studentAirtableId ? { ETUDIANT: [studentAirtableId] } : {}),
      ...(circleId !== undefined ? { 'ID CIRCLE': circleId } : {}),
      ...fields,
    })
  }

  async createOrUpdateCoaching(
    email: string,
    fields: Record<string, unknown>,
    studentAirtableId?: string,
    circleId?: number,
  ): Promise<AirtableRecord | null> {
    const existing = await this.findByEmail(email, this.TABLES.COACHING)
    if (existing.length > 0) {
      return this.updateRecord(this.TABLES.COACHING, existing[0].id, fields)
    }
    return this.createRecord(this.TABLES.COACHING, {
      ...(studentAirtableId ? { 'NOM ET PRÉNOMS': [studentAirtableId] } : {}),
      ...(circleId !== undefined ? { 'ID CIRCLE': circleId } : {}),
      ...fields,
    })
  }

  async updatePaymentStatus(airtableId: string, status: 'TRAITÉ' | 'NON TRAITÉ' | 'REJETÉ') {
    return this.updateRecord(this.TABLES.PAYMENTS, airtableId, {
      'STATUT DE TRAITEMENT': status,
    })
  }

  async updateFormationStatus(
    email: string,
    paymentStatus: string,
    autoFollowUp: string,
    nextPaymentDate?: string,
  ) {
    const records = await this.findByEmail(email, this.TABLES.FORMATION)
    if (!records.length) return null
    return this.updateRecord(this.TABLES.FORMATION, records[0].id, {
      'STATUT DE PAIEMENT': paymentStatus,
      'STATUT RELANCE AUTO': autoFollowUp,
      ...(nextPaymentDate ? { 'DATE DU PROCHAIN PAIEMENT': nextPaymentDate } : {}),
    })
  }

  async updateCoachingStatus(
    email: string,
    paymentStatus: string,
    autoFollowUp: string,
    nextPaymentDate?: string,
  ) {
    const records = await this.findByEmail(email, this.TABLES.COACHING)
    if (!records.length) return null
    return this.updateRecord(this.TABLES.COACHING, records[0].id, {
      'STATUT PAIEMENT ': paymentStatus,
      'STATUT RELANCE AUTO': autoFollowUp,
      ...(nextPaymentDate ? { 'PROCHAIN PAIEMENT COACHING': nextPaymentDate } : {}),
    })
  }

  // ── Méthodes privées ─────────────────────────────────────────────

  private async createRecord(table: string, fields: Record<string, unknown>): Promise<AirtableRecord | null> {
    try {
      const res = await this.client.post(table, { fields })
      return res.data
    } catch (err: unknown) {
      this.logger.error(`Airtable create(${table}) failed: ${(err as Error).message}`)
      return null
    }
  }

  private async updateRecord(table: string, id: string, fields: Record<string, unknown>): Promise<AirtableRecord | null> {
    try {
      const res = await this.client.patch(`${table}/${id}`, { fields })
      return res.data
    } catch (err: unknown) {
      this.logger.error(`Airtable update(${table}, ${id}) failed: ${(err as Error).message}`)
      return null
    }
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms))
  }
}
