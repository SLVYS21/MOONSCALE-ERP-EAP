// EAP Lead Scoring Engine — data-driven version
// Toutes les règles sont en DB (EapScoringRule). Cette version reste une fonction
// pure : elle reçoit en entrée les règles, la config (seuils) et les valeurs du
// lead, puis calcule score + qualification.

import { LeadQualification, ScoreBreakdownEntry } from './schemas/lead.schema'
import type {
  EapScoringRule,
  EapRuleCategory,
  EapMatchType,
  EapSourceField,
  MatchConfig,
} from './schemas/eap-scoring-rule.schema'

export interface EapScoringInput {
  // Identité / éligibilité
  age: number | null
  phone: string | null
  pays: string | null
  motivation: string | null

  // Réponses brutes du formulaire (clés telles qu'envoyées par Typebot)
  q9_situation_pro: string | null
  q10_experience_ecom: string | null
  q11_invest_formation: string | null
  q12_connaissance_myril: string | null
  q14_objectif_gain: string | null
  q15_pack_choisi: string | null
  q16_montant_acompte: string | null
  commentaire_libre: string | null

  // Bonus précédemment ajoutés à la main par un closer (persistés sur le lead)
  manual_bonuses?: Array<{ rule: string; points: number; reason?: string }>
}

export interface EapScoringResult {
  score: number
  qualification: LeadQualification
  breakdown: ScoreBreakdownEntry[]
  disqualified: boolean
  disqualified_reason: string | null
  pack_tier: 'A' | 'B' | 'C' | 'D' | 'E' | null
  acompte_amount: number | null
}

export interface EapScoringThresholds {
  hot_a: number
  hot_b: number
  warm: number
  cold: number
}

// ── Helpers de base ─────────────────────────────────────────────────────────

function getFieldValue(input: EapScoringInput, field: EapSourceField | undefined): string | null {
  if (!field) return null
  const v = (input as unknown as Record<string, unknown>)[field]
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return v
  return null
}

function extractPackTier(raw: string | null): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  if (!raw) return null
  const m = raw.trim().match(/^([A-E])\b/i)
  if (m) return m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E'
  const amount = extractAmountFcfa(raw)
  if (amount === null) return null
  if (amount > 10_000_000) return 'E'
  if (amount > 3_000_000)  return 'D'
  if (amount > 1_000_000)  return 'C'
  if (amount >= 200_000)   return 'B'
  return 'A'
}

function extractAmountFcfa(raw: string | null): number | null {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/\s| /g, '')
  const km = lower.match(/(\d+(?:[.,]\d+)?)([km])/)
  if (km) {
    const n = parseFloat(km[1].replace(',', '.'))
    const mult = km[2] === 'm' ? 1_000_000 : 1_000
    return Math.round(n * mult)
  }
  const digits = lower.replace(/[^\d]/g, '')
  if (!digits) return null
  return Number(digits)
}

function isValidWhatsApp(phone: string | null): boolean {
  if (!phone) return false
  return phone.replace(/\D/g, '').length >= 8
}

// ── Moteur de matching générique ────────────────────────────────────────────

interface MatchOutcome {
  matched: boolean
  detail: string
}

