/**
 * remediate-form-payments.ts
 *
 * Met à jour les paiements (et étudiants) existants à partir des N dernières
 * réponses du formulaire "Accès Ecom Africa Pro".
 *
 * Mapping direct des champs (pas de Groq) :
 *   f02 → studentName
 *   f04 → studentEmail
 *   f05 → student.whatsapp
 *   f06 → student.source
 *   f07 → student.occupation
 *   f08 → product
 *   f09 → gateway
 *   f10 → amount
 *   f11 → currency
 *   f12 → proofImages
 *   f13 → modality (Complet / Partiel)
 *
 * Usage :
 *   npx ts-node -r tsconfig-paths/register src/scripts/remediate-form-payments.ts
 *
 * Variables d'environnement :
 *   MONGODB_URI  — URI Mongo (défaut : mongodb://localhost:27017/moonscale-erp)
 *   FORM_ID      — _id du formulaire (défaut hardcodé ci-dessous)
 *   N            — nombre de dernières réponses à traiter (défaut : 4)
 *   DRY_RUN      — "true" pour simuler sans écrire en base
 */

import * as dotenv from 'dotenv'
import * as path from 'node:path'
import mongoose, { Types } from 'mongoose'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

// ── Params ────────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/moonscale-erp'
const FORM_ID     = process.env.FORM_ID ?? '6a094afd5e04220ef3802b6f'
const N           = parseInt(process.env.N ?? '4', 10)
const DRY_RUN     = process.env.DRY_RUN === 'true'

// ── Schémas légers ────────────────────────────────────────────────────────────

const FormSchema = new mongoose.Schema(
  { title: String, fields: { type: [Object], default: [] } },
  { strict: false, collection: 'forms' },
)

const FormResponseSchema = new mongoose.Schema(
  { formId: Types.ObjectId, answers: { type: [Object], default: [] } },
  { strict: false, collection: 'formresponses' },
)

const PaymentSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'payments', timestamps: true },
)

const StudentSchema = new mongoose.Schema(
  {},
  { strict: false, collection: 'students' },
)

// ── Mapping champs formulaire ─────────────────────────────────────────────────

interface FormFields {
  name?: string        // f02
  email?: string       // f04
  whatsapp?: string    // f05
  source?: string      // f06
  occupation?: string  // f07
  product?: string     // f08
  gateway?: string     // f09
  amount?: number      // f10
  currency?: string    // f11
  proofImages?: string[] // f12
  modalityRaw?: string // f13
}

function resolveModality(raw: string): 'Complet' | 'Partiel' {
  const lower = raw.toLowerCase()
  if (lower.includes('pas encore soldé') || lower.includes('caution')) return 'Partiel'
  return 'Complet'
}

function resolveGateway(raw: string): string {
  if (raw.toLowerCase().includes('fedapay')) return 'Fedapay'
  if (raw.toLowerCase().includes('carte')) return 'Carte Bancaire'
  return raw
}

