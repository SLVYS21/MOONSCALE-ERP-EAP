# Offres & Souscriptions — Moonscale ERP
**Version** : 2.0 — Mai 2026

---

## 1. Concept

Le système d'offres est la **source unique de vérité** pour tout ce qui concerne les produits vendus. Il est utilisé à la fois par le module Leads (offres proposées) et par le module Students (souscriptions créées après paiement).

```
                     ┌─────────────┐
                     │    Offer    │
                     │  (offre)    │
                     │             │
                     │ name        │
                     │ description │
                     │ features[]  │
                     │ isActive    │
                     └──────┬──────┘
                            │  1:N
                            ▼
                     ┌─────────────┐
                     │    Plan     │
                     │             │
                     │ name        │  ex: "Elite", "Premium", "Standard"
                     │ price       │
                     │ currency    │
                     │ durationMonths
                     │ partialDueAfterDays
                     │ isActive    │
                     └─────────────┘
                            │
              ┌─────────────┼─────────────┐
              │             │             │
              ▼             ▼             ▼
           Lead          Student      Transaction
        (offer_ids)    (Subscription) (offerId)
```

---

## 2. Structure d'une Offer

```typescript
{
  name:        string        // Ex: "ECOM AFRICA PRO"
  description: string        // Description longue
  features:    string[]      // Ex: ["5 modules", "Accès lifetime", "Support WhatsApp"]
  isActive:    boolean       // Si false, n'apparaît pas dans les nouveaux formulaires
  plans:       Plan[]        // Plans tarifaires associés
}
```

### Structure d'un Plan

```typescript
{
  name:                string   // Ex: "Elite"
  price:               number   // Ex: 350000
  currency:            string   // Ex: "XOF"
  durationMonths:      number   // Ex: 12 (durée de l'accès en mois)
  partialDueAfterDays: number   // Ex: 30 (délai avant 2ème versement si paiement partiel)
  isActive:            boolean
}
```

---

## 3. CRUD des offres

**Endpoints :**
```
GET    /subscription-offers              → Liste toutes les offres (actives ou toutes)
GET    /subscription-offers/:id          → Détail d'une offre avec ses plans
POST   /subscription-offers              → Créer une offre
PATCH  /subscription-offers/:id          → Modifier une offre
DELETE /subscription-offers/:id          → Supprimer (superadmin)

POST   /subscription-offers/:id/plans    → Ajouter un plan à une offre
PATCH  /subscription-offers/:id/plans/:planId → Modifier un plan
DELETE /subscription-offers/:id/plans/:planId → Supprimer un plan
```

**Paramètre de filtre :** `GET /subscription-offers?activeOnly=true`  
→ Retourne uniquement les offres avec `isActive=true`.

---

## 4. Relation avec les Leads

Chaque Lead peut être associé à une ou plusieurs offres (via `offer_ids`).

```
Lead.offer_ids = [ ObjectId("...ECOM PRO"), ObjectId("...COACHING") ]
```

Ces offres sont les **offres proposées au lead** lors de l'appel diagnostic. La conversion Lead→Étudiant ne transfère pas automatiquement ces offres en souscriptions — c'est l'admin qui crée la souscription lors du traitement du paiement.

**Avant la fusion (ancienne architecture) :**  
Les leads avaient leur propre schéma d'offres séparé (`leads/schemas/offer.schema.ts`). Ce schéma est maintenant supprimé.

**Après la fusion (architecture actuelle) :**  
`Lead.offer_ids` référence directement le modèle `Offer` du module `subscription-offers`. Les endpoints CRUD des offres sont sur `/subscription-offers`.

---

## 5. Souscriptions (Subscription)

Une souscription est créée quand un admin traite un paiement ET qu'une offre est associée.

### Structure

```typescript
{
  studentId:      ObjectId → Student
  studentEmail:   string             // dénormalisé pour faciliter les requêtes
  offerId:        ObjectId → Offer
  paymentId:      ObjectId → Payment  // paiement qui a créé la souscription
  offerName:      string             // dénormalisé
  offerPlan:      string             // dénormalisé (ex: "Elite")
  durationMonths: number
  startDate:      Date
  endDate:        Date               // startDate + durationMonths
  status:         'active' | 'expired' | 'cancelled'
  modality:       'Complet' | 'Partiel'
  paidAmount:     number             // montant déjà payé
  totalAmount:    number             // prix total de l'offre
  currency:       string
  nextPaymentDate: Date | null       // si Partiel : date du prochain versement
  remindersSent:  number
  lastReminderAt: Date | null
}
```

### Endpoints

