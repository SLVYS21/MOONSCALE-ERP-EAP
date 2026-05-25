# Architecture — Moonscale ERP
**Version** : 2.0 — Mai 2026  
**Stack** : NestJS (TypeScript) + MongoDB (Mongoose) + React (Vite + TailwindCSS)

---

## 1. Vue d'ensemble des modules

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MOONSCALE ERP                                │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
│  │  Leads   │   │ Students │   │ Finances │   │  Automations   │  │
│  │ Acquis.  │──▶│ Cycle    │──▶│ Revenus  │   │  Engine        │  │
│  │ Pipeline │   │ de vie   │   │ Dépenses │   │  16 triggers   │  │
│  └──────────┘   └──────────┘   └──────────┘   │  14 actions    │  │
│       │               │              │         └────────────────┘  │
│       │               │              │                ▲            │
│       ▼               ▼              ▼                │            │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐          │            │
│  │  Offers  │   │  Circle  │   │  Mail    │           │            │
│  │  Plans   │   │  (comm.) │   │  Engine  │───────────┘            │
│  │  Subscr. │   │  Tags    │   │          │                        │
│  └──────────┘   └──────────┘   └──────────┘                        │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
│  │ Airtable │   │   OCR    │   │Cloudinary│   │  Auth / Users  │  │
│  │  Sync    │   │ Preuves  │   │  Upload  │   │  JWT + Rôles   │  │
│  └──────────┘   └──────────┘   └──────────┘   └────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Modules — Rôle et responsabilité

| Module | Responsabilité principale | Collections MongoDB |
|--------|--------------------------|---------------------|
| **Students** | Cycle de vie complet de l'étudiant : création, paiements, Circle, rappels, historique | `students`, `payments`, `reminders`, `formationdashboards`, `coachingdashboards` |
| **Leads** | Acquisition et pipeline commercial : qualification, scoring, appels, offres | `leads` |
| **Offers** | Catalogue unifié des offres et plans tarifaires (source unique) | `offers`, `plans` |
| **Subscriptions** | Suivi des souscriptions actives d'un étudiant à une offre | `subscriptions` |
| **Finances** | Transactions financières (revenus + dépenses), sync des gateways de paiement, mappings produits | `transactions`, `financecategories`, `productmappings` |
| **Automations** | Moteur d'automatisation événementielle : triggers → conditions → étapes | `automations`, `automationruns` |
| **Circle** | Client API Circle.so : invitation, tags, accès, sync profil | _(pas de collection)_ |
| **Mail** | Envoi d'emails (nodemailer) : rappels, confirmations, emails d'automatisation | _(pas de collection)_ |
| **OCR** | Analyse des preuves de paiement (images/PDF) via modèle IA | _(pas de collection)_ |
| **Cloudinary** | Upload et stockage des images de preuves de paiement | _(pas de collection)_ |
| **Airtable** | Synchronisation bidirectionnelle des données de formation/coaching vers Airtable | _(pas de collection)_ |
| **Auth / Users** | Authentification JWT, rôles (`superadmin`, `admin`, `user`) | `users` |

---

## 3. Relations entre collections

```
Offer ──────────────────────┐
 │ (plans[])                │
 ▼                          │
Plan                        │
                            │
Lead ──────────── offer_ids ┘ (plusieurs offres possibles)
 │
 └── student_id ──────────▶ Student ◀──── Payment (studentId)
                                │                │
                                │                └── Subscription (studentId, offerId)
                                │
                                └── FormationDashboard (studentId)
                                └── CoachingDashboard  (studentId)
                                └── Reminder           (studentId)

Transaction ──── studentId ──▶ Student  (auto-link par email)
            └─── leadId    ──▶ Lead     (auto-link par email)
            └─── categoryId──▶ FinanceCategory
            └─── offerId   ──▶ Offer    (via ProductMapping confirmé)

ProductMapping ── offerId ──▶ Offer     (mapping nom produit → offre)
```

### Règle de référence clé
> **Une seule collection `offers`** (module `subscription-offers`) sert à la fois pour les leads ET pour les souscriptions étudiants. Il n'y a pas de schéma séparé par module.

---

## 4. Flux de données principaux

