import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import { LlmService, ProviderModelChoice } from '../llm/llm.service'
import { ContentTrackingService } from '../content-tracking/content-tracking.service'
import {
  VideoProject, VideoProjectDocument,
  ContentStatus, ContentPlatform, ContentCategory, ContentFormat, DurationType,
  defaultVideoChecklist, defaultPodcastChecklist, defaultChallengeChecklist,
} from './schemas/video-project.schema'
import { ContentCreator, ContentCreatorDocument } from './schemas/content-creator.schema'
import { ContentSuggestion, ContentSuggestionDocument, SuggestionStatus } from './schemas/content-suggestion.schema'
import { ContentCapture, ContentCaptureDocument } from './schemas/content-capture.schema'

// ── LLM strategy ──────────────────────────────────────────────────────────
const PRIMARY: ProviderModelChoice = { provider: 'groq', model: 'openai/gpt-oss-120b' }
const FALLBACK: ProviderModelChoice = { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }
const PREMIUM: ProviderModelChoice = { provider: 'anthropic', model: 'claude-sonnet-4-6' }

function stripJsonFence(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('```')) return trimmed
  return trimmed.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
}

export interface CreateProjectDto {
  title: string
  category?: ContentCategory
  format?: ContentFormat
  duration_type?: DurationType
  platforms?: ContentPlatform[]
  youtube_ref_url?: string | null
  brain_dump?: string
  notes?: string
}

export interface UpdateProjectDto {
  title?: string
  description?: string
  status?: ContentStatus
  platforms?: ContentPlatform[]
  category?: ContentCategory
  format?: ContentFormat
  duration_type?: DurationType
  target_date?: string | null
  published_url?: string | null
  youtube_ref_url?: string | null
  notes?: string
  brain_dump?: string
  value_proposition?: string
  key_points?: string[]
  guest_name?: string | null
  guest_value?: string
  full_script?: string
  thumbnail_descriptions?: string[]
  order?: number
}

// ── Format context for AI prompts ────────────────────────────────────────────

const FORMAT_CONTEXT: Record<ContentFormat, {
  name: string
  objectif: string
  structure: string
  specificites: string
}> = {
  'talking-head': {
    name: 'Talking Head',
    objectif: 'Démontrer l\'expertise, qualifier le prospect',
    structure: 'Hook (0-30s) ➔ Intro (30s-2min) ➔ Contenu chapitré (2-15min) ➔ CTA (15-18min)',
    specificites: 'Face cam + B-roll, sous-titres animés, chapitres YouTube obligatoires',
  },
  'valeur-ecommerce': {
    name: 'Valeur E-commerce',
    objectif: 'Éduquer et qualifier, montrer l\'expertise e-commerce',
    structure: 'Problème fréquent ➔ Explication ➔ Méthode pas à pas ➔ Résultats ➔ CTA formation',
    specificites: 'Contenu très actionnable, exemples concrets du marché africain',
  },
  'mindset': {
    name: 'Mindset',
    objectif: 'Créer une connexion émotionnelle, aligner avec la philosophie',
    structure: 'Question ou provocation ➔ Histoire ➔ Principes ➔ Application concrète ➔ CTA',
    specificites: 'Ton authentique, partage personnel, éviter le sermon',
  },
  'etude-de-cas': {
    name: 'Étude de Cas',
    objectif: 'Prouver les résultats avec des chiffres concrets',
    structure: 'Résultat chiffré en accroche ➔ Contexte ➔ Problème initial ➔ Solution ➔ Résultats ➔ Leçons',
    specificites: 'Données réelles, screenshots si possible, storytelling fort',
  },
  'erreurs-lecons': {
    name: 'Erreurs & Leçons',
    objectif: 'Inspirer confiance par l\'honnêteté',
    structure: 'L\'erreur ➔ Ce que j\'ai perdu ou raté ➔ La leçon ➔ Comment éviter ça',
    specificites: 'Contre-intuitif mais très viral, renforce la crédibilité',
  },
  'interview-etudiant': {
    name: 'Interview Étudiant à Succès',
    objectif: 'Preuve sociale directe, lever les objections',
    structure: 'Présentation étudiant ➔ Situation de départ ➔ Ce qui a changé ➔ Résultats chiffrés ➔ Message à ceux qui doutent',
    specificites: 'Préparer les questions à l\'avance, filmer en bonne qualité, couper les silences',
  },
  'challenge': {
    name: 'Challenge',
    objectif: 'Fort engagement, contenu addictif, preuve de concept en direct',
    structure: 'Présentation du challenge ➔ Épisodes réguliers ➔ Bilan final avec résultats',
    specificites: 'Série de vidéos, créer du suspense entre les épisodes, documenter en temps réel',
  },
  'comparatif': {
    name: 'Comparatif & Débat',
    objectif: 'Générer de l\'engagement et des partages',
    structure: 'Accroche controversée ➔ Présentation des deux côtés ➔ Position claire ➔ Arguments ➔ CTA commentaires',
    specificites: 'Prendre une position claire, arguments solides des deux côtés',
  },
  'vision-marche': {
    name: 'Vision Marché Africain',
    objectif: 'Positionnement unique comme référence e-commerce en Afrique francophone',
    structure: 'Donnée choc sur le marché africain ➔ Analyse ➔ Opportunités ➔ Comment en profiter ➔ CTA',
    specificites: 'Données locales, chiffres du marché, angle géographique fort',
  },
  'coulisses': {
    name: 'Coulisses & Transparence',
    objectif: 'Humaniser le personal brand, créer de l\'attachement',
    structure: 'Contexte ➔ Révélation / derrière les rideaux ➔ Leçon ou insight ➔ Invitation à continuer',
    specificites: 'Format authentique, moins de production, spontanéité valorisée',
  },
  'personnalite': {
    name: 'Personnalité Publique & Inspiration',
    objectif: 'Construire le personal brand au-delà de l\'e-commerce',
    structure: 'Histoire forte ➔ Vision ➔ Impact ➔ Message inspirant ➔ CTA engagement',
    specificites: 'Ne vend pas directement la formation, construit l\'homme derrière l\'expert',
  },
  'podcast': {
    name: 'Podcast',
    objectif: 'Approfondir la relation, démontrer l\'expertise sur la durée',
    structure: 'Présentation invité ➔ Parcours ➔ Questions clés ➔ Leçons ➔ CTA',
    specificites: 'Format long (20-45min), chapitres obligatoires, bonne qualité audio',
  },
}

