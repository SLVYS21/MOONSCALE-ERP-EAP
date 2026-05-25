# Moteur d'automatisation — Moonscale ERP
**Version** : 2.0 — Mai 2026

---

## 1. Concept général

Le moteur d'automatisation permet de déclencher des **séquences d'actions** en réponse à des **événements** du système, sans toucher au code.

```
Événement système
      │
      ▼
 triggerEvent(type, contexte)
      │
      ├── Trouve toutes les automatisations ACTIVES avec ce trigger
      │
      └── Pour chaque automatisation :
              Pour chaque étape (dans l'ordre) :
                ├── Vérifie les conditions  → KO = SKIP (pas d'arrêt)
                ├── Exécute l'action        → Résultat: ok / skipped / error
                └── Log dans AutomationRun
```

**Principe de non-blocage :** si une condition échoue ou qu'une étape a une erreur, l'automatisation passe à la suivante sans s'arrêter. Sauf erreur critique (ex: destinataire email vide → skip avec message).

---

## 2. Triggers disponibles (16)

### Étudiants
| Trigger | Déclenché quand |
|---------|----------------|
| `student_created` | Un étudiant est créé (webhook Tally ou manuellement) |
| `payment_created` | Un paiement NON TRAITÉ est créé |
| `payment_treated` | Un paiement passe à TRAITÉ |
| `reminder_due` | Un rappel de paiement est déclenché (cron quotidien) |
| `debt_detected` | Un étudiant est identifié comme débiteur potentiel |

### Souscriptions
| Trigger | Déclenché quand |
|---------|----------------|
| `subscription_created` | Une souscription est créée après traitement d'un paiement |
| `subscription_expiring` | Une souscription arrive à expiration (7j, 3j, 1j) |
| `partial_payment_due` | Un solde partiel arrive à échéance |

### Leads
| Trigger | Déclenché quand |
|---------|----------------|
| `lead_created` | Un lead entre dans le système |
| `lead_stage_changed` | Le statut pipeline d'un lead change |
| `lead_won` | Un lead est converti en étudiant suite à un paiement traité |
| `call_completed` | Un appel diagnostic est marqué comme réalisé |

### Système
| Trigger | Déclenché quand |
|---------|----------------|
| `form_submitted` | Un formulaire est soumis |
| `incoming_webhook` | Un webhook externe est reçu |
| `manual` | Déclenchement manuel par un admin |
| `cron_schedule` | Planification automatique (quotidien, hebdomadaire, mensuel, etc.) |
| `audience_based` | Campagne sur une audience filtrée (étudiants ou paiements) |

---

## 3. Variables disponibles dans les automatisations

Les variables sont interpolées dans les templates avec la syntaxe `{{variable.champ}}`.

### Contexte `student_created`
```
{{student._id}}       ID de l'étudiant
{{student.email}}     Email
{{student.name}}      Nom complet
{{student.whatsapp}}  Numéro WhatsApp
{{student.source}}    Source de découverte
```

### Contexte `payment_created` / `payment_treated`
```
{{student.email}}
{{student.name}}
{{student.whatsapp}}
{{payment._id}}
{{payment.amount}}      Montant
{{payment.currency}}    Devise
{{payment.plan}}        Plan Circle (Elite/Premium/Standard)
{{payment.product}}     Produit (ECOM AFRICA PRO, COACHING, etc.)
{{payment.source}}      Source (tally, chariow, manual)
{{payment.gateway}}     Passerelle (FedaPay, Wave, etc.)
```

### Contexte `subscription_created`
```
{{student.email}}
{{student.name}}
{{subscription._id}}
{{subscription.offerName}}
{{subscription.offerPlan}}
{{subscription.durationMonths}}
{{subscription.startDate}}
{{subscription.endDate}}
{{subscription.modality}}      Complet | Partiel
{{subscription.paidAmount}}
{{subscription.totalAmount}}
{{subscription.currency}}
{{subscription.nextPaymentDate}}
{{payment.amount}}
{{payment.currency}}
```

### Contexte `reminder_due`
```
{{student.email}}
{{student.name}}
{{reminder.nextPaymentDate}}    Date de l'échéance (YYYY-MM-DD)
{{reminder.amountDue}}          Montant estimé dû
{{reminder.daysBeforePayment}}  Jours restants (7, 3, ou 0)
{{subscription.offerName}}      Nom de l'offre
{{subscription.currency}}       Devise
```

### Contexte `lead_won`
```
{{student._id}}
{{student.email}}
{{student.name}}
{{student.whatsapp}}
{{lead._id}}
{{lead.name}}
{{lead.email}}
```

