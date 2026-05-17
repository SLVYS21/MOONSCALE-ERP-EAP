import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import axios, { AxiosInstance } from 'axios'

export interface CircleMember {
  id: number
  email: string
  name: string
  created_at: string
  accepted_invitation: string
  active: boolean
  member_tags: { id: number; name: string }[]
}

export interface CirclePlanConfig {
  tag: number
  name: string
  duration: number // jours
  spaces: 'full' | 'standard' | 'none'
}

export const CIRCLE_PLANS: Record<string, CirclePlanConfig> = {
  // Formule unique — accès complet
  elite:               { tag: 231357, name: 'Elite',               duration: 360, spaces: 'full' },
  premium:             { tag: 231356, name: 'Premium',             duration: 182, spaces: 'standard' },
  standard:            { tag: 231355, name: 'Standard',            duration: 30,  spaces: 'standard' },
  member:              { tag: 190387, name: 'Membre',              duration: 30,  spaces: 'standard' },

  // All-In-One (anciens plans)
  all_in_one_monthly:  { tag: 189818, name: 'All-In-One',          duration: 90,  spaces: 'full' },
  all_in_one_semester: { tag: 189818, name: 'All-In-One',          duration: 182, spaces: 'full' },
  all_in_one_yearly:   { tag: 189818, name: 'All-In-One',          duration: 365, spaces: 'full' },

  // Produits unitaires
  produits_gagnants:         { tag: 189814, name: 'Produits Gagnants',    duration: 30,  spaces: 'standard' },
  produits_gagnants_yearly:  { tag: 189814, name: 'Produits Gagnants',    duration: 365, spaces: 'standard' },
  support_direct:            { tag: 189816, name: 'Support Direct',       duration: 30,  spaces: 'standard' },
  support_direct_yearly:     { tag: 189816, name: 'Support Direct',       duration: 365, spaces: 'standard' },
  lives_rediffusions:        { tag: 189817, name: 'Lives & Rediffusions', duration: 30,  spaces: 'standard' },
  lives_rediffusions_yearly: { tag: 189817, name: 'Lives & Rediffusions', duration: 365, spaces: 'standard' },

  // Coaching
  fin_accompagnement: { tag: 231374, name: 'Accompagnement Terminé', duration: 0, spaces: 'none' },
}

// Espaces accessibles à tous les membres actifs
const DEFAULT_SPACES = [
  1193660, 1193619, 1188388, 1158828, 1108574, 1108572, 1108569,
  1108532, 1108531, 1108530, 1108518, 1108517, 1108516,
  1105128, 1105127, 1105126, 2129713, 2041185,
]

// Espaces privés — seulement pour 'full' access plans
const PRIVATE_SPACES = [1290095, 1108523, 1108521]

@Injectable()
export class CircleService {
  private readonly logger = new Logger(CircleService.name)
  private readonly client: AxiosInstance
  private callCount = 0

