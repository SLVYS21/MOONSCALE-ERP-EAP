/**
 * score-historical-leads.ts
 *
 * Rejoue le moteur EAP scoring sur TOUS les leads source_type='typebot'.
 * Reconstruit l'input EapScoringInput depuis les champs du lead + dynamic_fields,
 * calcule score + qualification + breakdown, et (en mode --apply) persiste le
 * résultat sans rétrograder les leads déjà passés au-delà de SQL.
 *
 * Modes :
 *   par défaut  → DRY RUN, n'écrit rien, affiche le résumé
 *   --apply     → persiste les résultats en BDD + promeut le pipeline_status
 *
 * Usage :
 *   # Dry run (recommandé en premier)
 *   npx ts-node -r tsconfig-paths/register src/scripts/score-historical-leads.ts
 *
 *   # Applique réellement
 *   npx ts-node -r tsconfig-paths/register src/scripts/score-historical-leads.ts --apply
 *
 *   # Limite à N leads (debug)
 *   N=20 npx ts-node -r tsconfig-paths/register src/scripts/score-historical-leads.ts
 *
 * Variables d'environnement :
 *   MONGODB_URI       — URI Mongo (défaut : mongodb://localhost:27017/moonscale-erp)
 *   N                 — limiter le nombre de leads traités (défaut : tous)
 *   SHOW_BREAKDOWN    — "true" pour logger le détail des points par lead
 */

import * as dotenv from 'dotenv'
import * as path from 'node:path'
import mongoose, { Types } from 'mongoose'

import { scoreEapLead, nextPipelineStatus, EapScoringThresholds } from '../modules/leads/eap-scoring'
import type { EapScoringRule } from '../modules/leads/schemas/eap-scoring-rule.schema'
import { EAP_SCORING_SEED } from '../modules/leads/eap-scoring-seed'
import type { LeadQualification, PipelineStatus } from '../modules/leads/schemas/lead.schema'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// ── Params ────────────────────────────────────────────────────────────────────

const MONGODB_URI    = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/moonscale-erp'
const APPLY          = process.argv.includes('--apply')
const N              = process.env.N ? parseInt(process.env.N, 10) : 0     // 0 = tous
const SHOW_BREAKDOWN = process.env.SHOW_BREAKDOWN === 'true'

// ── Schema léger (strict:false → on lit tous les champs sans dépendre du modèle Nest) ──

const LeadSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'leads', timestamps: true },
)