### Contexte `lead_created` / `lead_stage_changed`
```
{{lead._id}}
{{lead.name}}
{{lead.email}}
{{lead.phone}}
{{lead.pipeline_status}}
{{lead.qualification_status}}
{{lead.utm_source}}
{{lead.reseau_source}}
```

---

## 4. Types d'étapes (actions) disponibles (14)

### `send_email`
Envoie un email à un destinataire.

**Paramètres :**
```
to:      Destinataire (ex: {{student.email}})
subject: Sujet
body:    Corps en texte (HTML basique supporté)
blocks:  [] Éditeur de blocs riche (prioritaire sur body si présent)
```

**Éditeur de blocs (`blocks[]`) :**

| Bloc | Champs |
|------|--------|
| `text` | `content`, `align` (left/center/right) |
| `image` | `url`, `alt`, `width` |
| `button` | `label`, `url`, `color`, `textColor`, `radius` (none/md/full), `align` |
| `divider` | _(aucun)_ |
| `spacer` | `height` (px) |

> Les variables `{{...}}` sont interpolées dans tous les champs des blocs (label, url, content).

---

### `notify_team`
Envoie un email à l'équipe.

```
recipients: 'all_admins' | 'all_superadmins' | email direct
subject:    Sujet
body:       Corps du message
```

---

### `http_request`
Appel HTTP vers une URL externe (Slack, Zapier, CRM, etc.).

```
url:         URL cible
method:      GET | POST | PUT | PATCH | DELETE
headers:     [{key, value}]
requestBody: Corps JSON (avec interpolation {{...}})
```

---

### `wait`
Attente avant l'étape suivante.

```
duration: Nombre
unit:     'seconds' | 'minutes' | 'hours'
```

---

### `condition`
Filtre conditionnel. Si la condition échoue → l'étape est **skipped** (pas d'arrêt).

```
field:    Chemin dans le contexte (ex: "student.debtStatus", "payment.product")
operator: equals | not_equals | contains | not_contains | is_empty | is_not_empty | gt | lt
value:    Valeur de comparaison
```

**Exemples :**
```
field: "payment.product", operator: "not_equals", value: "COACHING"
→ S'applique seulement aux non-coaching

field: "student.debtStatus", operator: "equals", value: "confirmed"
→ S'applique seulement aux débiteurs confirmés

field: "student.email", operator: "is_not_empty"
→ S'assure que l'email est présent
```

---

### `add_note`
Ajoute une note sur la fiche étudiant.

```
note: Texte de la note (avec interpolation)
```

---

### `update_student`
Modifie un champ de l'étudiant.

```
studentField: Nom du champ (ex: "debtStatus", "plan")
studentValue: Nouvelle valeur
```

---

### `create_task`
Crée une tâche interne.

```
taskTitle:       Titre
taskDescription: Description
taskPriority:    'low' | 'medium' | 'high'
```

---

### `create_payment`
Crée un paiement NON TRAITÉ.

```
emailExpr:   Email étudiant
nameExpr:    Nom étudiant
amountExpr:  Montant
currency:    Devise
product:     Produit
modality:    'Complet' | 'Partiel'
gateway:     Passerelle
```

---

### `create_student`
Crée un étudiant s'il n'existe pas.

```
emailExpr:    Email
nameExpr:     Nom
whatsappExpr: WhatsApp
```

---

### `circle_invite`
Envoie une invitation Circle à l'étudiant.

```
emailExpr: Email (ex: {{student.email}})
nameExpr:  Nom (ex: {{student.name}})
```

---

### `circle_tag_add`
Ajoute un tag Circle au membre.

```
circleTagId:   ID du tag Circle (stable)
circleTagName: Nom du tag (affiché)
tag:           Raccourci (nom du tag, résolu dynamiquement)
```

---

### `circle_tag_remove`
Retire un tag Circle du membre.

```
circleTagId:   ID du tag Circle
circleTagName: Nom du tag
tag:           Raccourci
```

---

### `create_subscription`
Crée une souscription pour l'étudiant.

```
matchMode: 'auto' | 'manual'
  auto   → déduit l'offre depuis payment.product + plan
  manual → utilise offerId + planName explicites
offerId:  ID de l'offre (si manual)
planName: Nom du plan (si manual)
```

---

## 5. Conditions par étape vs conditions globales

Chaque étape (`AutomationStep`) peut avoir un tableau `conditions[]` — **toutes** doivent passer pour que l'étape s'exécute. Si une condition échoue, l'étape est marquée `skipped` et l'automatisation continue.