const DEFAULT_CONTEXT = `Je crée du contenu YouTube et TikTok sur le e-commerce en Afrique francophone.
Mon audience : jeunes africains (18-35 ans) qui veulent générer des revenus en ligne — dropshipping, vente sur marketplaces, business en ligne.
Mon style : pédagogique, pratique, inspirant. Je montre des résultats réels et des stratégies concrètes applicables en Afrique.`

@Injectable()
export class ContentService {
  constructor(
    @InjectModel(VideoProject.name) private readonly projectModel: Model<VideoProjectDocument>,
    @InjectModel(ContentCreator.name) private readonly creatorModel: Model<ContentCreatorDocument>,
    @InjectModel(ContentSuggestion.name) private readonly suggestionModel: Model<ContentSuggestionDocument>,
    @InjectModel(ContentCapture.name) private readonly captureModel: Model<ContentCaptureDocument>,
    private readonly llm: LlmService,
    private readonly tracking: ContentTrackingService,
  ) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  listProjects(
    userId: string,
    category?: string,
    status?: string,
    period?: string,
    sort?: string,
  ): Promise<VideoProjectDocument[]> {
    const filter: Record<string, unknown> = { created_by: new Types.ObjectId(userId) }
    if (category) filter.category = category
    if (status) filter.status = status

    if (period && period !== 'all') {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : null
      if (days) filter.createdAt = { $gte: new Date(Date.now() - days * 86_400_000) }
    }

    type SortSpec = Record<string, 1 | -1>
    const sortSpec: SortSpec = sort === 'oldest'
      ? { createdAt: 1 }
      : sort === 'newest'
      ? { createdAt: -1 }
      : { order: 1, createdAt: -1 }

    return this.projectModel.find(filter).sort(sortSpec).exec()
  }

  async getProject(id: string): Promise<VideoProjectDocument> {
    const p = await this.projectModel.findById(id)
    if (!p) throw new NotFoundException('Projet introuvable')
    return p
  }

  async createProject(dto: CreateProjectDto, userId: string): Promise<VideoProjectDocument> {
    const format = dto.format ?? 'talking-head'
    const checklist =
      format === 'podcast' ? defaultPodcastChecklist() :
      format === 'challenge' ? defaultChallengeChecklist() :
      defaultVideoChecklist()

    return this.projectModel.create({
      ...dto,
      format,
      checklist,
      created_by: new Types.ObjectId(userId),
    })
  }

  async updateProject(id: string, dto: UpdateProjectDto): Promise<VideoProjectDocument> {
    const update: Record<string, unknown> = { ...dto }
    if (dto.target_date !== undefined) {
      update.target_date = dto.target_date ? new Date(dto.target_date) : null
    }
    const p = await this.projectModel.findByIdAndUpdate(id, update, { new: true })
    if (!p) throw new NotFoundException('Projet introuvable')
    return p
  }

