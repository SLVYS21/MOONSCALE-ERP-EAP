import * as dotenv from 'dotenv'
import * as path from 'node:path'
import mongoose, { Types } from 'mongoose'

dotenv.config({ path: path.resolve(__dirname, '../../.env') })

const MONGO_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/moonscale-erp'

interface FakeMsg {
  direction: 'in' | 'out'
  fromType: 'client' | 'bot' | 'closer'
  content: string
  minutesAgo: number
}

interface FakeConv {
  phone: string
  contactName: string
  contactType: 'lead' | 'student' | 'unknown'
  status: 'human' | 'bot' | 'paused'
  aiEnabled: boolean
  tags: string[]
  messages: FakeMsg[]
}

const FIXTURES: FakeConv[] = [
  {
    phone: '+2290707070701',
    contactName: 'Aïcha Koffi',
    contactType: 'lead',
    status: 'human',
    aiEnabled: false,
    tags: ['intéressé:eap'],
    messages: [
      { direction: 'in',  fromType: 'client', content: 'Bonsoir, je voudrais des infos sur la formation EAP', minutesAgo: 30 },
      { direction: 'out', fromType: 'closer', content: 'Bonsoir Aïcha ! Avec plaisir. Tu connais déjà Moonscale ?', minutesAgo: 28 },
      { direction: 'in',  fromType: 'client', content: 'Oui un ami m\'en a parlé', minutesAgo: 25 },
    ],
  },
  {
    phone: '+2290505050502',
    contactName: 'Bernard Diallo',
    contactType: 'student',
    status: 'human',
    aiEnabled: false,
    tags: ['plainte:access_circle'],
    messages: [
      { direction: 'in',  fromType: 'client', content: 'Bonjour, je n\'ai toujours pas reçu mon accès Circle après paiement', minutesAgo: 120 },
      { direction: 'out', fromType: 'closer', content: 'Bonjour Bernard, je vérifie tout de suite ton dossier', minutesAgo: 115 },
    ],
  },
  {
    phone: '+2290606060603',
    contactName: 'Chantal Mensah',
    contactType: 'unknown',
    status: 'human',
    aiEnabled: false,
    tags: [],
    messages: [
      { direction: 'in', fromType: 'client', content: 'Bonjour', minutesAgo: 5 },
      { direction: 'in', fromType: 'client', content: 'C\'est combien la formation ?', minutesAgo: 4 },
    ],
  },
  {
    phone: '+2290404040404',
    contactName: null as any,
    contactType: 'unknown',
    status: 'human',
    aiEnabled: false,
    tags: [],
    messages: [
      { direction: 'in', fromType: 'client', content: '👋', minutesAgo: 1440 },
    ],
  },
  {
    phone: '+2290808080805',
    contactName: 'Estelle Bamba',
    contactType: 'lead',
    status: 'paused',
    aiEnabled: false,
    tags: ['relancer'],
    messages: [
      { direction: 'in',  fromType: 'client', content: 'Je vais réfléchir et je reviens vers vous', minutesAgo: 4320 },
      { direction: 'out', fromType: 'closer', content: 'Pas de souci, je suis là quand tu veux ✨', minutesAgo: 4315 },
    ],
  },
]

async function run() {
  await mongoose.connect(MONGO_URI)
  const Conv = mongoose.connection.collection('conversations')
  const Msg = mongoose.connection.collection('messages')

  for (const f of FIXTURES) {
    await Msg.deleteMany({ conversationId: { $in: (await Conv.find({ phone: f.phone }).toArray()).map((c) => c._id) } })
    await Conv.deleteMany({ phone: f.phone })

    const last = f.messages[f.messages.length - 1]
    const lastDate = new Date(Date.now() - last.minutesAgo * 60_000)

    const convId = new Types.ObjectId()
    await Conv.insertOne({
      _id: convId,
      phone: f.phone,
      phoneRaw: f.phone,
      contactName: f.contactName,
      contactType: f.contactType,
      contactId: null,
      status: f.status,
      aiEnabled: f.aiEnabled,
      lockedBy: null,
      lockedAt: null,
      assignedTo: null,
      tags: f.tags,
      lastMessageAt: lastDate,
      lastMessagePreview: last.content.slice(0, 100),
      unreadCount: f.messages.filter((m) => m.direction === 'in').length,
      typebotSessionActive: false,
      typebotSessionId: null,
      language: 'fr',
      category: null,
      meta: {},
      createdAt: new Date(Date.now() - 7 * 86400_000),
      updatedAt: lastDate,
    })

    let i = 0
    for (const m of f.messages) {
      const t = new Date(Date.now() - m.minutesAgo * 60_000)
      await Msg.insertOne({
        conversationId: convId,
        direction: m.direction,
        fromType: m.fromType,
        fromUserId: null,
        content: m.content,
        mediaUrl: null,
        mediaType: null,
        mediaName: null,
        status: m.direction === 'in' ? 'delivered' : 'sent',
        providerMessageId: null,
        intent: null,
        toolCalls: [],
        tokensIn: null,
        tokensOut: null,
        costUsd: null,
        llmProvider: null,
        llmModel: null,
        errorMessage: null,
        createdAt: t,
        updatedAt: t,
      })
      i++
    }
    console.log(`✓ ${f.phone}  (${f.contactName ?? '—'})  — ${f.messages.length} messages`)
  }

  await mongoose.disconnect()
  console.log('\nSeed done.')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