### Flux d'acquisition (Lead)
```
Typebot webhook → POST /leads/webhook/typebot
  → Création Lead (source_type='typebot')
  → Score de qualification automatique
  → Trigger automation 'lead_created'
  → (optionnel) notification équipe
```

### Flux de paiement (Student)
```
Tally webhook → POST /students/webhook/tally
  → findOrCreateStudent()
  → Création Payment (status='NON TRAITÉ')
  → Trigger automation 'payment_created'

Admin → POST /payments/:id/treat
  → treatPayment()
    ├── Auto-lookup offerId via ProductMapping confirmé
    ├── Circle: invite + tag + accès
    ├── Upsert FormationDashboard + CoachingDashboard
    ├── Création Subscription (si offerId résolu)
    ├── Création Reminder (si paiement Partiel)
    ├── Lead → Won conversion (si email = lead connu)
    ├── History append 'payment_treated'
    ├── Trigger automation 'payment_treated'
    └── Sync Airtable (async)
```

### Flux financier (Transaction)
```
Gateway → Sync ou Webhook
  → recordGatewayTransaction()
    ├── Déduplication par référence externe
    ├── auto-link studentId/leadId par customerEmail
    └── Création/update ProductMapping pour ce produit

Admin → GET /finances/transactions
  → Liste avec filtres, pagination, populate catégorie
```

### Flux d'automatisation
```
Événement système (ex: payment_treated)
  → automationsService.triggerEvent(eventType, ctx)
    → Cherche toutes les automations actives avec ce trigger
    → Pour chaque automation:
        Pour chaque étape (step):
          → Vérifier conditions (skip si échec, pas d'abort)
          → Exécuter l'action (send_email, circle_tag_add, etc.)
          → Logger le résultat dans AutomationRun
```

---

## 5. Rôles et permissions

| Rôle | Accès | Restrictions |
|------|-------|--------------|
| `superadmin` | Tout | Aucune |
| `admin` | Lecture + Écriture sur tous les modules | Ne peut pas exécuter certains endpoints destructifs (`backfill-links`, `migrate`) |
| `user` | Lecture seule | Pas de création/modification/suppression |

**Guards actifs :**
- `JwtAuthGuard` : présent sur toutes les routes (sauf webhooks publics)
- `RolesGuard` : présent sur les routes sensibles (delete, sync, restrict)

---

## 6. Variables d'environnement requises

| Variable | Module | Usage |
|----------|--------|-------|
| `MONGODB_URI` | Core | Connexion base de données |
| `JWT_SECRET` | Auth | Signature des tokens |
| `CIRCLE_API_KEY` | Circle | Authentification API Circle.so |
| `CIRCLE_COMMUNITY_ID` | Circle | ID de la communauté |
| `AIRTABLE_API_KEY` | Airtable | Authentification Airtable |
| `AIRTABLE_BASE_ID` | Airtable | Base de données Airtable |
| `CLOUDINARY_*` | Cloudinary | Upload images |
| `SMTP_*` | Mail | Envoi emails (nodemailer) |
| `CHARIOW_API_KEY` | Finances | Sync ventes Chariow |
| `STRIPE_SECRET_KEY` | Finances | Sync charges Stripe |
| `GROQ_API_KEY` | Finances | Suggestions automatiques ProductMapping |
| `TALLY_WEBHOOK_SECRET` | Students | Vérification webhooks Tally |

---

## 7. Structure des dossiers backend

```
src/
├── common/
│   ├── decorators/       # @CurrentUser, @Roles
│   └── guards/           # JwtAuthGuard, RolesGuard
├── modules/
│   ├── auth/
│   ├── users/
│   ├── students/         # Cœur métier : étudiants + paiements
│   │   ├── schemas/      # student, payment, reminder, dashboards
│   │   ├── students.service.ts
│   │   └── students.controller.ts
│   ├── leads/            # Acquisition + pipeline
│   ├── offers/           # Catalogue offres (source unique)
│   ├── finances/         # Transactions + gateways + mappings
│   ├── automations/      # Moteur d'automatisation
│   ├── circle/           # Client API Circle.so
│   ├── mail/             # Envoi emails
│   ├── airtable/         # Sync Airtable
│   ├── ocr/              # Analyse preuves de paiement
│   └── cloudinary/       # Upload fichiers
└── app.module.ts
```
