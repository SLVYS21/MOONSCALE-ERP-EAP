// One-shot seed script: node -e "require('./dist/modules/leads/leads.seed')"
// Or call seedOffers() from AppModule.onApplicationBootstrap if needed.

export const DEFAULT_SCORING_RULES = [
  { name: 'A un email',              condition_field: 'email',              condition_operator: 'not_null', points: 20, is_active: true },
  { name: 'A un téléphone',          condition_field: 'phone',              condition_operator: 'not_null', points: 15, is_active: true },
  { name: 'A exprimé une motivation',condition_field: 'motivation',         condition_operator: 'not_null', points: 20, is_active: true },
  { name: 'A indiqué son âge',       condition_field: 'age',                condition_operator: 'not_null', points: 5,  is_active: true },
  { name: 'A indiqué son réseau',    condition_field: 'reseau_source',      condition_operator: 'not_null', points: 5,  is_active: true },
  { name: 'Vient de Meta Ads',       condition_field: 'source_type',        condition_operator: 'equals',   condition_value: 'meta_ads',  points: 8, is_active: true },
  { name: 'A un montant potentiel',  condition_field: 'opportunity_amount', condition_operator: 'not_null', points: 10, is_active: true },
]
// Thresholds: MQL ≥ 20 (juste email), SQL ≥ 50 (email + téléphone + motivation)

export const DEFAULT_OFFERS = [
  {
    name: 'Formation EAP',
    type: 'online' as const,
    price: 0,
    currency: 'XOF',
    is_active: true,
    can_be_coupled: false,
  },
  {
    name: 'Bootcamp Présentiel',
    type: 'bootcamp' as const,
    price: 0,
    currency: 'XOF',
    is_active: true,
    can_be_coupled: false,
  },
  {
    name: 'Coaching en ligne',
    type: 'one_to_one' as const,
    price: 0,
    currency: 'XOF',
    is_active: true,
    can_be_coupled: false,
  },
  {
    name: 'Coaching Afrispy',
    type: 'presentiel' as const,
    price: 0,
    currency: 'XOF',
    is_active: true,
    can_be_coupled: true,
  },
]