```
GET  /subscription-offers/subscriptions/student/:email  → Souscriptions d'un étudiant
GET  /subscription-offers/subscriptions                 → Toutes (avec filtres)
```

---

## 6. Comment l'offre est-elle déterminée lors du traitement d'un paiement ?

### Ordre de priorité

```
1. offerId fourni explicitement par l'admin dans la modale "Traiter"
   → Utilisé tel quel
        ↓ (si absent)
2. Auto-lookup via ProductMapping confirmé
   → Cherche un ProductMapping avec productName = payment.product ET status = 'confirmed'
   → Utilise son offerId
        ↓ (si absent aussi)
3. Aucune souscription créée
   → Le paiement est traité, Circle est géré, mais pas de Subscription
   → L'admin peut en créer une manuellement depuis la fiche étudiant
```

---

## 7. Affichage dans l'interface

### Page Subscription-Offers (catalogue)
- Liste de toutes les offres avec leurs plans
- Bouton "Ajouter une offre" → formulaire avec nom, description, features[]
- Chaque offre peut être développée pour voir ses plans
- Bouton "Ajouter un plan" par offre

### Fiche étudiant → onglet Souscriptions
- Affiche toutes les souscriptions de l'étudiant
- Statut (active/expired/cancelled)
- Montant payé vs total
- Prochaine date d'échéance (si partiel)
- Jours avant expiration

### Finances → Liste des transactions
- Dropdown "Offre" dans la modale d'édition d'une transaction
- Utilise `GET /subscription-offers` pour lister les offres disponibles

### Leads → Lead Card
- Dropdown "Offres proposées" → utilise `GET /subscription-offers?activeOnly=true`

---

## 8. Cycle de vie d'une souscription

```
[created] → active
              │
              ├── Paiement Complet → reste active jusqu'à endDate
              │
              └── Paiement Partiel
                    │
                    ├── Rappels envoyés (J-7, J-3, J-0)
                    │
                    ├── Paiement du solde → paidAmount mis à jour
                    │
                    └── Non-paiement → Student.debtStatus = 'confirmed'
                                       accès Circle restreint

              │
              ▼ (après endDate)
           expired

   Admin annule manuellement → cancelled
```

---

## 9. Règles métier importantes

| Règle | Description |
|-------|-------------|
| Une offre inactive | N'apparaît pas dans les dropdowns de création mais reste visible sur les souscriptions existantes |
| Plusieurs souscriptions actives | Un étudiant peut avoir plusieurs souscriptions actives en même temps (ex: formation + coaching) |
| `studentEmail` dénormalisé | Permet de trouver les souscriptions par email sans jointure, même si l'étudiant n'existe pas encore en DB |
| `partialDueAfterDays` | Utilisé pour calculer `nextPaymentDate = startDate + X jours`. Cette date alimente les rappels. |
| Suppression d'offre | Non recommandée si des souscriptions y sont liées. Désactiver (`isActive=false`) plutôt que supprimer. |

---

## 10. Exemple concret — offre "ECOM AFRICA PRO"

```json
{
  "name": "ECOM AFRICA PRO",
  "description": "Formation e-commerce complète avec accès lifetime à la communauté Circle",
  "features": [
    "5 modules de formation",
    "Accès lifetime à la communauté",
    "Support WhatsApp dédié",
    "Sessions coaching mensuelles",
    "Mises à jour gratuites"
  ],
  "isActive": true,
  "plans": [
    {
      "name": "Elite",
      "price": 350000,
      "currency": "XOF",
      "durationMonths": 12,
      "partialDueAfterDays": 30,
      "isActive": true
    },
    {
      "name": "Premium",
      "price": 250000,
      "currency": "XOF",
      "durationMonths": 12,
      "partialDueAfterDays": 30,
      "isActive": true
    },
    {
      "name": "Standard",
      "price": 150000,
      "currency": "XOF",
      "durationMonths": 6,
      "partialDueAfterDays": 30,
      "isActive": true
    }
  ]
}
```

**Ce qui se passe quand un étudiant prend le plan Elite en partiel :**
1. Paiement initial reçu (ex: 175 000 XOF)
2. Admin traite → sélectionne offre "ECOM AFRICA PRO", plan "Elite"
3. Souscription créée :
   - `startDate = aujourd'hui`
   - `endDate = dans 12 mois`
   - `paidAmount = 175 000`
   - `totalAmount = 350 000`
   - `nextPaymentDate = aujourd'hui + 30 jours`
4. Rappels programmés à J-7, J-3, J-0 avant `nextPaymentDate`
5. L'étudiant paie le solde → admin traite le complément
6. `paidAmount → 350 000` (si mis à jour manuellement)
