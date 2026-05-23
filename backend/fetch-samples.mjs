/**
 * fetch-samples.mjs
 * Fetche 5 enregistrements depuis Airtable (4 tables), Circle et Tally
 * puis sauvegarde les résultats dans fetch-samples-result.json
 */

import https from 'node:https'
import fs from 'node:fs'

// ── Credentials ───────────────────────────────────────────────────────────────

const AIRTABLE_KEY    = 'pataXUZfC5MBZwrUb.51a3040db068f8bcd57536d5fa61db3b288d11ca61b549f00d038d042bf3bd5d'
const AIRTABLE_BASE   = 'appSNmx63xwb30s5F'
const CIRCLE_KEY      = 'SC4L6oxeEDWSKMp1P3TZRTd6hYA8Cx3x'
const TALLY_KEY       = 'tly-SdKXEH1cC2T8X43jnlyH0rfN2QnMDMF2'
const TALLY_FORM_ID   = 'woB5oM'

const AIRTABLE_TABLES = {
  STUDENTS:  'tblAivp3x8I2rB6gG',
  PAYMENTS:  'tbl28GhsfLRLdL33y',
  FORMATION: 'tbl9q0IzgxJ0rE8Hc',
  COACHING:  'tblxHkUGph0gVaS4C',
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let body = ''
      res.on('data', (chunk) => body += chunk)
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) })
        } catch {
          resolve({ status: res.statusCode, data: body })
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

// ── Fetchers ──────────────────────────────────────────────────────────────────

async function fetchAirtableTable(tableId, label) {
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE}/${tableId}?maxRecords=5&pageSize=5`
  console.log(`  → Airtable ${label}...`)
  try {
    const res = await get(url, { Authorization: `Bearer ${AIRTABLE_KEY}` })
    const records = res.data?.records ?? []
    const fields  = records.length > 0 ? Object.keys(records[0].fields) : []
    return { ok: true, fields, records, count: records.length }
  } catch (err) {
    return { ok: false, error: err.message, fields: [], records: [] }
  }
}

async function fetchCircleMembers() {
  const url = `https://app.circle.so/api/admin/v2/community_members?page=1&per_page=5`
  console.log('  → Circle members...')
  try {
    const res = await get(url, {
      Authorization: `Bearer ${CIRCLE_KEY}`,
      'Content-Type': 'application/json',
    })
    const members = res.data?.records ?? res.data ?? []
    const list    = Array.isArray(members) ? members.slice(0, 5) : []
    const fields  = list.length > 0 ? Object.keys(list[0]) : []
    return { ok: true, fields, members: list, count: list.length, raw_response_keys: Object.keys(res.data ?? {}) }
  } catch (err) {
    return { ok: false, error: err.message, fields: [], members: [] }
  }
}

async function fetchTallySubmissions() {
  const url = `https://api.tally.so/forms/${TALLY_FORM_ID}/submissions?page=1&limit=5`
  console.log('  → Tally submissions...')
  try {
    const res = await get(url, {
      Authorization: `Bearer ${TALLY_KEY}`,
    })
    const submissions = res.data?.submissions ?? []
    const first = submissions[0] ?? null

    // Extraire la structure des questions depuis la première soumission
    const questions = first?.responses?.map(r => ({
      questionId: r.questionId,
      key:        r.key,
      label:      r.label,
      type:       r.type,
    })) ?? []

    return {
      ok: true,
      total: res.data?.totalNumberOfSubmissions ?? null,
      hasMore: res.data?.hasMore ?? null,
      questions,
      submissions: submissions.slice(0, 5),
    }
  } catch (err) {
    return { ok: false, error: err.message, questions: [], submissions: [] }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🔍 Fetch des samples...\n')

  const [students, payments, formation, coaching, circle, tally] = await Promise.all([
    fetchAirtableTable(AIRTABLE_TABLES.STUDENTS,  'ÉTUDIANTS'),
    fetchAirtableTable(AIRTABLE_TABLES.PAYMENTS,  'PAIEMENTS'),
    fetchAirtableTable(AIRTABLE_TABLES.FORMATION, 'FORMATION'),
    fetchAirtableTable(AIRTABLE_TABLES.COACHING,  'COACHING'),
    fetchCircleMembers(),
    fetchTallySubmissions(),
  ])

  const result = {
    fetchedAt: new Date().toISOString(),
    airtable: { students, payments, formation, coaching },
    circle,
    tally,
  }

  const outPath = new URL('./fetch-samples-result.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8')

  // Résumé console
  console.log('\n✅ Résultats :')
  console.log(`  Airtable ÉTUDIANTS  : ${students.ok  ? `${students.count} records, ${students.fields.length} champs`   : '❌ ' + students.error}`)
  console.log(`  Airtable PAIEMENTS  : ${payments.ok  ? `${payments.count} records, ${payments.fields.length} champs`   : '❌ ' + payments.error}`)
  console.log(`  Airtable FORMATION  : ${formation.ok ? `${formation.count} records, ${formation.fields.length} champs` : '❌ ' + formation.error}`)
  console.log(`  Airtable COACHING   : ${coaching.ok  ? `${coaching.count} records, ${coaching.fields.length} champs`   : '❌ ' + coaching.error}`)
  console.log(`  Circle membres      : ${circle.ok    ? `${circle.count} membres, ${circle.fields.length} champs`       : '❌ ' + circle.error}`)
  console.log(`  Tally soumissions   : ${tally.ok     ? `${tally.submissions.length}/${tally.total ?? '?'} soumissions, ${tally.questions.length} questions` : '❌ ' + tally.error}`)
  console.log(`\n📄 Résultats écrits dans : fetch-samples-result.json\n`)
}

main().catch(console.error)
