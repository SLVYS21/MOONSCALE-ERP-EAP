import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { WikiPage, WikiPageDocument } from './schemas/wiki-page.schema'

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

@Injectable()
export class WikiService {
  constructor(@InjectModel(WikiPage.name) private wikiModel: Model<WikiPageDocument>) {}

  async getTree() {
    const pages = await this.wikiModel
      .find({ isPublished: true })
      .select('title slug icon parentId order')
      .sort({ order: 1 })
      .lean()
    return this.buildTree(pages)
  }

  async getPage(slug: string) {
    const page = await this.wikiModel.findOne({ slug }).lean()
    if (!page) throw new NotFoundException('Page introuvable')
    return page
  }

  async createPage(data: {
    title: string
    content?: string
    parentId?: string
    icon?: string
    createdById: string
  }) {
    let slug = slugify(data.title)
    const existing = await this.wikiModel.findOne({ slug })
    if (existing) slug = `${slug}-${Date.now()}`

    const siblings = await this.wikiModel.countDocuments({ parentId: data.parentId ?? null })

    return this.wikiModel.create({
      title: data.title,
      slug,
      content: data.content ?? '',
      parentId: data.parentId ? new Types.ObjectId(data.parentId) : null,
      icon: data.icon ?? '📄',
      order: siblings,
      createdBy: new Types.ObjectId(data.createdById),
      isPublished: true,
    })
  }

  async updatePage(
    slug: string,
    data: { title?: string; content?: string; icon?: string; parentId?: string | null },
    updatedById: string,
  ) {
    const page = await this.wikiModel.findOne({ slug })
    if (!page) throw new NotFoundException('Page introuvable')

    if (data.title !== undefined) page.title = data.title
    if (data.content !== undefined) page.content = data.content
    if (data.icon !== undefined) page.icon = data.icon
    if (data.parentId !== undefined) {
      page.parentId = data.parentId ? new Types.ObjectId(data.parentId) : null
    }
    page.updatedBy = new Types.ObjectId(updatedById)

    return page.save()
  }

  async deletePage(slug: string) {
    const page = await this.wikiModel.findOne({ slug })
    if (!page) throw new NotFoundException('Page introuvable')
    await this.wikiModel.deleteOne({ _id: page._id })
    // Supprimer les enfants en cascade
    await this.wikiModel.deleteMany({ parentId: page._id })
    return { deleted: true }
  }

  async reorderPages(updates: Array<{ id: string; order: number }>) {
    await Promise.all(
      updates.map(({ id, order }) =>
        this.wikiModel.findByIdAndUpdate(id, { order }),
      ),
    )
    return { reordered: true }
  }

  private buildTree(pages: WikiPageDocument[]) {
    type TreeNode = WikiPageDocument & { children: TreeNode[] }
    const map = new Map<string, TreeNode>()
    const roots: TreeNode[] = []

    for (const p of pages) {
      map.set(p._id.toString(), { ...p, children: [] } as unknown as TreeNode)
    }
    for (const p of pages) {
      const node = map.get(p._id.toString())!
      const parentId = (p.parentId as Types.ObjectId | null)?.toString()
      if (parentId && map.has(parentId)) {
        map.get(parentId)!.children.push(node)
      } else {
        roots.push(node)
      }
    }
    return roots
  }