function evaluateRule(
  rule: EapScoringRule,
  input: EapScoringInput,
  packTier: 'A' | 'B' | 'C' | 'D' | 'E' | null,
  acompteAmount: number | null,
): MatchOutcome {
  const cfg: MatchConfig = rule.match_config ?? {}
  const type: EapMatchType = rule.match_type

  switch (type) {
    case 'pack_tier': {
      const matched = !!cfg.tier && packTier === cfg.tier
      return { matched, detail: matched ? `Pack ${cfg.tier}` : '' }
    }

    case 'amount_range': {
      const raw = getFieldValue(input, cfg.field)
      const amount = cfg.field === 'q16_montant_acompte' ? acompteAmount : extractAmountFcfa(raw)
      if (amount === null) return { matched: false, detail: '' }
      const min = cfg.min_amount
      const max = cfg.max_amount
      if (min !== null && min !== undefined && amount < min) return { matched: false, detail: '' }
      if (max !== null && max !== undefined && amount > max) return { matched: false, detail: '' }
      return { matched: true, detail: `${amount.toLocaleString('fr-FR')} FCFA` }
    }

    case 'regex': {
      const raw = getFieldValue(input, cfg.field)
      if (!raw || !cfg.pattern) return { matched: false, detail: '' }
      try {
        const flags = cfg.case_insensitive === false ? '' : 'i'
        const re = new RegExp(cfg.pattern, flags)
        const m = re.exec(raw)
        return { matched: !!m, detail: m ? raw.slice(0, 80) : '' }
      } catch {
        return { matched: false, detail: 'regex invalide' }
      }
    }

    case 'text_length': {
      const raw = getFieldValue(input, cfg.field)
      if (!raw) return { matched: false, detail: '' }
      const text = raw.trim()
      const minLen = cfg.min_length ?? 0
      if (text.length < minLen) return { matched: false, detail: '' }
      if (cfg.requires_punctuation && !/[.!?]/.test(text)) return { matched: false, detail: '' }
      return { matched: true, detail: `${text.length} caractères` }
    }

    case 'contains_any': {
      const raw = getFieldValue(input, cfg.field)
      if (!raw || !Array.isArray(cfg.values) || cfg.values.length === 0) return { matched: false, detail: '' }
      const s = raw.toLowerCase().trim()
      for (const v of cfg.values) {
        if (s.includes(v.toLowerCase())) return { matched: true, detail: `Détecté: ${v}` }
      }
      return { matched: false, detail: '' }
    }

    case 'pack_acompte_combo': {
      if (!packTier || acompteAmount === null) return { matched: false, detail: '' }
      const tiers = cfg.pack_tiers ?? []
      if (!tiers.includes(packTier)) return { matched: false, detail: '' }
      const threshold = cfg.acompte_threshold
      if (threshold === undefined || threshold === null) return { matched: false, detail: '' }
      const cmp = cfg.acompte_compare ?? '<'
      const ok = cmp === '<' ? acompteAmount < threshold : acompteAmount > threshold
      if (!ok) return { matched: false, detail: '' }
      return {
        matched: true,
        detail: `Pack ${packTier} ${cmp} ${threshold.toLocaleString('fr-FR')} (acompte ${acompteAmount.toLocaleString('fr-FR')})`,
      }
    }

    case 'age_below': {
      const threshold = cfg.age_threshold
      if (input.age === null || threshold === undefined) return { matched: false, detail: '' }
      return input.age < threshold
        ? { matched: true, detail: `Âge ${input.age} < ${threshold}` }
        : { matched: false, detail: '' }
    }

    case 'phone_invalid': {
      return isValidWhatsApp(input.phone)
        ? { matched: false, detail: '' }
        : { matched: true, detail: input.phone ? 'Format invalide' : 'Numéro manquant' }
    }

    default:
      return { matched: false, detail: '' }
  }
}

// Catégories où on cumule toutes les règles qui matchent (au lieu de "single-pick")
const ADDITIVE_CATEGORIES = new Set<EapRuleCategory>(['bonus', 'malus'])

// ── Moteur principal ────────────────────────────────────────────────────────

