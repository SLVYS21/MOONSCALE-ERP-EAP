# Module Finances — Moonscale ERP
**Version** : 2.0 — Mai 2026

---

## 1. Vue d'ensemble

Le module finances centralise **tous les flux d'argent** (revenus + dépenses) dans un seul endroit, quelle que soit leur source (paiement étudiant, vente en ligne, dépense manuelle).

```
┌─────────────────────────────────────────────────────────┐
│                   SOURCES DE REVENUS                    │
│                                                         │
│  Chariow (ventes)  Stripe  FedaPay CSV/XLSX  PawaPay   │
│       │               │          │              │       │
│       └───────────────┴──────────┴──────────────┘       │
│                           │                             │
│                    Sync / Webhook                       │
│                           │                             │
│                           ▼                             │
│              ┌─────────────────────┐                    │
│              │   Transaction DB    │                    │
│              │  type: income       │                    │
│              │  amount, currency   │                    │
│              │  gateway, status    │                    │
│              │  customerEmail ─────┼──▶ Student ou Lead │
│              │  offerId ───────────┼──▶ Offer           │
│              │  categoryId ────────┼──▶ FinanceCategory │
│              └─────────────────────┘                    │
│                           │                             │
│                    + Dépenses manuelles                 │
│                    (type: expense)                      │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Sources de données

### 2.1 Sync Chariow

**Endpoint** : `POST /finances/sync/chariow`  
**Nécessite** : `CHARIOW_API_KEY`

- Récupère toutes les ventes complétées depuis le 1er juin 2025
- Déduplication par `reference` (ID Chariow)
- Chaque vente crée une transaction `type='income'`, `gateway='chariow'`
- `productName` renseigné depuis le nom de l'article vendu
- `recordGatewayTransaction()` → auto-link étudiant/lead par email

### 2.2 Sync Stripe

**Endpoint** : `POST /finances/sync/stripe`  
**Nécessite** : `STRIPE_SECRET_KEY`

- Récupère les charges + virements depuis le 1er juin 2025
- Charges → `type='income'`
- Virements (payouts) → `type='expense'` avec `gateway='stripe_payout'`
- Déduplication par ID Stripe

### 2.3 Import FedaPay CSV

**Endpoint** : `POST /finances/sync/fedapay-csv` (multipart, champ `file`)

- Upload d'un export CSV depuis le dashboard FedaPay
- Parser les colonnes : id, montant, statut, date, téléphone client, description

### 2.4 Import FedaPay XLSX

**Endpoint** : `POST /finances/sync/fedapay-xlsx` (multipart, champ `file`)

- Upload du fichier `exports_transactions-YYYY-MM-DD.xlsx`
- Format attendu : colonnes Transaction ID, Montant, Date, Statut, Nom client, Email

### 2.5 PawaPay (webhooks uniquement)

**Endpoint** : `POST /finances/webhook/pawapay`

- PawaPay n'a pas d'API historique
- Les transactions arrivent uniquement en temps réel via webhook
- `POST /finances/sync/pawapay` → retourne un message d'info (pas de sync possible)

### 2.6 Création manuelle

Disponible dans l'interface. Revenus ou dépenses avec tous les champs.

---

## 3. Structure d'une Transaction

```typescript
{
  // Type et montant
  type:        'income' | 'expense'
  amount:      number
  currency:    'EUR' | 'USD' | 'XOF' | 'MAD' | 'CAD'
  description: string

  // Catégorisation
  categoryId:  ObjectId → FinanceCategory
  offerId:     ObjectId → Offer   (optionnel, produit vendu)
  productName: string             (nom brut du produit, avant mapping)

  // Gateway
  gateway:     string
  reference:   string             (ID externe, pour déduplication)
  status:      'pending' | 'completed' | 'failed' | 'refunded'

  // Client
  customerEmail: string
  customerName:  string
  customerPhone: string

  // Liens automatiques (Phase 1B)
  studentId:   ObjectId → Student   (null si non trouvé)
  leadId:      ObjectId → Lead      (null si non trouvé)

  // Métadonnées
  date:        Date
  createdById: ObjectId → User
}
```

---

## 4. Auto-link Transaction ↔ Étudiant/Lead

À chaque création de transaction (sync ou manuelle), `autoLinkTransaction()` est appelé :

```
tx.customerEmail  →  Student.email (comparaison lowercase)
                         │
                      Trouvé ?
                         │
               ┌────Yes──┴──No────┐
               │                  │
    studentId = student._id     Lead.email ?
                                   │
                              Trouvé ?
                                   │
                          ┌───Yes──┴──No────┐
                          │                 │
               leadId = lead._id       rien (pas de lien)