type RawLead = {
  _id: Types.ObjectId
  name?: string
  email?: string | null
  phone?: string | null
  age?: number | null
  pays?: string | null
  motivation?: string
  budget?: number | null
  reseau_source?: string | null
  pipeline_status?: PipelineStatus
  source_type?: string
  qualification?: LeadQualification | null
  score?: number
  manual_bonuses?: Array<{ rule: string; points: number; reason?: string }>
  dynamic_fields?: Record<string, unknown>
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function str(dyn: Record<string, unknown>, key: string): string | null {
  const v = dyn[key]
  return v !== null && v !== undefined && String(v).trim() !== '' ? String(v).trim() : null
}

function pad(s: string | number, len: number): string {
  const str = String(s)
  return str.length >= len ? str : str + ' '.repeat(len - str.length)
}

const QUAL_EMOJI: Record<LeadQualification, string> = {
  HOT_A: '🔴', HOT_B: '🟠', WARM: '🟡', COLD: '🟢',
  OUT_OF_TARGET: '⚪', DISQUALIFIED: '❌',
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔌  Connexion à MongoDB…')
  await mongoose.connect(MONGODB_URI)
  console.log('✅  Connecté.\n')

  const Lead = mongoose.model('Lead', LeadSchema)

  const filter = { source_type: 'typebot' }
  const query = Lead.find(filter).sort({ createdAt: -1 })
  if (N > 0) query.limit(N)

  const leads = await query.lean() as RawLead[]

  // Charger les règles EAP + seuils depuis la DB (fallback seed si vide)
  const EapRuleModel = mongoose.model('EapScoringRule', new mongoose.Schema({}, { strict: false, collection: 'eapscoringrules' }))
  const ScoringConfigModel = mongoose.model('ScoringConfig', new mongoose.Schema({}, { strict: false, collection: 'scoringconfigs' }))
  const dbRules = await EapRuleModel.find().lean() as unknown as EapScoringRule[]
  const rules: EapScoringRule[] = dbRules.length > 0 ? dbRules : (EAP_SCORING_SEED as unknown as EapScoringRule[])
  const cfg = await ScoringConfigModel.findOne().lean() as { eap_hot_a_threshold?: number; eap_hot_b_threshold?: number; eap_warm_threshold?: number; eap_cold_threshold?: number } | null
  const thresholds: EapScoringThresholds = {
    hot_a: cfg?.eap_hot_a_threshold ?? 220,
    hot_b: cfg?.eap_hot_b_threshold ?? 150,
    warm:  cfg?.eap_warm_threshold  ?? 90,
    cold:  cfg?.eap_cold_threshold  ?? 50,
  }
  console.log(`📜  Règles EAP : ${rules.length} chargées${dbRules.length === 0 ? ' (seed fallback)' : ''}`)

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`📊  Lead Scoring EAP — Migration historique`)
  console.log(`🏃  Mode       : ${APPLY ? '⚠️  APPLY (écrit en BDD)' : '🔍 DRY RUN (simulation)'}`)
  console.log(`📨  Périmètre  : source_type='typebot'${N > 0 ? `, limit=${N}` : ' (tous)'}`)
  console.log(`📈  Trouvés    : ${leads.length} lead(s)`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  // Compteurs
  const counts: Record<LeadQualification, number> = {
    HOT_A: 0, HOT_B: 0, WARM: 0, COLD: 0, OUT_OF_TARGET: 0, DISQUALIFIED: 0,
  }
  type Scored = {
    lead: RawLead
    score: number
    qualification: LeadQualification
    disqualified_reason: string | null
    pack_tier: string | null
    acompte: number | null
    pipeline_before: PipelineStatus | undefined
    pipeline_after: PipelineStatus
  }
  const scored: Scored[] = []
  let errors = 0
  let promoted = 0

  for (const lead of leads) {
    try {
      const dyn = (lead.dynamic_fields ?? {}) as Record<string, unknown>
      const result = scoreEapLead({
        age: lead.age ?? null,
        phone: lead.phone ?? null,
        pays: lead.pays ?? null,
        motivation: lead.motivation ?? null,
        q9_situation_pro:        str(dyn, 'Situation professionnelle'),
        q10_experience_ecom:     str(dyn, 'Expérience e-commerce Afrique'),
        q11_invest_formation:    str(dyn, 'Déjà investi en formation'),
        q12_connaissance_myril:  str(dyn, 'Connaissance Myril SEKOU') ?? lead.reseau_source ?? null,
        q14_objectif_gain:       str(dyn, 'Objectif gain 6 mois'),
        q15_pack_choisi:         str(dyn, 'Pack choisi'),
        q16_montant_acompte:     str(dyn, 'Montant mobilisable immédiatement') ?? (lead.budget ? String(lead.budget) : null),
        commentaire_libre:       str(dyn, 'Commentaire libre'),
        manual_bonuses:          lead.manual_bonuses ?? [],
      }, rules, thresholds)

      counts[result.qualification]++
      const pipelineBefore = lead.pipeline_status
      const pipelineAfter = nextPipelineStatus(pipelineBefore, result.qualification)
      if (pipelineAfter !== pipelineBefore) promoted++

      scored.push({
        lead,
        score: result.score,
        qualification: result.qualification,
        disqualified_reason: result.disqualified_reason,
        pack_tier: result.pack_tier,
        acompte: result.acompte_amount,
        pipeline_before: pipelineBefore,
        pipeline_after: pipelineAfter,
      })

      if (SHOW_BREAKDOWN) {
        console.log(`  ${QUAL_EMOJI[result.qualification]} ${pad(lead.email ?? lead._id.toString(), 38)} score=${pad(result.score, 4)} ${result.qualification}`)
        for (const b of result.breakdown) {
          console.log(`        ${pad(b.rule, 32)} ${b.points >= 0 ? '+' : ''}${b.points}  ${b.detail ? `(${b.detail})` : ''}`)
        }
      }

      if (APPLY) {
        const update: Record<string, unknown> = {
          score: result.score,
          qualification: result.qualification,
          disqualified_reason: result.disqualified_reason,
          score_breakdown: result.breakdown,
        }
        if (pipelineAfter !== pipelineBefore) update.pipeline_status = pipelineAfter
        await Lead.updateOne({ _id: lead._id }, { $set: update })
      }
    } catch (err) {
      console.error(`❌  Lead ${lead._id}: ${(err as Error).message}`)
      errors++
    }
  }

  // ── Résumé ──────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊  Distribution par qualification')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const total = leads.length
  const line = (label: string, qual: LeadQualification) => {
    const c = counts[qual]
    const pct = total > 0 ? ((c / total) * 100).toFixed(1) : '0.0'
    console.log(`  ${QUAL_EMOJI[qual]} ${pad(label, 22)} ${pad(c, 5)}  ${pct}%`)
  }
  line('HOT A (Coaching 2M+)', 'HOT_A')
  line('HOT B (Elite 300K)',   'HOT_B')
  line('WARM (Formation 200K)', 'WARM')
  line('COLD (Nurturing)',     'COLD')
  line('Hors cible',           'OUT_OF_TARGET')
  line('Disqualifiés',         'DISQUALIFIED')

  console.log(`\n  Pipeline promus : ${promoted} (${total > 0 ? ((promoted / total) * 100).toFixed(1) : 0}%)`)
  console.log(`  Erreurs         : ${errors}`)
  console.log(`  Total traité    : ${total}`)

  // ── Top 10 ──────────────────────────────────────────────────────────────────
  const top = [...scored]
    .filter((s) => s.qualification !== 'DISQUALIFIED')
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)

  if (top.length) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('🏆  Top 10 — meilleurs leads scorés')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`  ${pad('Email', 40)} ${pad('Score', 6)} ${pad('Qualif', 8)} Pack/Acompte`)
    for (const s of top) {
      const id = s.lead.email ?? String(s.lead._id)
      const ac = s.acompte !== null ? `${(s.acompte / 1000).toFixed(0)}K` : '—'
      console.log(`  ${QUAL_EMOJI[s.qualification]} ${pad(id, 38)} ${pad(s.score, 6)} ${pad(s.qualification, 8)} ${s.pack_tier ?? '—'} / ${ac}`)
    }
  }

  // ── Bottom (disqualifiés) ───────────────────────────────────────────────────
  const dq = scored.filter((s) => s.qualification === 'DISQUALIFIED').slice(0, 10)
  if (dq.length) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`❌  Disqualifiés (10 premiers sur ${counts.DISQUALIFIED})`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    for (const s of dq) {
      const id = s.lead.email ?? String(s.lead._id)
      console.log(`  ❌ ${pad(id, 38)} ${s.disqualified_reason ?? '(raison manquante)'}`)
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if (APPLY) {
    console.log(`✅  ${total - errors} lead(s) mis à jour en BDD.`)
  } else {
    console.log(`🔍  DRY RUN — aucune écriture. Relance avec --apply pour persister.`)
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

  await mongoose.disconnect()
  console.log('🔌  Déconnecté.')
}

main().catch((err) => {
  console.error('Erreur fatale :', err)
  process.exit(1)
})