  async deleteProject(id: string, userId: string): Promise<void> {
    const p = await this.projectModel.findOne({
      _id: new Types.ObjectId(id),
      created_by: new Types.ObjectId(userId),
    })
    if (!p) throw new NotFoundException()
    await p.deleteOne()
  }

  // ── Calendar ─────────────────────────────────────────────────────────────────

  async getCalendar(userId: string, year: number, month: number): Promise<VideoProjectDocument[]> {
    const start = new Date(year, month - 1, 1)
    const end = new Date(year, month, 0, 23, 59, 59)
    return this.projectModel.find({
      created_by: new Types.ObjectId(userId),
      target_date: { $gte: start, $lte: end },
    }).sort({ target_date: 1 }).exec()
  }

  // ── Checklist ─────────────────────────────────────────────────────────────────

  async toggleChecklistItem(projectId: string, itemId: string): Promise<VideoProjectDocument> {
    const p = await this.projectModel.findById(projectId)
    if (!p) throw new NotFoundException('Projet introuvable')
    const item = p.checklist.find((c) => c.id === itemId)
    if (!item) throw new NotFoundException('Item de checklist introuvable')

    const updated = await this.projectModel.findByIdAndUpdate(
      projectId,
      { $set: { 'checklist.$[elem].done': !item.done } },
      { arrayFilters: [{ 'elem.id': itemId }], new: true },
    )
    return updated!
  }

  async addChecklistItem(projectId: string, label: string): Promise<VideoProjectDocument> {
    const p = await this.projectModel.findByIdAndUpdate(
      projectId,
      { $push: { checklist: { id: new Types.ObjectId().toHexString(), label, done: false } } },
      { new: true },
    )
    if (!p) throw new NotFoundException()
    return p
  }

  async removeChecklistItem(projectId: string, itemId: string): Promise<VideoProjectDocument> {
    const p = await this.projectModel.findByIdAndUpdate(
      projectId,
      { $pull: { checklist: { id: itemId } } },
      { new: true },
    )
    if (!p) throw new NotFoundException()
    return p
  }

  // ── AI: Quick structure (brain dump → structured idea) ────────────────────────

  async quickStructure(rawIdea: string): Promise<{
    title: string
    category: ContentCategory
    format: ContentFormat
    duration_type: DurationType
    notes: string
  }> {
    const userPrompt = `${DEFAULT_CONTEXT}

Un créateur t'a partagé cette idée brute :
"${rawIdea}"

Analyse et structure cette idée. Réponds UNIQUEMENT en JSON valide (aucun markdown) :

{
  "title": "Titre accrocheur et précis pour cette vidéo",
  "category": "educatif",
  "format": "talking-head",
  "duration_type": "long",
  "notes": "Contexte, éléments clés et angle extraits du brainstorm"
}

Catégories disponibles : educatif | preuve-sociale | viral | podcast
Formats disponibles : talking-head | valeur-ecommerce | mindset | etude-de-cas | erreurs-lecons | interview-etudiant | challenge | comparatif | vision-marche | coulisses | personnalite | podcast
Durée : court = Shorts/Reels (<90s) | long = YouTube (5-20 min)

Choisis le format le plus adapté à l'idée.`

    const result = await this.llm.generate(
      PRIMARY,
      {
        systemPrompt: "Tu es un expert en création de contenu pour le e-commerce en Afrique francophone. Tu réponds UNIQUEMENT en JSON valide.",
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.3,
        maxTokens: 512,
      },
      FALLBACK,
    )

    try {
      return JSON.parse(stripJsonFence(result.text))
    } catch {
      throw new BadRequestException(`Erreur parsing réponse LLM (${result.provider}) — réessayez.`)
    }
  }

  // ── AI: Analyze ──────────────────────────────────────────────────────────────

