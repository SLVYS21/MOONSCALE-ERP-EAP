# Cycle de vie étudiant — Moonscale ERP
**Version** : 2.0 — Mai 2026

---

## Vue d'ensemble

```
Formulaire Tally
      │
      ▼
[NON TRAITÉ] ←──── création automatique via webhook
      │
      │  Admin traite le paiement
      ▼
[TRAITÉ] ──────────────────────────────────────────────┐
      │                                                 │
      │ Paiement COMPLET                                │ Paiement PARTIEL
      ▼                                                 ▼
Accès illimité                                  Rappels programmés (J-7, J-3, J-0)
                                                       │
                                               Pas de paiement au J-0
                                                       │
                                                       ▼
                                               [EN RETARD] → Accès restreint
                                                       │
                                               Admin crée un complément
                                                       │
                                                       ▼
                                               Admin traite → Accès restauré
```

---

## 1. Entrée dans le système

### 1.1 Webhook Tally (automatique)

Quand un étudiant soumet le formulaire Tally :

**Endpoint** : `POST /students/webhook/tally`

**Ce qui se passe :**
1. L'ERP extrait : email, nom, WhatsApp, produit, montant, devise, modalité, passerelle
2. `findOrCreateStudent()` : cherche par email, crée si absent
3. Crée un `Payment` avec `status='NON TRAITÉ'`
4. Déclenche l'automation `payment_created` → notification équipe possible

**Schéma Payment après création :**
```
status:   'NON TRAITÉ'
modality: 'Complet' | 'Partiel'  (déclaré dans le formulaire)
source:   'tally'
studentId: <référence étudiant>
```

### 1.2 Création manuelle

Un admin peut créer un paiement directement via la page Étudiants.  
`source: 'manual'`, `status: 'NON TRAITÉ'`

### 1.3 Import Airtable (one-shot)

`POST /admin/import-airtable` — Importe les étudiants et paiements historiques depuis Airtable.  
Les doublons sont détectés par `airtableId`.

---

## 2. Traitement d'un paiement (`treatPayment`)

L'admin ouvre la fiche d'un paiement NON TRAITÉ et clique "Traiter".

**Endpoint** : `POST /payments/:id/treat`

**Body optionnel :**
```json
{
  "planKey": "elite",       // Plan Circle à appliquer
  "plan": "Elite",          // Nom lisible du plan
  "modality": "Complet",    // Corriger la modalité si besoin
  "amount": 250000,          // Corriger le montant
  "currency": "F CFA",
  "product": "ECOM AFRICA PRO",
  "gateway": "FedaPay",
  "notes": "Paiement vérifié le 25/05",
  "offerId": "66abc..."     // Offre à lier pour créer la souscription
}
```

### Séquence complète de `treatPayment`

```
1. Récupérer le Payment
   └── Si status='TRAITÉ' → stopper (idempotent)

2. Appliquer les corrections de l'admin
   └── modality, amount, currency, product, plan, gateway, notes

3. Auto-lookup offerId (Phase 2D)
   └── Si offerId non fourni ET payment.product existe
       → Chercher un ProductMapping confirmé pour ce nom de produit
       → Utiliser son offerId pour créer la souscription automatiquement

4. findOrCreateStudent()
   └── Chercher par email → créer si absent

5. Lead → Étudiant conversion (Phase 2E)
   └── Chercher un Lead avec cet email ET student_id=null
       → Mettre student_id = student._id
       → pipeline_status = 'won'
       → Trigger automation 'lead_won'

6. Circle : processNewPayment(email, name, planKey)
   └── Inviter le membre (si pas déjà membre)
   └── Appliquer le tag plan (Elite / Premium / Standard)
   └── Donner l'accès aux espaces

7. FormationDashboard → upsert
   └── paymentStatus = 'EN RÈGLE'
   └── Seulement si product ≠ 'COACHING'

8. CoachingDashboard → upsert
   └── paymentStatus = 'EN REGLE'
   └── Tags Circle mis à jour

9. Si modality='Partiel' → créer Reminder
   └── 3 dates : J-7, J-3, J-0 avant la prochaine échéance
   └── Annule les rappels actifs précédents du même type

10. Marquer Payment status='TRAITÉ'
    └── processedBy, processedAt

11. Créer Subscription (si offerId résolu)
    └── Lie student + payment + offer
    └── Calcule startDate, endDate, nextPaymentDate
    └── Trigger automation 'subscription_created'

12. History append (Phase 2F)
    └── event: 'payment_treated', detail: produit + montant + devise

13. Trigger automation 'payment_treated'
    └── Contexte: student + payment (plan, product, amount)

14. Sync Airtable (async, non-bloquant)
    └── Mise à jour Formation + Coaching dans Airtable
```

---

## 3. Système de rappels (paiement partiel)

### 3.1 Programmation

Quand un paiement Partiel est traité, 3 rappels sont créés :

| Rappel | Délai avant l'échéance | Action |
|--------|----------------------|--------|
| J-7 | 7 jours | Email de rappel |
| J-3 | 3 jours | Email de rappel |
| J-0 | Le jour J | Email + **restriction d'accès Circle** |

### 3.2 Déclenchement (cron quotidien)

`POST /students/process-reminders` (ou cron automatique)

Pour chaque rappel dû :
1. Calculer le total déjà payé par l'étudiant
2. Récupérer la souscription active (pour enrichir le contexte)
3. Déclencher l'automation `reminder_due` avec :
   - `{{student.email}}`, `{{student.name}}`
   - `{{reminder.nextPaymentDate}}` — date de l'échéance
   - `{{reminder.amountDue}}` — montant estimé dû
   - `{{reminder.daysBeforePayment}}` — jours restants
   - `{{subscription.offerName}}` — nom de l'offre