function extractFields(answers: Array<{ fieldId: string; value: unknown }>): FormFields {
  const map: Record<string, unknown> = {}
  for (const a of answers) map[a.fieldId] = a.value

  const raw = (id: string) => {
    const v = map[id]
    if (v === null || v === undefined) return undefined
    if (Array.isArray(v)) return v.length ? String(v[0]) : undefined
    return String(v).trim() || undefined
  }

  const files = map['f12']
  const proofImages: string[] = Array.isArray(files)
    ? (files as unknown[]).map((f) => {
        if (typeof f === 'string') return f
        if (typeof f === 'object' && f !== null) {
          const obj = f as Record<string, unknown>
          return String(obj.url ?? obj.src ?? obj.fileUrl ?? '')
        }
        return ''
      }).filter(Boolean)
    : []

  const amountRaw = raw('f10')
  const amount = amountRaw
    ? parseFloat(String(amountRaw).replace(/\s/g, '').replace(',', '.'))
    : undefined

  const currencyRaw = raw('f11') ?? ''
  const currency = (['F CFA', 'EURO', 'USD'].includes(currencyRaw) ? currencyRaw : 'F CFA') as 'F CFA' | 'EURO' | 'USD'

  return {
    name:        raw('f02'),
    email:       raw('f04')?.toLowerCase(),
    whatsapp:    raw('f05'),
    source:      raw('f06'),
    occupation:  raw('f07'),
    product:     raw('f08'),
    gateway:     raw('f09') ? resolveGateway(raw('f09')!) : undefined,
    amount:      isNaN(amount!) ? undefined : amount,
    currency,
    proofImages: proofImages.length ? proofImages : undefined,
    modalityRaw: raw('f13'),
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔌  Connexion à MongoDB…`)
  await mongoose.connect(MONGODB_URI)
  console.log('✅  Connecté.\n')

  const Form         = mongoose.model('Form',         FormSchema)
  const FormResponse = mongoose.model('FormResponse', FormResponseSchema)
  const Payment      = mongoose.model('Payment',      PaymentSchema)
  const Student      = mongoose.model('Student',      StudentSchema)

  const form = await Form.findById(FORM_ID).lean() as { title?: string } | null
  if (!form) {
    console.error(`❌  Formulaire introuvable : ${FORM_ID}`)
    await mongoose.disconnect()
    process.exit(1)
  }

  console.log(`📋  Formulaire : "${form.title ?? FORM_ID}"`)
  console.log(`🔢  N          : ${N} dernières réponses`)
  console.log(`🏃  Mode       : ${DRY_RUN ? 'DRY RUN (simulation)' : 'RÉEL'}\n`)

  type RespLean = { _id: Types.ObjectId; answers: Array<{ fieldId: string; value: unknown }> }
  const responses:any = await FormResponse
    .find({ formId: new Types.ObjectId(FORM_ID) })
    .sort({ createdAt: -1 })
    .limit(N)
    .lean()

  console.log(`📨  ${responses.length} réponse(s) à traiter.\n`)

  let updated   = 0
  let noPayment = 0
  let errors    = 0

  for (const response of responses) {
    const responseId = response._id
    const fields = extractFields(response.answers)

    console.log(`\n─── Réponse ${String(responseId)} ─────────────────────────`)
    console.log(`    email       : ${fields.email ?? '(vide)'}`)
    console.log(`    nom         : ${fields.name ?? '(vide)'}`)
    console.log(`    produit     : ${fields.product ?? '(vide)'}`)
    console.log(`    montant     : ${fields.amount ?? '(vide)'} ${fields.currency ?? ''}`)
    console.log(`    gateway     : ${fields.gateway ?? '(vide)'}`)
    console.log(`    modalité    : ${fields.modalityRaw ? resolveModality(fields.modalityRaw) + ` (« ${fields.modalityRaw} »)` : '(vide)'}`)
    console.log(`    proofs      : ${fields.proofImages?.length ?? 0} fichier(s)`)

    try {
      const payment = await Payment.findOne({ responseId }).lean() as Record<string, unknown> | null

      if (!payment) {
        console.warn(`    ⚠️   Aucun paiement lié à cette réponse — ignoré`)
        noPayment++
        continue
      }

      // Champs à mettre à jour sur le paiement
      const paymentUpdate: Record<string, unknown> = {}
      if (fields.email)       paymentUpdate.studentEmail = fields.email
      if (fields.name)        paymentUpdate.studentName  = fields.name
      if (fields.product)     paymentUpdate.product      = fields.product
      if (fields.gateway)     paymentUpdate.gateway      = fields.gateway
      if (fields.amount !== undefined) paymentUpdate.amount = fields.amount
      if (fields.currency)    paymentUpdate.currency     = fields.currency
      if (fields.modalityRaw) paymentUpdate.modality     = resolveModality(fields.modalityRaw)
      if (fields.proofImages?.length) paymentUpdate.proofImages = fields.proofImages

      // Champs à mettre à jour sur l'étudiant
      const studentUpdate: Record<string, unknown> = {}
      if (fields.name)       studentUpdate.name       = fields.name
      if (fields.whatsapp)   studentUpdate.whatsapp   = fields.whatsapp
      if (fields.occupation) studentUpdate.occupation = fields.occupation
      if (fields.source)     studentUpdate.source     = fields.source

      if (DRY_RUN) {
        console.log(`    🔍  [DRY RUN] payment update :`, JSON.stringify(paymentUpdate, null, 6))
        if (Object.keys(studentUpdate).length) {
          console.log(`    🔍  [DRY RUN] student update (${fields.email}) :`, JSON.stringify(studentUpdate, null, 6))
        }
        updated++
        continue
      }

      await Payment.updateOne({ _id: payment._id }, { $set: paymentUpdate })
      console.log(`    ✅  Paiement ${String(payment._id)} mis à jour`)

      if (fields.email && Object.keys(studentUpdate).length) {
        const studentResult = await Student.updateOne(
          { email: fields.email },
          { $set: studentUpdate },
        )
        if (studentResult.matchedCount > 0) {
          console.log(`    ✅  Étudiant ${fields.email} mis à jour`)
        } else {
          console.log(`    ⚠️   Étudiant ${fields.email} introuvable en base — non mis à jour`)
        }
      }

      updated++
    } catch (err) {
      console.error(`    ❌  Erreur : ${(err as Error).message}`)
      errors++
    }
  }

  console.log('\n\n── Résumé ──────────────────────────────────────────')
  console.log(`  ${DRY_RUN ? 'Simulés' : 'Mis à jour'} : ${updated}`)
  console.log(`  Sans paiement : ${noPayment}`)
  console.log(`  Erreurs       : ${errors}`)
  console.log(`  Total         : ${responses.length}`)
  console.log('────────────────────────────────────────────────────\n')

  await mongoose.disconnect()
  console.log('🔌  Déconnecté.')
}

main().catch((err) => {
  console.error('Erreur fatale :', err)
  process.exit(1)
})
