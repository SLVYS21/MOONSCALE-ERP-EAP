# Parcours utilisateurs — Moonscale ERP
**Version** : 2.0 — Mai 2026

Ce document décrit, étape par étape, comment un admin gère les cas les plus courants dans l'ERP.

---

## Sommaire

1. [Traiter un nouveau paiement](#1-traiter-un-nouveau-paiement)
2. [Gérer un étudiant en retard de paiement](#2-gérer-un-étudiant-en-retard-de-paiement)
3. [Changer l'email d'un étudiant](#3-changer-lemail-dun-étudiant)
4. [Configurer une automatisation de bienvenue](#4-configurer-une-automatisation-de-bienvenue)
5. [Importer les ventes FedaPay et résoudre les mappings](#5-importer-les-ventes-fedapay-et-résoudre-les-mappings)
6. [Suivre un lead jusqu'à la vente](#6-suivre-un-lead-jusquà-la-vente)
7. [Créer une campagne email ciblée](#7-créer-une-campagne-email-ciblée)
8. [Analyser les transactions d'un mois](#8-analyser-les-transactions-dun-mois)

---

## 1. Traiter un nouveau paiement

**Contexte :** Un étudiant vient de payer via Tally. L'équipe reçoit une notification. Le paiement apparaît en "NON TRAITÉ".

### Étapes

```
1. Aller dans Étudiants → Paiements
   └── Filtrer par status = "NON TRAITÉ"
   └── Trouver le paiement correspondant

2. Cliquer sur "Traiter"
   └── La modale s'ouvre avec les informations du formulaire Tally

3. Vérifier / corriger les informations :
   ├── Modalité : Complet ou Partiel ?
   ├── Montant : correspond à la preuve de paiement ?
   ├── Produit : ECOM AFRICA PRO / COACHING / BOOTCAMP ?
   ├── Plan : Elite / Premium / Standard ?
   ├── Passerelle : FedaPay / Wave / Stripe ?
   └── Offre : sélectionner l'offre correspondante (pour créer la souscription)

4. Cliquer "Confirmer le traitement"
   └── Le système :
       ✓ Invite l'étudiant sur Circle (si pas déjà membre)
       ✓ Applique le tag Circle correspondant au plan
       ✓ Met à jour FormationDashboard → EN RÈGLE
       ✓ Crée la souscription si offre sélectionnée
       ✓ Crée des rappels si paiement Partiel (J-7, J-3, J-0)
       ✓ Convertit le lead en étudiant (si email correspond à un lead)
       ✓ Déclenche les automations "payment_treated"
       ✓ Synchro Airtable (en arrière-plan)
```

### Ce qui peut mal tourner

| Problème | Cause probable | Solution |
|----------|---------------|----------|
| L'invitation Circle ne part pas | Email mal saisi dans le formulaire | Corriger l'email → changer via PATCH /students/:id/email |
| La souscription n'est pas créée | Aucune offre sélectionnée | Aller dans la fiche étudiant → Souscriptions → en créer une manuellement |
| L'automatisation ne se déclenche pas | Automatisation inactive ou condition échouée | Vérifier dans Automations → Logs d'exécution |

---

## 2. Gérer un étudiant en retard de paiement

**Contexte :** Un étudiant a payé en mode partiel il y a 3 mois. Les rappels ont été envoyés mais il n'a pas payé. Son accès a été restreint automatiquement au J-0.

### 2.1 L'accès a été restreint automatiquement

```
Situation constatée :
  → FormationDashboard : EN RETARD
  → CoachingDashboard  : EN RETARD
  → Badge "Débiteur potentiel" sur la fiche étudiant
```

**L'admin contacte l'étudiant.** L'étudiant veut régulariser.

### 2.2 Créer un paiement complément

```
1. Aller dans Étudiants → fiche de l'étudiant
2. Si debtStatus ≠ 'ok' → bouton "Complément" visible dans le header
3. Cliquer "Complément"
4. Renseigner :
   ├── Montant (montant du solde restant dû)
   ├── Devise
   ├── Passerelle (FedaPay, Wave, etc.)
   └── Notes (optionnel : "Règlement solde Mai 2026")
5. Cliquer "Créer"
   └── Un paiement NON TRAITÉ est créé avec product='COMPLEMENT'
```

### 2.3 Traiter le complément

```
1. Aller dans Étudiants → Paiements → Filtrer NON TRAITÉ
2. Trouver le paiement COMPLEMENT
3. Traiter normalement (même processus que #1)
   └── Le système restaure automatiquement les accès Circle
   └── Les tags sont réappliqués
   └── Si une automatisation "Restauration après paiement" est active
       → Email de confirmation envoyé automatiquement
```

### 2.4 Si l'admin veut restaurer manuellement sans nouveau paiement

```
1. Fiche étudiant → Post "Restaurer l'accès"
   (bouton dans la page étudiant, ou via POST /students/:id/restore)
2. Indiquer le planKey (ex: "elite", "premium")
   → Le Circle access est rétabli immédiatement
```

---

## 3. Changer l'email d'un étudiant

**Contexte :** L'étudiant a fait une faute de frappe dans son email au moment de l'inscription. Il ne reçoit pas les emails et ne peut pas accéder à Circle.

```
1. Aller dans Étudiants → Fiche de l'étudiant concerné
2. Cliquer sur le bouton "Email" (icône crayon) dans le header
3. La modale s'ouvre avec l'email actuel pré-rempli
4. Saisir le nouvel email correct
5. Cliquer "Confirmer"
   └── Le système :
       ✓ Vérifie que le nouvel email n'est pas déjà utilisé
       ✓ Met à jour student.email
       ✓ Met à jour l'email sur tous les Payment liés
       ✓ Met à jour l'email sur tous les Subscription liés
       ✓ Envoie une invitation Circle avec le bon email
       ✓ Enregistre l'action dans l'historique : "email_changed: ancien → nouveau"
```

**Après le changement :**
- L'étudiant reçoit son invitation Circle par email
- Les futures transactions seront auto-linkées avec le bon email
- Pour les transactions existantes importées avec l'ancien email → relancer le backfill-links (superadmin)

---

## 4. Configurer une automatisation de bienvenue

**Objectif :** Envoyer un email de bienvenue avec un bouton d'accès Circle dès qu'un paiement formation est traité.

```
1. Aller dans Automations → Nouvelle automatisation
   OU cliquer "À partir d'un modèle" → Choisir "Bienvenue + lien Circle"

2. Nommer l'automatisation : "Email bienvenue formation"

3. Trigger : "Paiement traité" (payment_treated)

4. Étapes :

   Étape 1 : Condition
   ├── Champ : payment.product
   ├── Opérateur : différent de
   └── Valeur : COACHING
   → (S'assure qu'on n'envoie pas cet email aux étudiants coaching)

   Étape 2 : Envoyer un email
   ├── À : {{student.email}}
   ├── Sujet : "Bienvenue {{student.name}} — votre accès est prêt !"
   └── Contenu (éditeur de blocs) :
       ┌─────────────────────────────────────┐
       │ Bonjour {{student.name}},           │ ← Bloc Texte (aligné à gauche)
       │                                     │
       │ Votre paiement a été validé.        │
       │ Voici votre accès :                 │
       │                                     │
       │  [  Rejoindre la communauté  ]      │ ← Bloc Bouton (indigo, pill)
       │                                     │
       │ À bientôt,                          │ ← Bloc Texte
       │ L'équipe Moonscale                  │
       └─────────────────────────────────────┘

5. Sauvegarder
6. Activer l'automatisation (toggle)
7. Tester : déclencher manuellement sur un paiement test
   → Automations → fiche → "Exécuter manuellement"
   → Vérifier dans "Logs" que l'étape s'est exécutée en "ok"
```

---

## 5. Importer les ventes FedaPay et résoudre les mappings

**Contexte :** Fin de mois. On importe le fichier XLSX de FedaPay pour avoir toutes les transactions dans l'ERP.

### 5.1 Import du fichier

```
1. Aller dans Finances → Synchronisation
2. Section "FedaPay XLSX" → Upload du fichier
   (fichier exporté depuis dashboard.fedapay.com → Transactions → Exporter)
3. Cliquer "Importer"
   └── Le système :
       ✓ Parse chaque ligne du XLSX
       ✓ Déduplique par ID transaction FedaPay
       ✓ Crée les transactions manquantes
       ✓ Auto-link étudiant/lead par email
       ✓ Crée ou met à jour les ProductMappings pour les noms de produits rencontrés
```

### 5.2 Résoudre les mappings produits

```
1. Aller dans Finances → Mappings produits
2. Filtrer par status = "En attente" (pending)
3. Pour chaque mapping non résolu :
   ├── Voir le nom de produit tel que reçu de FedaPay
   │   ex: "ECOM AFRICA PRO - PLAN ELITE - PARTIEL"
   ├── Voir la suggestion Groq (si présente)
   │   ex: "ECOM AFRICA PRO" (confiance 92%)
   ├── Choisir l'offre dans le dropdown
   └── Cliquer "Confirmer"

4. Pour un mapping sans correspondance (ex: frais bancaires)
   └── Cliquer "Ignorer"
```

**Effet immédiat :** Les transactions liées à ce mapping dans la liste seront maintenant associées à l'offre.  
**Effet futur :** Lors du prochain traitement d'un paiement avec ce nom de produit, la souscription sera créée automatiquement.

### 5.3 Vérifier la cohérence

```
1. Finances → Liste des transactions
   ├── Filtrer par gateway = "fedapay"
   ├── Vérifier que les transactions ont bien une catégorie
   ├── Vérifier les chips "Étudiant" : sont-elles présentes ?
   └── Si une transaction montre "⚠ En retard" → l'étudiant est débiteur

2. Si des transactions sans étudiant lié → backfill-links
   (Superadmin uniquement)
   POST /finances/transactions/backfill-links
```

---

## 6. Suivre un lead jusqu'à la vente

**Contexte :** Un lead entre via Typebot, passe par l'équipe commerciale, et finit par payer.

```
Jour 1 — Entrée du lead
  └── Lead créé automatiquement via webhook Typebot
  └── Trigger automation 'lead_created' → email accusé de réception (si configuré)
  └── Lead visible dans Leads → Kanban → colonne "Nouveau"

Jour 2 — Qualification
  └── L'équipe consulte la Lead Card
  └── Modifie qualification_status → "MQL" ou "SQL"
  └── Assigne un closer

Jour 3-5 — Pipeline
  └── Closer déplace le lead en "SQL" puis "RDV Programmé"
  └── Appel effectué → statut "Appel Diagnostic"
  └── Closer note le résumé de l'appel
  └── Closer propose l'offre ECOM AFRICA PRO Elite

Jour 7 — Paiement
  └── L'étudiant soumet le formulaire Tally avec ses informations de paiement
  └── Paiement NON TRAITÉ créé automatiquement
  └── Admin traite le paiement → treatPayment()
      ↓
      ← En coulisse, le système :
        ✓ Cherche un Lead avec cet email ET student_id=null
        ✓ Définit lead.student_id = student._id
        ✓ Définit lead.pipeline_status = 'won'
        ✓ Trigger automation 'lead_won'
           → Notification équipe : "🎉 <Nom> est maintenant étudiant !"

Résultat final :
  → Le lead passe en "Won" dans le Kanban
  → L'étudiant est créé/mis à jour dans le module Students
  → Il reçoit son accès Circle
  → Il reçoit l'email de bienvenue (si automatisation configurée)
```

---

## 7. Créer une campagne email ciblée

**Objectif :** Envoyer un email de relance à tous les étudiants en retard de paiement (debtStatus='confirmed').

```
1. Automations → Nouvelle automatisation
2. Nommer : "Relance débiteurs confirmés - Mai 2026"
3. Trigger : "Campagne audience" (audience_based)

4. Configuration de l'audience :
   ├── Entité : student
   └── Filtres :
       ├── debtStatus → égal à → confirmed
       └── email → n'est pas vide

5. Étapes :
   Étape 1 : Envoyer un email
   ├── À : {{student.email}}
   ├── Sujet : "Votre situation chez Moonscale — action requise"
   └── Contenu :
       [Texte] Bonjour {{student.name}}, nous revenons vers vous...
       [Bouton] Régulariser mon compte → https://lien-paiement.com

6. Avant d'envoyer → Prévisualiser l'audience
   → Cliquer "Aperçu de l'audience"
   → Voir : "X étudiants ciblés"
   → Vérifier l'échantillon (5 premiers noms)

7. Si l'audience est correcte → "Exécuter la campagne"
   └── L'email est envoyé à chaque étudiant dans la liste
   └── Un AutomationRun est créé pour suivre l'exécution
```

---

## 8. Analyser les transactions d'un mois

**Objectif :** Voir le résumé financier de mai 2026.

```
1. Finances → Statistiques
   ├── Sélectionner la devise principale (ex: XOF)
   └── Voir :
       ├── Total revenus (mois courant et global)
       ├── Total dépenses
       ├── Solde net
       ├── Répartition par gateway (FedaPay, Wave, Chariow, Stripe...)
       └── Répartition par catégorie

2. Finances → Transactions
   ├── Filtrer dateFrom = 2026-05-01
   ├── Filtrer dateTo = 2026-05-31
   ├── Filtrer type = "income"
   └── Voir toutes les transactions du mois

3. Export (si besoin)
   └── Depuis FedaPay : exporter le CSV du mois → importer dans l'ERP si pas déjà fait
   └── Depuis Chariow : POST /finances/sync/chariow

4. Vérifier les transactions sans catégorie
   ├── Elles apparaissent avec "—" dans la colonne Catégorie
   └── Cliquer le bouton crayon → assigner une catégorie

5. Vérifier les transactions sans étudiant lié
   ├── Pas de chip "Étudiant" ou "Lead"
   └── Soit l'email client ne correspond à aucun étudiant/lead connu
       (client externe, dépense, etc.)
   └── Soit l'auto-link a échoué → POST /finances/transactions/backfill-links
```

---

## Cas particuliers

### "Un étudiant dit ne pas avoir reçu son invitation Circle"

```
1. Aller dans sa fiche étudiant
2. Vérifier circleId : est-il renseigné ?
   ├── Non → le traitement Circle a échoué
   │   └── Cliquer "Resync Circle" pour forcer la synchronisation
   └── Oui → l'invitation a été envoyée
       └── Demander à l'étudiant de vérifier ses spams
       └── Sinon : changer l'email (PATCH /students/:id/email)
           et l'invitation sera re-envoyée automatiquement
```

### "Un paiement a été traité mais la souscription n'a pas été créée"

```
Causes possibles :
  1. Aucune offre sélectionnée lors du traitement
  2. Le ProductMapping correspondant n'était pas encore confirmé

Solutions :
  Option A : Aller dans la fiche étudiant → Souscriptions
             → Créer manuellement une souscription
             (si l'interface le permet)

  Option B : Configurer le ProductMapping pour ce produit
             Finances → Mappings → Confirmer
             Puis : POST /finances/transactions/backfill-links
             Note : cela ne recrée pas la souscription rétroactivement,
             il faut la créer manuellement pour ce cas passé.
```

### "Une automatisation s'est déclenchée mais l'email n'est pas arrivé"

```
1. Automations → fiche de l'automatisation → Logs
2. Trouver l'exécution concernée
3. Regarder le log de l'étape "send_email" :
   ├── status: ok → email envoyé, vérifier les spams
   ├── status: skipped → une condition n'a pas été remplie
   │   └── Exemple : "student.email est vide"
   └── status: error → erreur SMTP ou template invalide
       └── Vérifier les variables d'environnement SMTP_*
       └── Vérifier que "to" n'est pas vide : mettre une condition is_not_empty
```