  constructor(private config: ConfigService) {
    this.client = axios.create({
      baseURL: 'https://app.circle.so/api/admin/v2',
      headers: {
        Authorization: `Bearer ${this.config.get('CIRCLE_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })

    this.client.interceptors.request.use((req: import('axios').InternalAxiosRequestConfig) => {
      this.callCount++
      this.logger.log(`Circle API call #${this.callCount}: ${req.method?.toUpperCase()} ${req.url}`)
      return req
    })
  }

  get totalCallsThisSession() {
    return this.callCount
  }

  // ── Recherche membre (1 req/appel — utiliser listAllMembers pour le bulk) ──
  async searchMember(email: string) {
    try {
      const res = await this.client.get(`/community_members/search`, {
        params: { email },
      })
      // L'API retourne un objet unique (pas un tableau)
      return res.data ?? null
    } catch (err: unknown) {
      this.logger.warn(`searchMember(${email}) failed: ${(err as Error).message}`)
      return null
    }
  }

  // ── Inviter un nouveau membre ────────────────────────────────────
  async inviteMember(email: string, name: string) {
    const res = await this.client.post('/community_members', {
      email,
      name: name || email,
      skip_invitation: false,
    })
    this.logger.log(`Invited ${email} to Circle`)
    return res.data
  }

  // ── Récupérer ou créer le membre ─────────────────────────────────
  async getOrInviteMember(email: string, name: string) {
    const existing = await this.searchMember(email)
    if (existing) return existing
    return this.inviteMember(email, name)
  }

  // ── Taguer un membre avec un plan ────────────────────────────────
  async tagMember(email: string, planKey: string): Promise<CirclePlanConfig | null> {
    const plan = CIRCLE_PLANS[planKey.toLowerCase()]
    if (!plan) {
      this.logger.warn(`Unknown Circle plan: ${planKey}`)
      return null
    }
    try {
      await this.client.post('/tagged_members', {
        user_email: email,
        member_tag_id: plan.tag,
      })
      this.logger.log(`Tagged ${email} with ${plan.name}`)
      return plan
    } catch (err: unknown) {
      this.logger.warn(`tagMember(${email}, ${planKey}) failed: ${(err as Error).message}`)
      return null
    }
  }

  // ── Retirer un tag ───────────────────────────────────────────────
  async removeTag(email: string, tagId: number) {
    try {
      await this.client.delete('/member_tags', {
        params: { user_email: email, member_tag_id: tagId },
      })
      this.logger.log(`Removed tag ${tagId} from ${email}`)
    } catch (err: unknown) {
      this.logger.warn(`removeTag failed: ${(err as Error).message}`)
    }
  }

  // ── Ajouter à un espace ──────────────────────────────────────────
  async addToSpace(email: string, spaceId: number) {
    try {
      await this.client.post('/space_members', { email, space_id: spaceId })
    } catch (err: unknown) {
      this.logger.warn(`addToSpace(${email}, ${spaceId}): ${(err as Error).message}`)
    }
  }

  // ── Retirer d'un espace ──────────────────────────────────────────
  async removeFromSpace(email: string, spaceId: number) {
    try {
      await this.client.delete('/space_members', {
        params: { email, space_id: spaceId },
      })
    } catch (err: unknown) {
      this.logger.warn(`removeFromSpace(${email}, ${spaceId}): ${(err as Error).message}`)
    }
  }

  // ── Accorder l'accès complet selon le plan ───────────────────────
  async grantAccess(email: string, planKey: string) {
    const plan = CIRCLE_PLANS[planKey.toLowerCase()]
    if (!plan) return

    const spacesToAdd = plan.spaces === 'full'
      ? [...DEFAULT_SPACES, ...PRIVATE_SPACES]
      : plan.spaces === 'standard'
        ? DEFAULT_SPACES
        : []

    for (const spaceId of spacesToAdd) {
      await this.addToSpace(email, spaceId)
    }
    this.logger.log(`Granted ${plan.spaces} access to ${email} (plan: ${plan.name})`)
  }

  // ── Restreindre l'accès (partiel en retard) ──────────────────────
  async restrictAccess(email: string) {
    // Retire des espaces privés
    for (const spaceId of PRIVATE_SPACES) {
      await this.removeFromSpace(email, spaceId)
    }
    // Applique le tag "member" basique
    await this.tagMember(email, 'member')
    this.logger.log(`Restricted access for ${email} (removed from private spaces)`)
  }

  // ── Retirer complètement (accès expiré) ──────────────────────────
  async revokeAccess(email: string, currentPlanKey?: string) {
    const allSpaces = [...DEFAULT_SPACES, ...PRIVATE_SPACES]
    for (const spaceId of allSpaces) {
      await this.removeFromSpace(email, spaceId)
    }
    if (currentPlanKey) {
      const plan = CIRCLE_PLANS[currentPlanKey.toLowerCase()]
      if (plan) await this.removeTag(email, plan.tag)
    }
    this.logger.log(`Revoked all Circle access for ${email}`)
  }

  // ── Workflow complet pour un nouveau paiement traité ────────────
  async processNewPayment(email: string, name: string, planKey: string) {
    const member = await this.getOrInviteMember(email, name)
    const plan = await this.tagMember(email, planKey)
    if (plan) await this.grantAccess(email, planKey)
    return { member, plan }
  }

  // ── Bulk listing (optimisé quota) ───────────────────────────────
  // ~N/100 requêtes au lieu de N requêtes search-par-email
  async listAllMembers(
    onBatch: (members: CircleMember[]) => Promise<void>,
  ): Promise<number> {
    let page = 1
    let hasNext = true
    let total = 0

    while (hasNext) {
      const res = await this.client.get('/community_members', {
        params: { page, per_page: 100 },
      })
      const data = res.data as { records: CircleMember[]; has_next_page: boolean }
      await onBatch(data.records ?? [])
      total += (data.records ?? []).length
      hasNext = data.has_next_page ?? false
      page++
      if (hasNext) await new Promise((r) => setTimeout(r, 200))
    }

    return total
  }

  getPlanConfig(planKey: string): CirclePlanConfig | null {
    return CIRCLE_PLANS[planKey.toLowerCase()] ?? null
  }

  getNextPaymentDate(planKey: string, from = new Date()): Date {
    const plan = CIRCLE_PLANS[planKey.toLowerCase()]
    const duration = plan?.duration ?? 30
    const next = new Date(from)
    next.setDate(next.getDate() + duration)
    return next
  }
}
