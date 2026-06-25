import * as dotenv from 'dotenv'
import * as path from 'node:path'
import mongoose from 'mongoose'
import { normalizePhone } from '../common/utils/phone.util'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const APPLY = process.argv.includes('--apply')
const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/moonscale-erp'

async function run() {
  console.log(`Mode: ${APPLY ? 'APPLY (writes to DB)' : 'DRY RUN'}`)
  await mongoose.connect(MONGO_URI)

  const Lead = mongoose.connection.collection('leads')
  const Student = mongoose.connection.collection('students')

  let leadsScanned = 0
  let leadsUpdated = 0
  let leadsInvalid = 0
  let studentsScanned = 0
  let studentsUpdated = 0
  let studentsInvalid = 0

  const leadCursor = Lead.find({ phone: { $ne: null, $exists: true } })
  for await (const doc of leadCursor) {
    leadsScanned++;
    const norm = normalizePhone(doc.phone as string)
    if (!norm.e164) {
      leadsInvalid++;
      continue;
    }
    if (doc.phone === norm.e164) continue
    if (APPLY) {
      await Lead.updateOne(
        { _id: doc._id },
        { $set: { phone: norm.e164 }, $setOnInsert: { phoneRaw: doc.phone } as any },
      )
    }
    leadsUpdated++
  }

  const studentCursor = Student.find({ whatsapp: { $ne: null, $exists: true } })
  for await (const doc of studentCursor) {
    studentsScanned++
    const norm = normalizePhone(doc.whatsapp as string)
    if (!norm.e164) {
      studentsInvalid++
      continue
    }
    if (doc.whatsapp === norm.e164) continue
    if (APPLY) {
      await Student.updateOne(
        { _id: doc._id },
        { $set: { whatsapp: norm.e164 } },
      );
    }
    studentsUpdated++;
  }

  console.log('--- Summary ---');
  console.log(`Leads:    scanned=${leadsScanned}  to_update=${leadsUpdated}  invalid=${leadsInvalid}`);
  console.log(`Students: scanned=${studentsScanned}  to_update=${studentsUpdated}  invalid=${studentsInvalid}`);
  if (!APPLY) console.log('(dry run — re-run with --apply to persist)');

  await mongoose.disconnect()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
