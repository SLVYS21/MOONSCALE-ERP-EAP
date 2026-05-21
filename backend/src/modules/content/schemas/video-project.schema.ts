import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

export type VideoProjectDocument = VideoProject & Document
export type ContentStatus = 'idee' | 'script' | 'tournage' | 'montage' | 'publie'
export type ContentPlatform = 'youtube' | 'tiktok' | 'facebook' | 'instagram' | 'whatsapp'
export type ContentCategory = 'educatif' | 'preuve-sociale' | 'viral' | 'podcast'
export type ContentFormat =
  | 'talking-head' | 'valeur-ecommerce' | 'mindset' | 'etude-de-cas' | 'erreurs-lecons'
  | 'interview-etudiant' | 'challenge'
  | 'comparatif' | 'vision-marche' | 'coulisses' | 'personnalite'
  | 'podcast'
export type DurationType = 'court' | 'long'

export interface ChecklistItem { id: string; label: string; done: boolean }
export interface Hook { text: string; selected: boolean }

export function defaultVideoChecklist(): ChecklistItem[] {
  return [
    { id: 'script',      label: 'Script finalisé',            done: false },
    { id: 'thumbnail',   label: 'Miniature créée',            done: false },
    { id: 'tournage',    label: 'Tournage effectué',          done: false },
    { id: 'montage',     label: 'Montage terminé',            done: false },
    { id: 'description', label: 'Description SEO rédigée',    done: false },
    { id: 'hashtags',    label: 'Hashtags ajoutés',           done: false },
    { id: 'scheduled',   label: 'Planifié sur la plateforme', done: false },
  ]
}

export function defaultPodcastChecklist(): ChecklistItem[] {
  return [
    { id: 'invite',    label: 'Invité contacté et confirmé', done: false },
    { id: 'questions', label: 'Questions préparées',         done: false },
    { id: 'setup',     label: 'Setup technique vérifié',     done: false },
    { id: 'tournage',  label: 'Enregistrement effectué',     done: false },
    { id: 'montage',   label: 'Montage et chapitres',        done: false },
    { id: 'thumbnail', label: 'Miniature créée',             done: false },
    { id: 'scheduled', label: 'Publié sur la plateforme',    done: false },
  ]
}

export function defaultChallengeChecklist(): ChecklistItem[] {
  return [
    { id: 'plan',      label: 'Plan des épisodes défini',   done: false },
    { id: 'ep1',       label: 'Épisode 1 tourné et monté',  done: false },
    { id: 'ongoing',   label: 'Épisodes suivants en cours', done: false },
    { id: 'bilan',     label: 'Bilan final réalisé',        done: false },
    { id: 'scheduled', label: 'Série complète publiée',     done: false },
  ]
}

@Schema({ timestamps: true })
export class VideoProject {
  @Prop({ required: true }) title: string
  @Prop({ default: '' }) description: string

  @Prop({ type: String, enum: ['idee', 'script', 'tournage', 'montage', 'publie'], default: 'idee' })
  status: ContentStatus

  @Prop({ type: [String], default: ['youtube'] }) platforms: ContentPlatform[]

  @Prop({ type: String, enum: ['educatif', 'preuve-sociale', 'viral', 'podcast'], default: 'educatif' })
  category: ContentCategory

  @Prop({
    type: String,
    enum: [
      'talking-head', 'valeur-ecommerce', 'mindset', 'etude-de-cas', 'erreurs-lecons',
      'interview-etudiant', 'challenge',
      'comparatif', 'vision-marche', 'coulisses', 'personnalite',
      'podcast',
    ],
    default: 'talking-head',
  })
  format: ContentFormat

  @Prop({ type: String, enum: ['court', 'long'], default: 'long' })
  duration_type: DurationType

  @Prop({ type: Date, default: null }) target_date: Date | null
  @Prop({ type: String, default: null }) published_url: string | null
  @Prop({ type: String, default: null }) youtube_ref_url: string | null
  @Prop({ default: '' }) notes: string
  @Prop({ default: '' }) brain_dump: string

  // Contenu structuré
  @Prop({ default: '' }) value_proposition: string
  @Prop({ type: [String], default: [] }) key_points: string[]
  @Prop({ type: String, default: null }) guest_name: string | null
  @Prop({ default: '' }) guest_value: string

  // IA
  @Prop({ default: '' }) analysis: string
  @Prop({
    type: [{ _id: false, text: String, selected: { type: Boolean, default: false } }],
    default: [],
  })
  hooks: Hook[]

  @Prop({ default: '' }) script_outline: string
  @Prop({ default: '' }) full_script: string
  @Prop({ type: [String], default: [] }) thumbnail_descriptions: string[]
  @Prop({ type: [String], default: [] }) generated_thumbnails: string[]
  @Prop({ type: [String], default: [] }) suggested_questions: string[]

  // Checklist
  @Prop({
    type: [{
      _id: false,
      id: { type: String, required: true },
      label: { type: String, required: true },
      done: { type: Boolean, default: false },
    }],
    default: defaultVideoChecklist,
  })
  checklist: ChecklistItem[]

  @Prop({ default: 0 }) order: number

  @Prop({ type: Types.ObjectId, ref: 'User', default: null })
  created_by: Types.ObjectId | null
}

export const VideoProjectSchema = SchemaFactory.createForClass(VideoProject)
VideoProjectSchema.index({ created_by: 1, status: 1 })
VideoProjectSchema.index({ created_by: 1, category: 1 })
VideoProjectSchema.index({ created_by: 1, target_date: 1 })