```json
{
  "type": "send_email",
  "conditions": [
    { "field": "student.email", "operator": "is_not_empty" },
    { "field": "payment.product", "operator": "not_equals", "value": "COACHING" }
  ],
  "config": { "to": "{{student.email}}", ... }
}
```

---

## 6. Templates de cycle de vie pré-construits

### Cycle de vie — 6 templates disponibles

| # | Nom | Trigger | Ce qu'il fait |
|---|-----|---------|---------------|
| 1 | Bienvenue + lien Circle | `payment_treated` | Condition (pas COACHING) + email avec bouton Circle |
| 2 | Tag Circle selon plan | `payment_treated` | Condition (plan=Elite) + circle_tag_add |
| 3 | Rappel paiement partiel | `reminder_due` | Email avec bouton de paiement + variables montant/date |
| 4 | Suspension accès débiteur | `debt_detected` | circle_tag_remove + circle_tag_add(Suspendu) + email suspension |
| 5 | Restauration après paiement | `payment_treated` | Condition (debtStatus=confirmed) + restore tags + email |
| 6 | Lead converti en étudiant | `lead_won` | notify_team avec détails du lead converti |

### Templates classiques (étudiants, paiements, formulaires, intégrations)

| Catégorie | Templates disponibles |
|-----------|----------------------|
| Étudiants | Email de bienvenue, Onboarding complet, Sync CRM externe |
| Paiements | Confirmation de paiement, Alerte nouveau paiement, Notification Slack/Discord |
| Formulaires | Suivi de lead formulaire, Notification de soumission |
| Intégrations | Webhook entrant → équipe, Synchroniser Circle |

---

## 7. Campagnes sur audience (`audience_based`)

Permet d'exécuter une automatisation sur **tous les étudiants ou paiements** qui correspondent à des filtres.

**Configuration du trigger :**
```json
{
  "type": "audience_based",
  "config": {
    "audience": {
      "entity": "student",
      "filters": [
        { "field": "debtStatus", "operator": "equals", "value": "confirmed" },
        { "field": "email", "operator": "is_not_empty" }
      ]
    }
  }
}
```

**Exécution :** `POST /automations/:id/run-audience`  
→ Pour chaque entité correspondante, exécute les étapes avec l'entité comme contexte.

**Prévisualisation :** `GET /automations/:id/audience-preview`  
→ Retourne le nombre d'entités ciblées + un échantillon avant d'envoyer.

---

## 8. Planification automatique (`cron_schedule`)

Présets disponibles :

| Preset | Fréquence |
|--------|-----------|
| `daily_9am` | Tous les jours à 9h UTC |
| `weekly_mon` | Tous les lundis à 9h UTC |
| `monthly_1st` | Le 1er de chaque mois à 9h UTC |

Vérification toutes les minutes par le cron interne NestJS.

---

## 9. Logs d'exécution (`AutomationRun`)

Chaque exécution d'une automatisation crée un `AutomationRun` :

```json
{
  "automationId": "...",
  "triggerType": "payment_treated",
  "status": "success",
  "stepsLog": [
    { "stepId": "abc", "type": "condition", "status": "ok", "message": "Condition passée" },
    { "stepId": "def", "type": "send_email", "status": "ok", "message": "Email envoyé à student@mail.com" },
    { "stepId": "ghi", "type": "circle_tag_add", "status": "error", "message": "Tag non trouvé" }
  ],
  "context": { ... },
  "startedAt": "2026-05-25T10:00:00Z",
  "completedAt": "2026-05-25T10:00:02Z"
}
```

**Statuts possibles par étape :**
- `ok` — action exécutée avec succès
- `skipped` — condition échouée ou paramètre manquant
- `error` — erreur technique (l'automatisation continue quand même)

---

## 10. Rendu HTML des emails (blocs)

Quand `config.blocks` est présent dans un step `send_email`, le backend appelle `renderBlocks()` :

```
blocks = [
  { type: 'text', content: 'Bonjour {{student.name}},', align: 'left' },
  { type: 'button', label: 'Rejoindre', url: 'https://circle.so', color: '#6366f1', ... }
]
  ↓
renderBlocks(blocks, ctx)
  ↓
interpolation des {{variables}} dans chaque champ
  ↓
génération HTML inline-styled
  ↓
envoyé via nodemailer comme HTML
```

**Rétro-compatibilité :** si `config.body` est présent (ancien format texte brut), il est utilisé à la place. Les deux formats coexistent.