  async analyzeProject(projectId: string): Promise<VideoProjectDocument> {
    const project = await this.projectModel.findById(projectId)
    if (!project) throw new NotFoundException('Projet introuvable')

    const fmt = FORMAT_CONTEXT[project.format] ?? FORMAT_CONTEXT['talking-head']
    const isPodcast = project.format === 'podcast'
    const duration = project.duration_type === 'court' ? 'Format court (< 3 min)' : 'Format long (5-20 min)'

    const podcastExtra = isPodcast && project.guest_name
      ? `\nInvité : ${project.guest_name}\nValeur attendue du podcast : ${project.guest_value || 'Non précisée'}`
      : ''

    const brainDumpContext = project.brain_dump
      ? `\nIdée originale du créateur : "${project.brain_dump}"`
      : ''

    const userPrompt = `CONTEXTE DU CRÉATEUR:
${DEFAULT_CONTEXT}

PROJET:
Titre : ${project.title}
Format : ${fmt.name} — ${fmt.objectif}
Structure recommandée : ${fmt.structure}
Spécificités : ${fmt.specificites}
Durée : ${duration}${brainDumpContext}${podcastExtra}
${project.description ? `Description : ${project.description}` : ''}

Analyse ce projet et réponds UNIQUEMENT en JSON valide (aucun markdown avant/après).

${isPodcast ? `{
  "analysis": "Analyse en 2-3 paragraphes markdown : angle unique, valeur pour l'audience, points d'attention",
  "value_proposition": "Ce que l'audience va concrètement gagner en écoutant cet épisode — bénéfice direct et tangible",
  "key_points": [
    "Point clé 1 à aborder absolument",
    "Point clé 2",
    "Point clé 3",
    "Point clé 4",
    "Point clé 5"
  ],
  "hooks": [
    "Accroche pour l'intro de l'épisode — curiosité sur l'invité",
    "Accroche résultat — ce que l'audience va apprendre",
    "Accroche storytelling — histoire ou moment fort de l'invité",
    "Accroche problème — douleur que l'audience reconnaît",
    "Accroche chiffre — donnée ou fait surprenant"
  ],
  "suggested_questions": [
    "10 questions clés pour l'interview, du parcours aux leçons concrètes"
  ],
  "script_outline": "Plan de l'épisode en markdown avec timecodes approximatifs",
  "thumbnail_descriptions": [
    "Miniature 1 (impact fort) : description précise — expression, texte visible, couleurs, composition 16:9",
    "Miniature 2 (curiosité) : variante qui intrigue",
    "Miniature 3 (duo) : les deux personnes, design épuré"
  ]
}` : `{
  "analysis": "Analyse en 2-3 paragraphes markdown : angle unique, pourquoi ça va toucher l'audience africaine, opportunités",
  "value_proposition": "Ce que l'audience va concrètement gagner en regardant cette vidéo — bénéfice direct et mesurable",
  "key_points": [
    "Point clé 1 à aborder absolument dans la vidéo",
    "Point clé 2",
    "Point clé 3",
    "Point clé 4",
    "Point clé 5"
  ],
  "hooks": [
    "Accroche curiosité — donne envie de cliquer sans comprendre",
    "Accroche résultat — chiffre ou transformation concrète",
    "Accroche storytelling — histoire personnelle ou témoignage",
    "Accroche problème — douleur que l'audience reconnaît",
    "Accroche contre-intuitif — opinion choc ou paradoxe"
  ],
  "script_outline": "Plan en markdown selon la structure ${fmt.name}:\\n${fmt.structure}\\nAvec timecodes et points précis",
  "thumbnail_descriptions": [
    "Miniature 1 (impact fort) : description précise — expression, texte visible en gros, couleurs, composition 16:9",
    "Miniature 2 (curiosité) : variante qui attire sans dévoiler",
    "Miniature 3 (minimaliste) : épuré, texte seul ou 1 élément fort"
  ]
}`}`

    const result = await this.llm.generate(
      PREMIUM,
      {
        systemPrompt: "Tu es un expert en création de contenu, spécialisé dans le e-commerce et l'entrepreneuriat en Afrique francophone. Tu réponds UNIQUEMENT en JSON valide.",
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.6,
        maxTokens: 4096,
      },
      FALLBACK,
    )

    let parsed: {
      analysis: string
      value_proposition: string
      key_points: string[]
      hooks: string[]
      script_outline: string
      thumbnail_descriptions: string[]
      suggested_questions?: string[]
    }

    try {
      parsed = JSON.parse(stripJsonFence(result.text))
    } catch {
      throw new BadRequestException(`Erreur parsing réponse LLM (${result.provider}) — réessayez.`)
    }

    const updated = await this.projectModel.findByIdAndUpdate(
      projectId,
      {
        analysis: parsed.analysis ?? '',
        value_proposition: parsed.value_proposition ?? '',
        key_points: parsed.key_points ?? [],
        hooks: (parsed.hooks ?? []).map((t: string) => ({ text: t, selected: false })),
        script_outline: parsed.script_outline ?? '',
        thumbnail_descriptions: parsed.thumbnail_descriptions ?? [],
        suggested_questions: parsed.suggested_questions ?? [],
      },
      { new: true },
    )
    return updated!
  }

  // ── AI: Select hook ──────────────────────────────────────────────────────────

  async selectHook(projectId: string, hookIndex: number): Promise<VideoProjectDocument> {
    const project = await this.projectModel.findById(projectId)
    if (!project) throw new NotFoundException()
    const hooks = project.hooks.map((h, i) => ({ ...h, selected: i === hookIndex }))
    const updated = await this.projectModel.findByIdAndUpdate(projectId, { hooks }, { new: true })
    return updated!
  }