```

**Backfill** : `POST /finances/transactions/backfill-links` (superadmin)  
→ Parcourt toutes les transactions sans `studentId`/`leadId` et applique l'auto-link.

**Effet visuel** : chips cliquables "Étudiant" (indigo) ou "Lead" (teal) dans la liste des transactions.

**Indicateur débiteur** (Phase 3J) : badge orange "⚠ En retard" sur les transactions dont l'email correspond à un étudiant avec `debtStatus='confirmed'`.

---

## 5. ProductMapping — Liaison nom produit ↔ Offre

### Problème
Les noms de produits venant des gateways (Chariow, FedaPay) ne correspondent pas exactement aux noms d'offres dans le système.

**Exemple :**
- Chariow envoie : `"Ecom Africa Pro - Plan Elite (paiement partiel)"`
- L'offre dans l'ERP s'appelle : `"ECOM AFRICA PRO"`

### Solution : ProductMapping

À chaque transaction avec un `productName` inconnu, l'ERP crée ou met à jour un `ProductMapping` :

```typescript
{
  productName: "Ecom Africa Pro - Plan Elite (paiement partiel)",  // nom brut du gateway
  gateway:     "chariow",
  status:      'pending',   // → 'confirmed' | 'ignored'
  offerId:     null,        // renseigné par l'admin
  offerName:   null,
  suggestedOfferId:   ObjectId,  // suggestion automatique via Groq IA
  suggestedOfferName: "ECOM AFRICA PRO",
  groqReasoning: "Le nom contient 'Ecom Africa Pro'...",
  seenCount:   14,          // combien de fois ce produit a été rencontré
}
```

### Workflow admin

```
1. Aller dans Finances → Mappings produits
2. Voir la liste des mappings "pending" (non résolus)
3. Pour chaque mapping :
   ├── Voir la suggestion Groq (si disponible)
   ├── Choisir l'offre correspondante dans le dropdown
   └── Cliquer "Confirmer" → status='confirmed', offerId renseigné

4. Optionnel : "Ignorer" si le produit n'a pas d'offre correspondante
5. "Réinitialiser" pour remettre en 'pending' si erreur
```

### Utilisation du mapping confirmé

Quand `treatPayment()` est appelé sans `offerId` :
```
payment.product = "ECOM AFRICA PRO"
  ↓
findOne({ productName: "ECOM AFRICA PRO", status: 'confirmed' })
  ↓
Si trouvé → offerId = mapping.offerId
  ↓
Création automatique de la Subscription
```

---

## 6. Catégories de transactions

Les catégories permettent de classer les transactions pour les rapports.

**Champs :**
```typescript
{
  name:  string    // ex: "Paiement formation"
  type:  'income' | 'expense' | 'both'
  color: string    // hex color
  icon:  string    // emoji ou texte court
}
```

**Catégories par défaut** (seed) :
`POST /finances/categories/seed-defaults`

→ Crée les catégories standards si elles n'existent pas encore.

---

## 7. Édition inline d'une transaction

Sur la liste des transactions, chaque ligne a un bouton crayon (admins) → modale d'édition :

- **Catégorie** : dropdown des catégories filtrées par type
- **Offre / Produit** : dropdown `GET /subscription-offers` + champ texte libre `productName`

**Endpoint** : `PATCH /finances/transactions/:id`  
**Champs modifiables** : `categoryId`, `offerId`, `productName`, `type`, `amount`, `currency`, `description`, `gateway`, `status`, `reference`, `notes`

---

## 8. Stats financières

**Endpoint** : `GET /finances/stats?currency=EUR`

Retourne pour la devise demandée :
- Total revenus (toutes transactions completed)
- Total dépenses
- Solde net
- Revenus du mois courant
- Dépenses du mois courant
- Répartition par gateway
- Répartition par catégorie

---

## 9. Filtres de la liste des transactions

`GET /finances/transactions` avec paramètres :

| Paramètre | Description |
|-----------|-------------|
| `type` | `income` ou `expense` |
| `categoryId` | Filtrer par catégorie |
| `gateway` | Filtrer par passerelle |
| `status` | `pending`, `completed`, `failed`, `refunded` |
| `currency` | Filtrer par devise |
| `search` | Recherche dans email, nom, téléphone, produit, description |
| `dateFrom` | Date de début (YYYY-MM-DD) |
| `dateTo` | Date de fin (YYYY-MM-DD) |
| `page` | Numéro de page (défaut: 1) |
| `limit` | Taille de page (défaut: 25) |

---

## 10. Devises supportées

| Code | Libellé |
|------|---------|
| `EUR` | Euro |
| `USD` | Dollar américain |
| `XOF` | Franc CFA (BCEAO) |
| `MAD` | Dirham marocain |
| `CAD` | Dollar canadien |

> Note : dans le module Students, les devises sont `F CFA`, `FCFA`, `USD`, `EURO` (format hérité d'Airtable). Les deux systèmes coexistent mais ne sont pas automatiquement convertis.

---

## 11. Sécurité des endpoints

| Endpoint | Rôle minimum |
|----------|-------------|
| `GET /finances/*` | Utilisateur authentifié |
| `POST /finances/transactions` | Utilisateur authentifié |
| `PATCH /finances/transactions/:id` | Utilisateur authentifié |
| `DELETE /finances/transactions/:id` | Admin |
| `POST /finances/sync/*` | Admin |
| `POST /finances/categories/seed-defaults` | Admin |
| `POST /finances/product-mappings/:id/confirm` | Admin |
| `POST /finances/transactions/backfill-links` | Superadmin |
