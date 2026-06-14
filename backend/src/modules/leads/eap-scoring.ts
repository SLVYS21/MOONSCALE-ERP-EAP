// EAP Lead Scoring Engine
// Spec: docs métier "LEAD SCORING EAP — GUIDE OPÉRATIONNEL"
// Score max = 340 pts. Pack + Acompte = 180 pts (53%).

import { LeadQualification, ScoreBreakdownEntry } from './schemas/lead.schema'

export interface EapScoringInput {
  // Identité / éligibilité
  age: number | null
  phone: string | null
  pays: string | null
  motivation: string | null

  // Réponses brutes du formulaire (clés telles qu'envoyées par Typebot)
  q9_situation_pro: string | null            // 'Situation professionnelle'
  q10_experience_ecom: string | null         // 'Expérience e-commerce Afrique'
  q11_invest_formation: string | null        // 'Déjà investi en formation'
  q12_connaissance_myril: string | null      // 'Connaissance Myril SEKOU'
  q14_objectif_gain: string | null           // 'Objectif gain 6 mois'
  q15_pack_choisi: string | null             // 'Pack choisi'
  q16_montant_acompte: string | null         // 'Montant mobilisable immédiatement'
  commentaire_libre: string | null           // 'Commentaire libre'

  // Bonus précédemment ajoutés à la main par un closer (persistés sur le lead)
  manual_bonuses?: Array<{ rule: string; points: number; reason?: string }>
}

export interface EapScoringResult {
  score: number
  qualification: LeadQualification
  breakdown: ScoreBreakdownEntry[]
  disqualified: boolean
  disqualified_reason: string | null
  // valeurs numériques extraites — utiles pour debug / persistance
  pack_tier: 'A' | 'B' | 'C' | 'D' | 'E' | null
  acompte_amount: number | null
}

// ── Tier extraction ──────────────────────────────────────────────────────────

function extractPackTier(raw: string | null): 'A' | 'B' | 'C' | 'D' | 'E' | null {
  if (!raw) return null
  // Format attendu: "A — Moins de 200 000 FCFA", "B — Entre 200K et 1M FCFA", etc.
  const m = raw.trim().match(/^([A-E])\b/i)
  if (m) return m[1].toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E'
  // Fallback: matching par seuil monétaire si la lettre manque
  const amount = extractAmountFcfa(raw)
  if (amount === null) return null
  if (amount > 10_000_000) return 'E'
  if (amount > 3_000_000)  return 'D'
  if (amount > 1_000_000)  return 'C'
  if (amount >= 200_000)   return 'B'
  return 'A'
}