4. Envoyer l'email via `mailService.sendPaymentReminder()`
5. Si J-0 : `circleService.restrictAccess(email)`

### 3.3 États d'un rappel

```
active  →  sent (à chaque date envoyée)
        →  completed (après J-0, tous envoyés)
        →  cancelled (annulé manuellement ou par un nouveau traitement)
        →  failed (erreur email)
```

---

## 4. Restriction et restauration d'accès

### 4.1 Restriction

Deux déclencheurs :
- **Automatique** : le cron J-0 détecte que l'échéance est passée sans paiement
- **Manuelle** : `POST /students/:id/restrict` (admin)

**Ce qui se fait :**
1. `circleService.restrictAccess(email)` — retire les accès Circle
2. FormationDashboard → `paymentStatus = 'EN RETARD'`
3. CoachingDashboard → `paymentStatus = 'EN RETARD'`
4. Sync Airtable

### 4.2 Paiement de complément (Phase 3I)

Sur la fiche étudiant (si `debtStatus ≠ 'ok'`), l'admin peut créer un paiement complémentaire :
- Montant, devise, gateway, notes
- Crée un Payment `NON TRAITÉ`, `source='manual'`, `product='COMPLEMENT'`
- L'admin le traite ensuite normalement → `treatPayment()` restaure les accès

### 4.3 Restauration manuelle

`POST /students/:id/restore` avec `planKey`

**Ce qui se fait :**
1. `circleService.grantAccess(email, planKey)` — redonne les accès
2. `circleService.tagMember(email, planKey)` — ré-applique le tag
3. FormationDashboard → `paymentStatus = 'EN RÈGLE'`
4. CoachingDashboard → `paymentStatus = 'EN REGLE'`

---

## 5. Changement d'email (Phase 2G)

**Endpoint** : `PATCH /students/:id/email`  
**Body** : `{ "email": "nouveau@email.com" }`

**Séquence :**
1. Vérifier que le nouvel email n'est pas déjà utilisé par un autre étudiant
2. Mettre à jour `student.email`
3. Mettre à jour `studentEmail` sur tous les `Payment` liés
4. Mettre à jour `studentEmail` sur tous les `Subscription` liés
5. Envoyer une invitation Circle avec le nouvel email (non-bloquant)
6. Ajouter dans `student.history` : `{ event: 'email_changed', detail: 'ancien → nouveau' }`

---

## 6. Historique / audit (Phase 2F)

Le champ `history[]` sur l'étudiant enregistre les actions importantes.

**Structure d'une entrée :**
```json
{
  "event": "payment_treated",
  "detail": "Paiement 66abc traité (ECOM AFRICA PRO, 250000 F CFA)",
  "actor": "<userId>",
  "date": "2026-05-25T10:30:00.000Z"
}
```

**Événements actuellement tracés :**

| Événement | Déclencheur |
|-----------|-------------|
| `payment_treated` | Admin traite un paiement |
| `email_changed` | Admin change l'email |

> D'autres événements peuvent être ajoutés dans `students.service.ts` avec `$push: { history: { ... } }`.

---

## 7. Schéma Student — champs clés

| Champ | Type | Description |
|-------|------|-------------|
| `email` | String (unique) | Identifiant principal |
| `name` | String | Nom complet |
| `whatsapp` | String? | Numéro WhatsApp |
| `infoStatus` | 'EXACTE' \| 'ERRONÉE' \| 'NON VÉRIFIÉ' | Fiabilité des infos |
| `debtStatus` | 'ok' \| 'potential' \| 'confirmed' | Statut de dette |
| `circleId` | Number? | ID membre Circle |
| `circleTags` | `{id, name}[]` | Tags Circle actifs |
| `circleIsActive` | Boolean? | Membre actif sur Circle |
| `plan` | String? | Plan actuel (Elite/Premium/Standard) |
| `history` | `{event, detail, actor, date}[]` | Journal des actions |
| `isAdmin` | Boolean | Si l'étudiant est aussi admin |

---

## 8. Schéma Payment — champs clés

| Champ | Type | Description |
|-------|------|-------------|
| `studentId` | ObjectId? | Référence vers l'étudiant |
| `studentEmail` | String | Email étudiant (dénormalisé) |
| `status` | 'NON TRAITÉ' \| 'TRAITÉ' \| 'REJETÉ' | Statut du paiement |
| `modality` | 'Complet' \| 'Partiel' | Mode de paiement |
| `amount` | Number | Montant |
| `currency` | 'F CFA' \| 'USD' \| 'EURO' \| ... | Devise |
| `product` | String | Produit acheté |
| `gateway` | String? | Passerelle utilisée |
| `plan` | String? | Plan Circle (Elite/Premium/Standard) |
| `source` | 'tally' \| 'chariow' \| 'manual' | Origine du paiement |
| `proofImages` | String[] | URLs des preuves de paiement |
| `processedBy` | ObjectId? | Admin qui a traité |
| `processedAt` | Date? | Date de traitement |

---

## 9. Cas limites et comportements

| Situation | Comportement |
|-----------|-------------|
| Étudiant déjà TRAITÉ → re-traitement | Méthode idempotente : retourne sans rien faire |
| Email pas dans Circle | Circle invite → erreur non-bloquante, loguée |
| offerId non fourni, pas de ProductMapping | Pas de souscription créée, paiement traité quand même |
| Lead pas trouvé par email | Conversion Lead→Won ignorée silencieusement |
| Traitement d'un paiement REJETÉ | Possible (admin peut corriger et retraiter) |
| Rappel J-0 → Circle échoue | Erreur loguée, accès pas forcément restreint |