  // ── AI: Generate full script ─────────────────────────────────────────────────

  async generateScript(projectId: string): Promise<{ script: string }> {
    const project = await this.projectModel.findById(projectId)
    if (!project) throw new NotFoundException('Projet introuvable')

    const fmt = FORMAT_CONTEXT[project.format]
    const selectedHook = project.hooks.find(h => h.selected)?.text ?? project.hooks[0]?.text ?? project.title
    const isShort = project.duration_type === 'court'

    const keyPointsStr = project.key_points.length > 0
      ? `\nPoints clés à couvrir :\n${project.key_points.map((p, i) => `${i + 1}. ${p}`).join('\n')}`
      : ''

    const userPrompt = `Format : ${fmt.name} — ${isShort ? 'Format COURT (60-90 secondes)' : 'Format LONG (5-15 minutes)'}
Projet : ${project.title}
Accroche retenue : "${selectedHook}"
${project.value_proposition ? `Valeur à transmettre : ${project.value_proposition}` : ''}${keyPointsStr}

Plan :
${project.script_outline || `Structure recommandée : ${fmt.structure}`}

Rédige le SCRIPT COMPLET, mot pour mot, tel que le créateur va le dire face caméra.
Règles :
- Ton naturel, conversationnel, direct et percutant
- Français africain (sans forcer l'argot)
- Directions de tournage entre crochets : [B-roll produit], [Montrer l'écran], [Zoom résultats]
- Timecodes approximatifs : (0:00), (0:30), (1:15)...
- ${isShort ? 'Maximum 90 secondes de lecture, ultra-percutant' : 'Entre 5 et 15 minutes, chapitres YouTube'}
- Commencer DIRECTEMENT par le script`

    const result = await this.llm.generate(
      PREMIUM,
      {
        systemPrompt: "Tu es un expert en création de contenu pour le e-commerce en Afrique francophone. Tu rédiges des scripts naturels, percutants, prêts à filmer.",
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.7,
        maxTokens: 8192,
      },
      FALLBACK,
    )

    const script = result.text.trim()
    await this.projectModel.findByIdAndUpdate(projectId, { full_script: script })
    return { script }
  }

  // ── AI: Generate thumbnail ────────────────────────────────────────────────────

  async generateThumbnail(
    projectId: string,
    description: string,
    thumbnailIndex: number,
  ): Promise<{ image_base64: string; mime_type: string }> {
    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) throw new BadRequestException('GEMINI_API_KEY non configuré dans .env')

    const project = await this.projectModel.findById(projectId)
    const isShort = project?.duration_type === 'court'
    const sizeHint = isShort ? '9:16 vertical thumbnail for TikTok/Reels/Shorts' : '16:9 YouTube thumbnail'

    const fullPrompt = `${sizeHint} for African e-commerce content creator. ${description}. Requirements: eye-catching, high contrast, professional design, French text if any. Bold colors, clear focal point optimized for CTR.`