  async seedSystemDocs(userId: string): Promise<{ created: number }> {
    const DOCS = [
      {
        slug: 'moonscale-erp-vue-densemble',
        title: '🏠 Moonscale ERP — Vue d\'ensemble',
        icon: '🏠',
        content: `# Moonscale ERP — Vue d'ensemble

Moonscale ERP est un outil interne conçu pour piloter l'acquisition, la gestion des leads, le suivi des étudiants et les analytics d'un infopreneur.

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | NestJS + MongoDB (Mongoose) |
| Frontend | React 19 + Vite + TailwindCSS v4 |
| Auth | JWT (access + refresh token) |
| Stockage | MongoDB Atlas |
| Emails | Nodemailer (SMTP) |
| Fichiers | Cloudinary |

## Modules implémentés

1. **Auth** — JWT, invitation par email, rôles (superadmin / admin / member)
2. **Équipe** — CRUD utilisateurs, permissions granulaires
3. **Étudiants** — Fiche étudiant, enrichissement Circle, preuves de réussite, dette
4. **Paiements** — Suivi multi-devises, rappels automatiques
5. **Leads & Acquisition** — Pipeline complet, scoring MQL/SQL, webhooks
6. **Analytics** — Meta Ads, YouTube, TikTok, corrélation vues/leads
7. **Automatisations** — Déclencheurs événementiels, actions (email, webhook)
8. **Wiki** — Documentation interne en Markdown
9. **Tâches** — Projets et tâches par équipe
10. **Formulaires** — Formulaires publics avec soumissions
11. **Sync** — Import Airtable, synchronisation Circle bulk
`,
      },
      {
        slug: 'leads-acquisition',
        title: '🎯 Leads & Acquisition',
        icon: '🎯',
        content: `# Leads & Acquisition

## Le funnel

\`\`\`
Contenu (YouTube / TikTok)
    ↓ vues
Ads Meta → Clics → WhatsApp → Lead
Typebot   ──────────────────→ Lead
                               ↓
                          Pipeline
                               ↓
              Nouveau → MQL → SQL → RDV → Appel Diagnostic
                               ↓
                           Won → Étudiant
                           Lost / Nurturing
\`\`\`

## Sources de leads

| Source | Comment | Endpoint |
|--------|---------|----------|
| **Typebot** | Webhook automatique | \`POST /api/webhooks/typebot\` |
| **Typebot CSV** | Import historique | \`POST /api/leads/import-csv\` |
| **Meta Ads** | Marqué manuellement | source_type = meta_ads |
| **WhatsApp tracké** | Lien \`/api/r?src=xxx\` | Redirect + log |
| **WhatsApp direct** | Contact direct | source_type = whatsapp_direct |
| **Manuel** | Créé depuis l'interface | source_type = manual |

## Pipeline stages

| Stage | Signification |
|-------|--------------|
| **Nouveau** | Lead entrant, pas encore qualifié |
| **MQL** | Marketing Qualified Lead — score ≥ 20 pts |
| **SQL** | Sales Qualified Lead — score ≥ 50 pts |
| **RDV Programmé** | Appel Cal.com booké |
| **Appel Diagnostic** | Appel en cours / passé |
| **Won** | Vente conclue → déclenche la conversion en étudiant |
| **Lost** | Perdu (avec raison) |
| **Nurturing** | À relancer plus tard |

## Scoring automatique

Règles configurables dans **Leads → Scoring**. Opérateurs : \`equals\`, \`contains\`, \`not_null\`, \`is_empty\`.

**Règles par défaut :**
- Email renseigné : +20 pts → MQL dès l'email seul
- Téléphone renseigné : +15 pts
- Motivation exprimée : +20 pts → SQL avec email + téléphone + motivation
- Âge renseigné : +5 pts
- Réseau déclaré : +5 pts
- Vient de Meta Ads : +8 pts
- Montant potentiel renseigné : +10 pts

## Webhooks

- \`POST /api/webhooks/typebot\` — Nouveau lead depuis Typebot
- \`POST /api/webhooks/calcom\` — Booking Cal.com → crée un appel planifié

## WhatsApp Tracking Links

Chaque lien \`/api/r?src={src}\` : loggue le clic + redirige vers le numéro WhatsApp configuré. Visible dans **Leads → Liens WA**.

## Conversion Won → Étudiant

Depuis la fiche lead (statut Won), cliquer **Convertir en étudiant** : crée la fiche étudiant avec le nom, email, téléphone et source du lead.
`,
      },
      {
        slug: 'analytics-meta-youtube-tiktok',
        title: '📊 Analytics',
        icon: '📊',
        content: `# Analytics

## Vue d'ensemble

La page Analytics (\`/analytics\`) centralise les données de performance content + ads :

| Source | Données | Sync |
|--------|---------|------|
| **Meta Ads** | Dépenses, impressions, clics, conversations WA | Cron 08h00 + manuel |
| **YouTube** | Vues (delta), likes, commentaires, watch time | Cron 09h00 + manuel |
| **TikTok** | Vues (delta), likes, commentaires, partages | Import CSV manuel |

## Meta Ads

Nécessite dans \`.env\` :
\`\`\`
META_ACCESS_TOKEN=...
META_AD_ACCOUNT_ID=act_...
\`\`\`

L'API Meta pull les stats au niveau **adset** pour le jour J-1. Endpoint : \`POST /api/analytics/meta/pull\`.

## YouTube OAuth2

1. Configurer \`.env\` : \`GOOGLE_CLIENT_ID\`, \`GOOGLE_CLIENT_SECRET\`, \`GOOGLE_REDIRECT_URI\`
2. Aller dans **Paramètres → Intégrations** → Connecter YouTube
3. Autoriser l'accès → refresh token stocké en DB

Données : vues cumulatives + delta journalier, watch time (si YouTube Analytics API disponible).

## TikTok

Exporter depuis **TikTok Creator Studio → Analyse → Exporter en CSV**. Importer depuis l'onglet TikTok de la page Analytics.

## Corrélation Vues / Leads

L'onglet **Corrélation** superpose les vues delta (toutes plateformes) avec les leads créés par jour. Permet de voir l'impact du contenu sur l'acquisition.

## KPIs Dashboard

Calculés en temps réel depuis les données MongoDB :
- **Coût par lead** = Dépenses Meta 30j ÷ Total leads
- **Coût par Won** = Dépenses Meta 30j ÷ Leads Won

## Variables d'environnement requises

\`\`\`env
# Meta Ads
META_ACCESS_TOKEN=
META_AD_ACCOUNT_ID=

# YouTube / Google
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://votre-domaine.com/api/analytics/youtube/callback
YOUTUBE_CHANNEL_ID=          # optionnel si OAuth configuré

# Claude AI (résumé d'appels)
ANTHROPIC_API_KEY=
\`\`\`
`,
      },
      {
        slug: 'automatisations',
        title: '⚡ Automatisations',
        icon: '⚡',
        content: `# Automatisations

## Déclencheurs disponibles

| Déclencheur | Quand |
|-------------|-------|
| \`lead_created\` | Nouveau lead entrant |
| \`lead_stage_changed\` | Pipeline du lead modifié |
| \`lead_won\` | Lead passé en Won |
| \`call_completed\` | Appel marqué comme complété |
| \`student_created\` | Nouvel étudiant ajouté |
| \`payment_received\` | Paiement enregistré |
| \`payment_late\` | Paiement en retard détecté |
| \`form_submitted\` | Soumission de formulaire |

## Variables disponibles par déclencheur

**lead_created** : \`{{lead.name}}\`, \`{{lead.email}}\`, \`{{lead.source_type}}\`, \`{{lead.utm_source}}\`

**lead_stage_changed** : \`{{lead.name}}\`, \`{{lead.email}}\`, \`{{new_status}}\`

**lead_won** : \`{{lead.name}}\`, \`{{lead.email}}\`, \`{{lead.opportunity_amount}}\`

**call_completed** : \`{{lead.name}}\`, \`{{lead.email}}\`, \`{{call.date}}\`, \`{{call.duration}}\`

## Actions disponibles

- **Envoyer un email** — Template avec variables, destinataire configurable
- **Appeler un webhook** — POST vers une URL externe (Slack, Make, n8n…)

## Exemple de flux

1. Déclencheur : \`lead_won\`
2. Action : Email → "Nouveau client {{lead.name}} !"
3. Action : Webhook → Slack channel #ventes
`,
      },
    ]

    let created = 0
    for (const doc of DOCS) {
      const exists = await this.wikiModel.findOne({ slug: doc.slug })
      if (!exists) {
        const siblings = await this.wikiModel.countDocuments({ parentId: null })
        await this.wikiModel.create({
          title: doc.title,
          slug: doc.slug,
          content: doc.content,
          icon: doc.icon,
          parentId: null,
          order: siblings + created,
          createdBy: new Types.ObjectId(userId),
          isPublished: true,
        })
        created++
      }
    }

    return { created }
  }
}
