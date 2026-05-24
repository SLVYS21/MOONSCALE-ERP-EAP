/**
 * backfill-response-ids.ts
 *
 * Met à jour le champ `responseId` de tous les paiements qui ont un
 * `tallySubmissionId` mais pas encore de `responseId`, en cherchant la
 * FormResponse correspondante via `metadata.tallySubmissionId`.
 *
 * Usage :
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-response-ids.ts
 *
 * Variables d'environnement nécessaires :
 *   MONGODB_URI  (ex: mongodb://localhost:27017/moonscale-erp)
 */

import * as dotenv from 'dotenv'
import * as path from 'node:path'
import mongoose, { Types } from 'mongoose'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/moonscale-erp'

// ── Schémas légers (pas besoin du décorateur NestJS ici) ──────────────────────

const PaymentSchema = new mongoose.Schema(
  {
    tallySubmissionId: { type: String, default: null },
    responseId:        { type: Types.ObjectId, ref: 'FormResponse', default: null },
  },
  { strict: false, collection: 'payments' },
)

const FormResponseSchema = new mongoose.Schema(
  {
    metadata: { type: Object, default: {} },
  },
  { strict: false, collection: 'formresponses' },
)

// ── Logique principale ────────────────────────────────────────────────────────

async function main() {
  console.log('Connexion à MongoDB…')
  await mongoose.connect(MONGODB_URI)
  console.log('Connecté.')

  const Payment      = mongoose.model('Payment',      PaymentSchema)
  const FormResponse = mongoose.model('FormResponse', FormResponseSchema)

  // Paiements avec tallySubmissionId renseigné mais responseId absent
  const payments = await Payment.find({
    tallySubmissionId: { $nin: [null, ''] },
    responseId: null,
  }).lean()

  console.log(`\n${payments.length} paiement(s) à traiter.\n`)

  let matched   = 0
  let notFound  = 0
  let errors    = 0

  for (const payment of payments) {
    const tallyId = payment.tallySubmissionId as string

    try {
      const response = await FormResponse.findOne({
        'metadata.tallySubmissionId': tallyId,
      }).lean()

      if (!response) {
        console.warn(`  ✗  ${tallyId}  →  aucune FormResponse trouvée`)
        notFound++
        continue
      }

      await Payment.updateOne(
        { _id: payment._id },
        { $set: { responseId: response._id } },
      )

      console.log(`  ✓  ${tallyId}  →  ${String(response._id)}`)
      matched++
    } catch (err) {
      console.error(`  !  ${tallyId}  →  erreur: ${(err as Error).message}`)
      errors++
    }
  }

  console.log('\n── Résumé ──────────────────────────────────')
  console.log(`  Mis à jour  : ${matched}`)
  console.log(`  Introuvable : ${notFound}`)
  console.log(`  Erreurs     : ${errors}`)
  console.log(`  Total       : ${payments.length}`)
  console.log('────────────────────────────────────────────\n')

  await mongoose.disconnect()
  console.log('Déconnecté.')
}

main().catch((err) => {
  console.error('Erreur fatale :', err)
  process.exit(1)
})
