import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document } from 'mongoose'

export type EapScoringRuleDocument = EapScoringRule & Document

// Catégories single-pick = on prend la 1ère règle qui matche (par priorité desc).
// Catégories additives (bonus/malus/disqualification) = on cumule toutes les matches.
export type EapRuleCategory =
  | 'pack'
  | 'acompte'
  | 'objectif_gain'
  | 'connaissance_myril'
  | 'experience_ecom'
  | 'invest_formation'
  | 'situation_pro'
  | 'bonus'
  | 'malus'
  | 'disqualification'

export type EapMatchType =
  | 'pack_tier'             // tier A/B/C/D/E extrait de q15_pack_choisi
  | 'amount_range'          // extrait montant FCFA et compare à min/max
  | 'regex'                 // regex sur un champ texte
  | 'text_length'           // longueur de texte (+ option ponctuation)
  | 'contains_any'          // champ contient un mot d'une liste (insensitive)
  | 'pack_acompte_combo'    // condition combinée pack + montant acompte (pour malus incohérence)
  | 'age_below'             // pour disqualification âge < N
  | 'phone_invalid'         // pour disqualification WhatsApp invalide

// Champ source EAP (clés normalisées depuis Typebot)
export type EapSourceField =
  | 'q9_situation_pro'
  | 'q10_experience_ecom'
  | 'q11_invest_formation'
  | 'q12_connaissance_myril'
  | 'q14_objectif_gain'
  | 'q15_pack_choisi'
  | 'q16_montant_acompte'
  | 'commentaire_libre'
  | 'motivation'
  | 'pays'
  | 'age'
  | 'phone'

// Match configs typés — stockés en sous-document libre pour flexibilité
export interface MatchConfig {
  // pack_tier
  tier?: 'A' | 'B' | 'C' | 'D' | 'E'
  // amount_range
  field?: EapSourceField
  min_amount?: number | null
  max_amount?: number | null
  // regex
  pattern?: string
  case_insensitive?: boolean
  // text_length
  min_length?: number
  requires_punctuation?: boolean
  // contains_any
  values?: string[]
  // pack_acompte_combo
  pack_tiers?: Array<'A' | 'B' | 'C' | 'D' | 'E'>
  acompte_threshold?: number
  acompte_compare?: '<' | '>'
  // age_below
  age_threshold?: number
}

@Schema({ timestamps: true })
export class EapScoringRule {
  // Identifiant stable utilisé pour le seed + lookup. Non éditable côté UI.
  @Prop({ required: true, unique: true }) key: string

  @Prop({ required: true })
  category: EapRuleCategory

  @Prop({ required: true }) label: string
  @Prop({ type: String, default: '' }) description: string

  @Prop({ required: true })
  match_type: EapMatchType

  @Prop({ type: Object, default: {} })
  match_config: MatchConfig

  @Prop({ type: Number, required: true }) points: number

  // Plus la priorité est haute, plus la règle est testée tôt.
  // Pour les catégories "single-pick" (pack/acompte/objectif/...), seule
  // la première règle qui match compte.
  @Prop({ type: Number, default: 0 }) priority: number

  @Prop({ type: Number, default: 0 }) display_order: number

  @Prop({ type: Boolean, default: true }) is_active: boolean

  // is_system = règle seed officielle ; ne peut pas être supprimée, mais
  // ses points / matching peuvent être édités.
  @Prop({ type: Boolean, default: false }) is_system: boolean

  // Pour disqualification : raison affichée si la règle déclenche
  @Prop({ type: String, default: '' }) disqualification_reason: string
}

export const EapScoringRuleSchema = SchemaFactory.createForClass(EapScoringRule)
EapScoringRuleSchema.index({ category: 1, priority: -1 })