// Extrait un montant en FCFA depuis un texte libre. Gère "500K", "1M", "1 000 000".
function extractAmountFcfa(raw: string | null): number | null {
  if (!raw) return null
  const lower = raw.toLowerCase().replace(/\s| /g, '')
  // "500k" → 500 000 ; "1.5m" / "1,5m" → 1 500 000
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

// ── Points par question ─────────────────────────────────────────────────────

function packPoints(tier: 'A' | 'B' | 'C' | 'D' | 'E' | null): number {
  switch (tier) {
    case 'E': return 100
    case 'D': return 80
    case 'C': return 60
    case 'B': return 30
    default:  return 0   // A → disqualifié (géré en amont) ; null → 0
  }
}

function acomptePoints(amount: number | null): number {
  if (amount === null) return 0
  if (amount > 500_000) return 80
  if (amount >= 200_000) return 60
  if (amount >= 100_000) return 30
  return 10
}

function objectifGainPoints(raw: string | null): number {
  if (!raw) return 0
  const s = raw.toLowerCase()
  // Ordre important: tester les bornes hautes d'abord
  if (/(\+|plus de)?\s*10\s*m/i.test(s) || /10\s*000\s*000/.test(s)) return 30
  if (/(\+|plus de)?\s*5\s*m/i.test(s)  || /5\s*000\s*000/.test(s))  return 25
  if (/1\s*m.*5\s*m|1[\s-]*[à\-][\s]*5\s*m/i.test(s)) return 20
  if (/500\s*k.*1\s*m|500[\s-]*[à\-][\s]*1\s*m/i.test(s)) return 15
  if (/300\s*k.*500\s*k/i.test(s)) return 10
  if (/0.*300\s*k/i.test(s)) return 5
  // Fallback par seuil numérique si format inattendu
  const amount = extractAmountFcfa(raw)
  if (amount === null) return 0
  if (amount > 10_000_000) return 30
  if (amount > 5_000_000)  return 25
  if (amount >= 1_000_000) return 20
  if (amount >= 500_000)   return 15
  if (amount >= 300_000)   return 10
  return 5
}

function connaissanceMyrilPoints(raw: string | null): number {
  if (!raw) return 0
  const s = raw.toLowerCase()
  if (/\+\s*3\s*ans|plus de 3 ans|3\s*ans? et plus/.test(s)) return 25
  if (/\+\s*2\s*ans|plus de 2 ans|2\s*ans/.test(s)) return 20
  if (/\+\s*1\s*an|plus d['’]un an|1\s*an\b/.test(s)) return 15
  if (/3\s*[à\-]\s*12\s*mois|entre 3 et 12 mois/.test(s)) return 10
  if (/1\s*[à\-]\s*3\s*mois|entre 1 et 3 mois/.test(s)) return 7
  if (/viens de.*d[ée]couvrir|d[ée]couverte|nouveau/.test(s)) return 3
  return 0
}

function experienceEcomPoints(raw: string | null): number {
  if (!raw) return 0
  const s = raw.toLowerCase()
  if (/vends d[ée]j[àa]|d[ée]j[àa].*vends?|je vends/.test(s)) return 20
  if (/essay[ée]/.test(s)) return 15
  if (/jamais/.test(s)) return 5
  return 0
}

function investFormationPoints(raw: string | null): number {
  if (!raw) return 0
  const s = raw.toLowerCase().trim()
  if (s === 'oui' || /^oui\b/.test(s)) return 15
  if (s === 'non' || /^non\b/.test(s)) return 3
  return 0
}

function situationProPoints(raw: string | null): number {
  if (!raw) return 0
  const s = raw.toLowerCase()
  if (/entrepreneur/.test(s)) return 20
  if (/freelance/.test(s)) return 15
  if (/salari[ée]/.test(s)) return 12
  if (/artisan/.test(s)) return 10
  if (/[ée]tudiant/.test(s)) return 7
  if (/ch[ôo]meur|sans emploi/.test(s)) return 3
  return 0
}

// ── Bonus auto ──────────────────────────────────────────────────────────────

const DIASPORA_COUNTRIES = [
  'france', 'canada', 'usa', 'états-unis', 'etats-unis', 'united states',
  'belgique', 'suisse', 'allemagne', 'italie', 'espagne', 'portugal',
  'pays-bas', 'royaume-uni', 'angleterre', 'uk', 'royaume uni',
  'irlande', 'luxembourg', 'autriche', 'suède', 'norvège', 'danemark',
  'finlande',
]

function diasporaBonus(pays: string | null): { points: number; detail: string } | null {
  if (!pays) return null
  const s = pays.toLowerCase().trim()
  for (const country of DIASPORA_COUNTRIES) {
    if (s.includes(country)) return { points: 15, detail: `Diaspora — ${pays}` }
  }
  return null
}

function motivationBonus(motivation: string | null): { points: number; detail: string } | null {
  if (!motivation) return null
  const text = motivation.trim()
  // Heuristique: >= 80 caractères + ponctuation (signe de phrases) = motivation rédigée
  const hasPunctuation = /[.!?]/.test(text)
  if (text.length >= 80 && hasPunctuation) {
    return { points: 10, detail: `Motivation rédigée (${text.length} chars)` }
  }
  return null
}

function retourEapBonus(commentaire: string | null): { points: number; detail: string } | null {
  if (!commentaire) return null
  const s = commentaire.toLowerCase()
  // Détection: ancien étudiant EAP mentionnant son retour
  if (/(d[ée]j[àa].*(?:eap|formation|étudiant))|(?:ancien.*(?:eap|étudiant))|(?:reviens|retour).*(?:eap|formation)/.test(s)) {
    return { points: 20, detail: 'Mention "ancien étudiant EAP" détectée' }
  }
  return null
}

function incoherencePackAcomptePenalty(
  pack: 'A' | 'B' | 'C' | 'D' | 'E' | null,
  acompte: number | null,
): { points: number; detail: string } | null {
  if (!pack || acompte === null) return null
  // Incohérence: pack premium (D/E = 3M+) mais acompte ridicule (<100K)
  if ((pack === 'D' || pack === 'E') && acompte < 100_000) {
    return { points: -20, detail: `Incohérence: pack ${pack} (3M+) avec acompte < 100K` }
  }
  // Incohérence: pack A/B (< 1M) mais acompte énorme (>1M) → suspect aussi
  if ((pack === 'A' || pack === 'B') && acompte > 1_000_000) {
    return { points: -20, detail: `Incohérence: pack ${pack} avec acompte > 1M` }
  }
  return null
}

// ── Qualification tier ──────────────────────────────────────────────────────

function qualificationFromScore(score: number): LeadQualification {
  if (score >= 220) return 'HOT_A'
  if (score >= 150) return 'HOT_B'
  if (score >= 90)  return 'WARM'
  if (score >= 50)  return 'COLD'
  return 'OUT_OF_TARGET'
}

// ── Disqualification ────────────────────────────────────────────────────────

function isValidWhatsApp(phone: string | null): boolean {
  if (!phone) return false
  const digits = phone.replace(/\D/g, '')
  // Minimum 8 chiffres (couvre formats africains 8-10 + indicatifs internationaux)
  return digits.length >= 8
}

function checkDisqualification(
  input: EapScoringInput,
  packTier: 'A' | 'B' | 'C' | 'D' | 'E' | null,
): string | null {
  if (packTier === 'A') return 'Pack A — Moins de 200 000 FCFA (sous le minimum)'
  if (input.age !== null && input.age < 18) return `Âge < 18 ans (${input.age})`
  if (!isValidWhatsApp(input.phone)) return 'Numéro WhatsApp manquant ou invalide'
  return null
}

// ── Engine principal ────────────────────────────────────────────────────────

export function scoreEapLead(input: EapScoringInput): EapScoringResult {
  const packTier = extractPackTier(input.q15_pack_choisi)
  const acompteAmount = extractAmountFcfa(input.q16_montant_acompte)

  // Disqualification immédiate
  const dqReason = checkDisqualification(input, packTier)
  if (dqReason) {
    return {
      score: 0,
      qualification: 'DISQUALIFIED',
      breakdown: [{ rule: 'Disqualification', points: 0, detail: dqReason }],
      disqualified: true,
      disqualified_reason: dqReason,
      pack_tier: packTier,
      acompte_amount: acompteAmount,
    }
  }

  const breakdown: ScoreBreakdownEntry[] = []
  const add = (rule: string, points: number, detail?: string) => {
    if (points !== 0) breakdown.push({ rule, points, detail: detail ?? '' })
  }

  // Critères principaux
  add('Q15 Pack choisi',           packPoints(packTier),                       packTier ? `Pack ${packTier}` : 'Non renseigné')
  add('Q16 Acompte mobilisable',    acomptePoints(acompteAmount),               acompteAmount ? `${acompteAmount.toLocaleString('fr-FR')} FCFA` : 'Non renseigné')
  add('Q14 Objectif gain',          objectifGainPoints(input.q14_objectif_gain), input.q14_objectif_gain ?? '')
  add('Q12 Connaissance Myril',     connaissanceMyrilPoints(input.q12_connaissance_myril), input.q12_connaissance_myril ?? '')
  add('Q10 Expérience e-commerce',  experienceEcomPoints(input.q10_experience_ecom), input.q10_experience_ecom ?? '')
  add('Q11 Investi en formation',   investFormationPoints(input.q11_invest_formation), input.q11_invest_formation ?? '')
  add('Q9 Situation pro',           situationProPoints(input.q9_situation_pro), input.q9_situation_pro ?? '')

  // Bonus auto
  const diaspora = diasporaBonus(input.pays)
  if (diaspora) add('Bonus diaspora', diaspora.points, diaspora.detail)

  const motivation = motivationBonus(input.motivation)
  if (motivation) add('Bonus motivation', motivation.points, motivation.detail)

  const retour = retourEapBonus(input.commentaire_libre ?? input.motivation)
  if (retour) add('Bonus étudiant EAP retour', retour.points, retour.detail)

  const incoherence = incoherencePackAcomptePenalty(packTier, acompteAmount)
  if (incoherence) add('Malus incohérence', incoherence.points, incoherence.detail)

  // Bonus manuels (ajoutés via UI par un closer)
  for (const mb of input.manual_bonuses ?? []) {
    add(mb.rule, mb.points, mb.reason)
  }

  const score = breakdown.reduce((sum, b) => sum + b.points, 0)
  const qualification = qualificationFromScore(score)

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

// ── Mapping qualification → pipeline ────────────────────────────────────────

import type { PipelineStatus } from './schemas/lead.schema'

const QUALIFICATION_RANK: Record<LeadQualification, number> = {
  HOT_A: 5, HOT_B: 4, WARM: 3, COLD: 2, OUT_OF_TARGET: 1, DISQUALIFIED: 0,
}

// Pipelines plus avancés que ce que le scoring peut produire — on n'écrase jamais
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

// Export pour réutilisation
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