export function scoreEapLead(
  input: EapScoringInput,
  rules: EapScoringRule[],
  thresholds: EapScoringThresholds,
): EapScoringResult {
  const activeRules = rules.filter((r) => r.is_active)

  // Pré-extractions globales (utilisées par plusieurs matchers)
  const packTier = extractPackTier(input.q15_pack_choisi)
  const acompteAmount = extractAmountFcfa(input.q16_montant_acompte)

  // 1) Disqualifications — toute règle 'disqualification' qui matche disqualifie
  const dqRules = activeRules
    .filter((r) => r.category === 'disqualification')
    .sort((a, b) => b.priority - a.priority)
  for (const r of dqRules) {
    const out = evaluateRule(r, input, packTier, acompteAmount)
    if (out.matched) {
      return {
        score: 0,
        qualification: 'DISQUALIFIED',
        breakdown: [{ rule: 'Disqualification', points: 0, detail: r.disqualification_reason || r.label }],
        disqualified: true,
        disqualified_reason: r.disqualification_reason || r.label,
        pack_tier: packTier,
        acompte_amount: acompteAmount,
      }
    }
  }

  // 2) Catégories single-pick + additives
  const breakdown: ScoreBreakdownEntry[] = []
  const byCategory = new Map<EapRuleCategory, EapScoringRule[]>()
  for (const r of activeRules) {
    if (r.category === 'disqualification') continue
    const arr = byCategory.get(r.category) ?? []
    arr.push(r)
    byCategory.set(r.category, arr)
  }

  for (const [category, list] of byCategory) {
    list.sort((a, b) => b.priority - a.priority)
    if (ADDITIVE_CATEGORIES.has(category)) {
      // Cumul de toutes les règles qui matchent
      for (const r of list) {
        const out = evaluateRule(r, input, packTier, acompteAmount)
        if (out.matched && r.points !== 0) {
          breakdown.push({ rule: r.label, points: r.points, detail: out.detail })
        }
      }
    } else {
      // Single-pick: première règle qui matche selon priorité
      for (const r of list) {
        const out = evaluateRule(r, input, packTier, acompteAmount)
        if (out.matched) {
          if (r.points !== 0) breakdown.push({ rule: r.label, points: r.points, detail: out.detail })
          break
        }
      }
    }
  }

  // 3) Bonus manuels (ajoutés via UI par un closer)
  for (const mb of input.manual_bonuses ?? []) {
    if (mb.points !== 0) breakdown.push({ rule: mb.rule, points: mb.points, detail: mb.reason ?? '' })
  }

  const score = breakdown.reduce((sum, b) => sum + b.points, 0)
  const qualification = qualificationFromScore(score, thresholds)

  return {
    score,
    qualification,
    breakdown,
    disqualified: false,
    disqualified_reason: null,
    pack_tier: packTier,
    acompte_amount: acompteAmount,
  }
}

function qualificationFromScore(score: number, t: EapScoringThresholds): LeadQualification {
  if (score >= t.hot_a) return 'HOT_A'
  if (score >= t.hot_b) return 'HOT_B'
  if (score >= t.warm)  return 'WARM'
  if (score >= t.cold)  return 'COLD'
  return 'OUT_OF_TARGET'
}

// ── Mapping qualification → pipeline ────────────────────────────────────────

import type { PipelineStatus } from './schemas/lead.schema'

const QUALIFICATION_RANK: Record<LeadQualification, number> = {
  HOT_A: 5, HOT_B: 4, WARM: 3, COLD: 2, OUT_OF_TARGET: 1, DISQUALIFIED: 0,
}

const ADVANCED_PIPELINES = new Set<PipelineStatus>(['rdv_programme', 'appel_diagnostic', 'won', 'lost'])

const QUALIFICATION_TO_PIPELINE: Record<LeadQualification, PipelineStatus> = {
  HOT_A: 'sql',
  HOT_B: 'sql',
  WARM: 'mql',
  COLD: 'nurturing',
  OUT_OF_TARGET: 'nurturing',
  DISQUALIFIED: 'nurturing',
}

export function nextPipelineStatus(
  current: PipelineStatus | undefined,
  qualification: LeadQualification,
): PipelineStatus {
  if (current && ADVANCED_PIPELINES.has(current)) return current
  return QUALIFICATION_TO_PIPELINE[qualification]
}

export { QUALIFICATION_RANK }

// ── Extraction depuis le payload Typebot ────────────────────────────────────

export function extractEapInputFromTypebot(
  payload: Record<string, unknown>,
  parsed: { age: unknown; phone: unknown; pays: string | null; motivation: unknown },
): EapScoringInput {
  const str = (key: string): string | null => {
    const v = payload[key]
    return v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : null
  }
  return {
    age: parsed.age ? Number(parsed.age) || null : null,
    phone: parsed.phone ? String(parsed.phone) : null,
    pays: parsed.pays,
    motivation: parsed.motivation ? String(parsed.motivation) : null,
    q9_situation_pro:        str('Situation professionnelle'),
    q10_experience_ecom:     str('Expérience e-commerce Afrique'),
    q11_invest_formation:    str('Déjà investi en formation'),
    q12_connaissance_myril:  str('Connaissance Myril SEKOU'),
    q14_objectif_gain:       str('Objectif gain 6 mois'),
    q15_pack_choisi:         str('Pack choisi'),
    q16_montant_acompte:     str('Montant mobilisable immédiatement'),
    commentaire_libre:       str('Commentaire libre'),
  }
}