    const resp = await axios.post<{
      candidates: Array<{ content: { parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> } }>
    }>(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${geminiKey}`,
      {
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      { timeout: 60_000 },
    )

    const parts = resp.data.candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find((p) => p.inlineData)
    if (!imagePart?.inlineData) throw new BadRequestException('Aucune image générée par Gemini')

    const { data: image_base64, mimeType: mime_type } = imagePart.inlineData

    if (project) {
      const thumbs = [...(project.generated_thumbnails ?? [])]
      thumbs[thumbnailIndex] = image_base64
      await this.projectModel.findByIdAndUpdate(projectId, { generated_thumbnails: thumbs })
    }

    return { image_base64, mime_type }
  }

  // ── Creators ──────────────────────────────────────────────────────────────────

  listCreators(userId: string): Promise<ContentCreatorDocument[]> {
    return this.creatorModel.find({ created_by: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).exec()
  }

  async addCreator(
    userId: string,
    dto: { name: string; channel_url: string; platform: string },
  ): Promise<ContentCreatorDocument> {
    return this.creatorModel.create({
      name: dto.name,
      channel_url: dto.channel_url,
      platform: (dto.platform ?? 'youtube') as 'youtube' | 'tiktok' | 'instagram',
      created_by: new Types.ObjectId(userId),
    })
  }

  async removeCreator(id: string, userId: string): Promise<void> {
    const doc = await this.creatorModel.findOne({
      _id: new Types.ObjectId(id),
      created_by: new Types.ObjectId(userId),
    })
    if (!doc) throw new NotFoundException()
    await doc.deleteOne()
  }

  // ── Suggestions ───────────────────────────────────────────────────────────────

  listSuggestions(userId: string): Promise<ContentSuggestionDocument[]> {
    return this.suggestionModel
      .find({ created_by: new Types.ObjectId(userId), status: { $ne: 'dismissed' } })
      .sort({ createdAt: -1 })
      .limit(20)
      .exec()
  }

  async updateSuggestionStatus(id: string, status: SuggestionStatus): Promise<ContentSuggestionDocument> {
    const doc = await this.suggestionModel.findByIdAndUpdate(id, { status }, { new: true })
    if (!doc) throw new NotFoundException()
    return doc
  }

  async saveSuggestionAsProject(id: string, userId: string): Promise<VideoProjectDocument> {
    const suggestion = await this.suggestionModel.findById(id)
    if (!suggestion) throw new NotFoundException('Suggestion introuvable')

    const project = await this.createProject(
      {
        title: suggestion.title,
        category: suggestion.category,
        format: suggestion.format,
        duration_type: suggestion.duration_type,
        notes: suggestion.rationale,
      },
      userId,
    )

    await this.suggestionModel.findByIdAndUpdate(id, { status: 'saved' })
    return project
  }

  async generateDailySuggestions(userId: string): Promise<ContentSuggestionDocument[]> {
    const [creators, recentProjects] = await Promise.all([
      this.creatorModel.find({ created_by: new Types.ObjectId(userId) }),
      this.projectModel
        .find({ created_by: new Types.ObjectId(userId) }, { title: 1, category: 1 })
        .sort({ createdAt: -1 })
        .limit(10),
    ])

    const creatorsStr = creators.length > 0
      ? creators.map(c => `- ${c.name} (${c.platform} : ${c.channel_url})`).join('\n')
      : '- Aucun créateur spécifié — utilise des créateurs e-commerce africains de référence'

    const recentStr = recentProjects.length > 0
      ? recentProjects.map(p => `- "${p.title}" [${p.category}]`).join('\n')
      : '- Aucun projet récent'

    const userPrompt = `${DEFAULT_CONTEXT}

Créateurs de référence à analyser pour s'en inspirer :
${creatorsStr}

Projets récents du créateur (à ne pas répéter) :
${recentStr}

En t'inspirant du style et des thématiques de ces créateurs, génère 6 idées de contenu originales et pertinentes pour cette audience africaine.
Chaque idée doit être fraîche, actuelle et différente des projets récents.

Réponds UNIQUEMENT en JSON valide (aucun markdown) :

{
  "suggestions": [
    {
      "title": "Titre accrocheur et précis",
      "rationale": "Pourquoi cette idée va marcher — angle unique, timing, opportunité de marché",
      "category": "educatif",
      "format": "talking-head",
      "duration_type": "long",
      "creator_inspiration": "Nom du créateur ou style qui a inspiré cette idée"
    }
  ]
}

Catégories : educatif | preuve-sociale | viral | podcast
Formats : talking-head | valeur-ecommerce | mindset | etude-de-cas | erreurs-lecons | interview-etudiant | challenge | comparatif | vision-marche | coulisses | personnalite | podcast
Durée : court | long`

    const result = await this.llm.generate(
      PRIMARY,
      {
        systemPrompt: "Tu es un expert en stratégie de contenu pour le e-commerce en Afrique francophone. Tu réponds UNIQUEMENT en JSON valide.",
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.8,
        maxTokens: 2048,
      },
      FALLBACK,
    )

    let parsed: {
      suggestions: Array<{
        title: string
        rationale: string
        category: ContentCategory
        format: ContentFormat
        duration_type: DurationType
        creator_inspiration: string
      }>
    }

    try {
      parsed = JSON.parse(stripJsonFence(result.text))
    } catch {
      throw new BadRequestException(`Erreur parsing réponse LLM (${result.provider}) — réessayez.`)
    }

    // Replace today's suggestions for this user
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    await this.suggestionModel.deleteMany({
      created_by: new Types.ObjectId(userId),
      createdAt: { $gte: todayStart },
    })

    const docs = await this.suggestionModel.insertMany(
      (parsed.suggestions ?? []).map(s => ({
        ...s,
        status: 'new',
        created_by: new Types.ObjectId(userId),
      })),
    )

    return docs as ContentSuggestionDocument[]
  }

  // ── Pipeline: Analyze reference videos (transcripts) ─────────────────────────

  async analyzeReferenceVideos(projectId: string, videoUrls: string[]): Promise<VideoProjectDocument> {
    const project = await this.projectModel.findById(projectId)
    if (!project) throw new NotFoundException('Projet introuvable')
    if (videoUrls.length === 0) throw new BadRequestException('Aucune URL fournie')

    const newReferences: typeof project.reference_videos = []

    for (const rawUrl of videoUrls.slice(0, 5)) {
      const url = rawUrl.trim()
      const isYouTube = /youtube\.com|youtu\.be/.test(url)
      if (!isYouTube) {
        // TikTok / others : Phase 2 (audio transcript via Gemini). For now skip with placeholder.
        newReferences.push({
          url,
          platform: 'tiktok',
          title: 'TikTok (transcript non disponible Phase 1)',
          transcript: '',
          keep_points: [],
          discard_points: [],
          why_it_works: 'Analyse audio TikTok arrive en Phase 2.',
          added_at: new Date(),
        })
        continue
      }

      const transcript = await this.tracking.fetchYouTubeCaptions(url, 'fr').catch(() => '')

      const userPrompt = `Tu analyses une vidéo de référence pour un créateur e-commerce africain qui veut s'inspirer.

URL : ${url}
${transcript ? `Transcript (extrait) :\n"""${transcript.slice(0, 8000)}"""` : 'Pas de transcript disponible — base-toi sur ce que l\'URL et le contexte suggèrent.'}

Analyse cette vidéo et identifie :
- Ce qu'on doit garder/imiter pour notre propre vidéo (formules, structure, hooks, rythme)
- Ce qu'on doit éviter ou adapter (longueurs, références culturelles inadaptées, etc.)
- Pourquoi cette vidéo fonctionne (en 2-3 phrases concrètes)

JSON strict :
{
  "title": "Titre de la vidéo extrait du transcript ou inféré",
  "keep_points": ["3-5 éléments concrets à reprendre"],
  "discard_points": ["2-4 éléments à laisser tomber pour notre version africaine"],
  "why_it_works": "Explication en 2-3 phrases"
}`

      const result = await this.llm.generate(
        PRIMARY,
        {
          systemPrompt: "Tu es un analyste de contenu vidéo. Tu réponds UNIQUEMENT en JSON valide.",
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.4,
          maxTokens: 1024,
        },
        FALLBACK,
      )

      let parsed: { title?: string; keep_points?: string[]; discard_points?: string[]; why_it_works?: string }
      try {
        parsed = JSON.parse(stripJsonFence(result.text))
      } catch {
        parsed = { title: url, keep_points: [], discard_points: [], why_it_works: 'Erreur d\'analyse, réessayer.' }
      }

      newReferences.push({
        url,
        platform: 'youtube',
        title: parsed.title ?? url,
        transcript,
        keep_points: parsed.keep_points ?? [],
        discard_points: parsed.discard_points ?? [],
        why_it_works: parsed.why_it_works ?? '',
        added_at: new Date(),
      })
    }

    const updated = await this.projectModel.findByIdAndUpdate(
      projectId,
      { $push: { reference_videos: { $each: newReferences } } },
      { new: true },
    )
    return updated!
  }

  // ── Pipeline: Correct script iteratively ─────────────────────────────────────

  async correctScript(projectId: string, instruction: string): Promise<VideoProjectDocument> {
    const project = await this.projectModel.findById(projectId)
    if (!project) throw new NotFoundException('Projet introuvable')
    if (!project.full_script) throw new BadRequestException('Aucun script à corriger. Génère-en un d\'abord.')

    const userPrompt = `Voici le script actuel d'une vidéo (e-commerce africain) :

"""${project.full_script}"""

Instruction de correction du créateur :
"${instruction}"

Réécris le script COMPLET en appliquant l'instruction. Garde ce qui marche, modifie seulement ce qui est demandé.
Réponds DIRECTEMENT par le script corrigé (sans intro, sans markdown autour, juste le script).`

    const result = await this.llm.generate(
      PREMIUM,
      {
        systemPrompt: "Tu es un expert en script vidéo pour le e-commerce en Afrique francophone. Tu corriges précisément selon l'instruction sans tout réécrire inutilement.",
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.6,
        maxTokens: 8192,
      },
      FALLBACK,
    )

    const newScript = result.text.trim()
    const correctionEntry = {
      id: new Types.ObjectId().toHexString(),
      instruction,
      result: newScript,
      at: new Date(),
    }

    const updated = await this.projectModel.findByIdAndUpdate(
      projectId,
      {
        $set: { full_script: newScript },
        $push: { script_correction_history: correctionEntry },
      },
      { new: true },
    )
    return updated!
  }

  // ── Pipeline: Suggest publish time ──────────────────────────────────────────

  async suggestPublishTime(projectId: string, userId: string): Promise<VideoProjectDocument> {
    const project = await this.projectModel.findById(projectId)
    if (!project) throw new NotFoundException('Projet introuvable')

    const bestVideos = await this.tracking.getOwnAccountsBestVideos(userId, 20)
    const platforms = project.platforms ?? ['youtube']
    const projectPlatform = platforms[0]

    const dataLines = bestVideos
      .filter((v) => v.published_at)
      .map((v) => {
        const d = new Date(v.published_at as Date)
        const day = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getUTCDay()]
        const hour = d.getUTCHours()
        return `- "${v.title.slice(0, 80)}" (${v.platform}) — publié ${day} ${hour}h UTC → ${v.views.toLocaleString('fr-FR')} vues`
      })
      .join('\n')

    const dataBlock = dataLines || 'Pas encore de données historiques de publication.'

    const userPrompt = `Tu suggères l'heure optimale de publication pour une vidéo sur ${projectPlatform}.

VIDÉO À PUBLIER : "${project.title}"
Format : ${project.format} / ${project.duration_type}
Audience : 18-35 ans, Afrique francophone (Côte d'Ivoire, Sénégal, Cameroun, France diaspora)

HISTORIQUE DES VIDÉOS LES MIEUX PERFORMANTES :
${dataBlock}

JSON strict :
{
  "suggestion": "Ex: Mercredi 19h GMT+0 (20h Abidjan)",
  "rationale": "2-3 phrases : pourquoi ce créneau marche pour cette audience et ce format"
}`

    const result = await this.llm.generate(
      PRIMARY,
      {
        systemPrompt: "Tu es un expert en stratégie de publication social media pour l'Afrique francophone. Tu réponds UNIQUEMENT en JSON valide.",
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.5,
        maxTokens: 512,
      },
      FALLBACK,
    )

    let parsed: { suggestion?: string; rationale?: string }
    try {
      parsed = JSON.parse(stripJsonFence(result.text))
    } catch {
      parsed = { suggestion: '', rationale: 'Erreur de génération.' }
    }

    const updated = await this.projectModel.findByIdAndUpdate(
      projectId,
      {
        publish_time_suggestion: parsed.suggestion ?? '',
        publish_time_rationale: parsed.rationale ?? '',
      },
      { new: true },
    )
    return updated!
  }

  // ── AI: Transcribe audio (Whisper) ───────────────────────────────────────────

  async transcribeAudio(buffer: Buffer, mimeType: string): Promise<{ text: string }> {
    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) throw new BadRequestException('GEMINI_API_KEY non configuré dans .env')

    const base64Audio = buffer.toString('base64')

    type GeminiResponse = {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    }

    const resp = await axios.post<GeminiResponse>(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
      {
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: base64Audio } },
            { text: 'Transcris cet enregistrement audio mot pour mot en français. Retourne uniquement la transcription brute, sans commentaire ni ponctuation ajoutée.' },
          ],
        }],
        generationConfig: { temperature: 0 },
      },
      { timeout: 60_000 },
    )

    const text = resp.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
    if (!text) throw new BadRequestException('Gemini n\'a retourné aucune transcription')

    return { text }
  }

  // ── Captures ──────────────────────────────────────────────────────────────────

  listCaptures(userId: string): Promise<ContentCaptureDocument[]> {
    return this.captureModel
      .find({ created_by: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec()
  }

  async createCapture(
    userId: string,
    dto: { text: string; source: 'text' | 'voice' },
  ): Promise<ContentCaptureDocument> {
    return this.captureModel.create({
      text: dto.text,
      source: dto.source ?? 'text',
      created_by: new Types.ObjectId(userId),
    })
  }

  async updateCapture(id: string, userId: string, text: string): Promise<ContentCaptureDocument> {
    const doc = await this.captureModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), created_by: new Types.ObjectId(userId) },
      { text },
      { new: true },
    )
    if (!doc) throw new NotFoundException('Capture introuvable')
    return doc
  }

  async deleteCapture(id: string, userId: string): Promise<void> {
    const doc = await this.captureModel.findOne({
      _id: new Types.ObjectId(id),
      created_by: new Types.ObjectId(userId),
    })
    if (!doc) throw new NotFoundException('Capture introuvable')
    await doc.deleteOne()
  }

  // ── Cron: Daily suggestions at midnight ──────────────────────────────────────

  @Cron('0 0 * * *')
  async dailySuggestionsJob(): Promise<void> {
    const userIds: unknown[] = await this.creatorModel.distinct('created_by')
    for (const userId of userIds) {
      try {
        await this.generateDailySuggestions(String(userId))
      } catch (e) {
        console.error(`[ContentCron] Daily suggestions failed for user ${userId}:`, e)
      }
    }
  }
}
