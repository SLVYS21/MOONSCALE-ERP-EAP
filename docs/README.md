# Documentation Moonscale ERP
**Version** : 2.0 — Mai 2026

---

## Fichiers de documentation

| Fichier | Contenu |
|---------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Vue d'ensemble des modules, relations entre collections, flux de données, rôles, variables d'environnement |
| [STUDENT_LIFECYCLE.md](./STUDENT_LIFECYCLE.md) | Cycle de vie complet d'un étudiant : webhook Tally → traitement → Circle → rappels → restriction → restauration |
| [AUTOMATIONS.md](./AUTOMATIONS.md) | Moteur d'automatisation : tous les triggers, tous les types d'étapes, variables disponibles, éditeur de blocs email |
| [FINANCES.md](./FINANCES.md) | Transactions, sync des gateways (Chariow/Stripe/FedaPay/PawaPay), ProductMappings, catégories, stats |
| [OFFERS_AND_SUBSCRIPTIONS.md](./OFFERS_AND_SUBSCRIPTIONS.md) | Catalogue des offres unifié, plans tarifaires, souscriptions, cycle de vie |
| [USER_JOURNEYS.md](./USER_JOURNEYS.md) | Parcours utilisateurs pas-à-pas : traiter un paiement, gérer un débiteur, changer un email, créer une campagne, etc. |
| [../leads.md](../leads.md) | Module Leads : sources, Lead Card, pipeline commercial, appels, analytics |

---

## Lecture recommandée selon votre rôle

### Admin (équipe opérationnelle)
1. [USER_JOURNEYS.md](./USER_JOURNEYS.md) — Commencer ici, cas pratiques
2. [STUDENT_LIFECYCLE.md](./STUDENT_LIFECYCLE.md) — Comprendre ce qui se passe quand on traite un paiement
3. [AUTOMATIONS.md](./AUTOMATIONS.md) — Configurer des automatisations sans code

### Développeur
1. [ARCHITECTURE.md](./ARCHITECTURE.md) — Vue d'ensemble technique
2. [STUDENT_LIFECYCLE.md](./STUDENT_LIFECYCLE.md) — Séquence détaillée de `treatPayment()`
3. [AUTOMATIONS.md](./AUTOMATIONS.md) — Moteur d'automatisation : triggers, étapes, variables
4. [FINANCES.md](./FINANCES.md) — Module finances et auto-link

### Commercial / Closer
1. [../leads.md](../leads.md) — Module Leads complet
2. [OFFERS_AND_SUBSCRIPTIONS.md](./OFFERS_AND_SUBSCRIPTIONS.md) — Offres et plans disponibles
3. [USER_JOURNEYS.md](./USER_JOURNEYS.md) — Section "Suivre un lead jusqu'à la vente"

---

## Schéma de flux global

```
                    ┌─────────────────────────────────┐
                    │         SOURCES D'ENTRÉE          │
                    │                                   │
                    │  Tally    Typebot    Chariow      │
                    │  (forms)  (leads)   (ventes)      │
                    └──────┬──────────┬────────┬────────┘
                           │          │        │
                           ▼          ▼        ▼
                    ┌──────────┐ ┌────────┐ ┌─────────┐
                    │ Students │ │  Leads │ │Finances │
                    │ Payments │ │Pipeline│ │Transactions
                    └────┬─────┘ └───┬────┘ └────┬────┘
                         │           │            │
                         │     Lead Won           │ auto-link
                         └─────────▶ ◀────────────┘
                                    │ (par email)
                                    ▼
                         ┌──────────────────┐
                         │   AUTOMATIONS    │
                         │                  │
                         │ payment_treated  │
                         │ lead_won         │
                         │ reminder_due     │
                         │ debt_detected    │
                         └──────────────────┘
                                    │
                    ┌───────────────┼────────────────┐
                    ▼               ▼                ▼
              ┌──────────┐  ┌────────────┐  ┌────────────┐
              │  Circle  │  │   Email    │  │  Équipe    │
              │ invite   │  │  (blocks)  │  │ (notif)    │
              │ tags     │  │            │  │            │
              └──────────┘  └────────────┘  └────────────┘
```

---

## Points de configuration importants

### Pour que le système fonctionne correctement

| Configuration | Où | Impact |
|--------------|-----|--------|
| Variables d'environnement SMTP | `.env` backend | Envoi des emails |
| `CIRCLE_API_KEY` + `CIRCLE_COMMUNITY_ID` | `.env` backend | Invitations et tags Circle |
| Catégories financières | Finances → Catégories → "Initialiser" | Classement des transactions |
| ProductMappings confirmés | Finances → Mappings produits | Auto-création souscriptions |
| Automatisations activées | Automations → toggle | Déclenchement automatique |

### Pour les paiements partiels

- S'assurer que chaque offre a un `partialDueAfterDays` renseigné
- Vérifier que le cron de rappels est actif (ou l'exécuter manuellement)
- S'assurer que l'automatisation `reminder_due` est configurée avec l'URL de paiement
