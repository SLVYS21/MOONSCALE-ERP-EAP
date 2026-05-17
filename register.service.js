import axios from "axios";
import Airtable from "airtable";
import mongoose from "mongoose";
import cron from "node-cron";
import nodemailer from "nodemailer";
import {CircleQueue} from '../../queue/queues.js';

const _AIRTABLE_API_KEY = 'pataXUZfC5MBZwrUb.51a3040db068f8bcd57536d5fa61db3b288d11ca61b549f00d038d042bf3bd5d';
const _BASE_ID = 'appSNmx63xwb30s5F';

const base = new Airtable({ apiKey: _AIRTABLE_API_KEY }).base(_BASE_ID);

const reminderSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['formation', 'coaching'],
    required: true
  },
  paymentDate: {
    type: Date,
    required: true,
    index: true
  },
  reminderDates: [{
    date: {
      type: Date,
      required: true
    },
    daysBeforePayment: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed'],
      default: 'pending'
    },
    sentAt: Date
  }],
  tag: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active',
    index: true
  },
  studentName: String,
  whatsapp: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

reminderSchema.index({ 'reminderDates.date': 1, 'reminderDates.status': 1 });

const Reminder = mongoose.model('Reminder', reminderSchema);

class AirtableManager {
  constructor() {
    this.apiKey = _AIRTABLE_API_KEY;
    this.baseId = _BASE_ID;
    this.baseUrl = `https://api.airtable.com/v0/${_BASE_ID}`;
  }

  get client() {
    return axios.create({
      baseURL: `${this.baseUrl}/`,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async checkIfEmailExists(email, tableId) {
    try {
      const formula = `FIND("${email}", {EMAIL})`;
      const response = await this.client.get(`${tableId}`, {
        params: {
          filterByFormula: formula,
          maxRecords: 100,
        },
      });

      console.log('Got from Airtable', response.data.records);
      if (response.data.records.length > 0) {
        return response.data.records;
      }
      return null;
    } catch (error) {
      console.error("Erreur Airtable:", error.response?.data || error.message);
      throw new Error("Impossible de vérifier l'email dans Airtable");
    }
  }

  async createChariowPayment(data, duration) {
    try {
      const _etudiant = await this.checkIfEmailExists(data.customer.email, "ETUDIANTS");

      const record = await base("PAIEMENTS").create({
        "ETUDIANT": _etudiant ? [_etudiant[0].id] : [],
        "MODALITE DE PAIEMENT": "Complet",
        "STATUT DE TRAITEMENT": "TRAITÉ",
        "PRODUIT": "COACHING",
        "MONTANT": data.product.price.value,
        "DEVISE": "F CFA",
        "MOYEN DE PAIEMENT": "Chariow",
        "VALIDITÉ (en MOIS)": Math.floor(duration / 30)
        // "PREUVE DE PAIEMENT": data["question_PRQKZ1"].map(f => ({ url: f.url })),
      });


    } catch(error) {
      throw error;
    }
  }

  async addTagToAirtable(recordId, newTag, table = "DASHBOARD COACHING") {
    const record = await base(table).find(recordId);
    const currentTags = record.get("TAG") || [];

    // Évite les doublons
    if (currentTags.includes(newTag)) {
      console.log(`ℹ️ Le tag "${newTag}" existe déjà pour ce record`);
      return;
    }

    const updatedTags = currentTags.concat([newTag]);

    await base(table).update(recordId, {
      TAG: updatedTags,
    });

    console.log(`✅ Tag "${newTag}" ajouté à ${recordId}`);
  }

  async createPayment(userData) {
    try {
      console.log(userData, getPaymentData(userData));

      const _etudiant = await this.checkIfEmailExists(userData["question_je4N41"], "ETUDIANTS");

      console.log('Til here', _etudiant);
      const _record = await base("PAIEMENTS").create({
        "ETUDIANT": _etudiant ? [_etudiant[0].id] : [],
        ...getPaymentData(userData),
      });
      console.log(_record);

      return _record;
    } catch(error) {
      console.log('Create payment error', error);
      throw error;
    }
  }

  async createEtudiant(userData) {
    try {
      const _payments = await this.checkIfEmailExists(userData["question_je4N41"], "tbl28GhsfLRLdL33y");

      const _record = await base("ETUDIANTS").create({
        "PAIEMENTS": _payments ? _payments.map(p => p.fields.ID) : [],
        ...getEtudiantData(userData),
      });
      console.log(_record);
      if (_payments)
        await Promise.all(_payments.map(async p => {
          await base("PAIEMENTS").update(p.id, {
            "ETUDIANT": [_record.id],
          });
        }))

      return _record;
    } catch(error) {
      console.log('Create etudiant error', error);
      throw error;
    }
  }

  async updateEtudiant(userData, id) {
    try {
      console.log('Trying to update')
      const _payments = await this.checkIfEmailExists(userData["question_je4N41"], "tbl28GhsfLRLdL33y");

      const _record = null;
      if (_payments) {
        // Update logic here if needed
      }
      console.log(_record);

      return _record;
    } catch(error) {
      console.log('Updating error')
      throw error;
    }
  }

  async createFormation(data, _etudiant, _circle_etudiant) {
    try {
      const _formations = await this.checkIfEmailExists(data.email[0], "DASHBOARD FORMATION");

      if (_formations) {
        console.log('Formation already exist');
        const _payments = await this.checkIfEmailExists(data.email[0], "PAIEMENTS");
        console.log('_payments', _payments.map(p => p.id));
        const _record = await base("DASHBOARD FORMATION").update(_formations[0].id, {
          "PAIEMENTS": _payments ? _payments.map(p => p.id) : [],
          "MODALITE DE PAIEMENT": data.paymentTerms,
          "STATUT DE PAIEMENT": "EN RÈGLE", //data.paymentTerms === "Complet" ? "EN RÈGLE" : "EN ATTENTE",
        });
        return _record;
      }

      console.log('Formation doesn\'t exist, creating it');
      const _payments = await this.checkIfEmailExists(data.email[0], "PAIEMENTS");
      console.log('_payments', _payments ? _payments.map(p => p.id) : []);
      const _record = await base("DASHBOARD FORMATION").create({
        "ETUDIANT": [_etudiant[0].id],
        "ID CIRCLE": _circle_etudiant.user_id,
        "PAIEMENTS": _payments ? _payments.map(p => p.id) : [],
        ...getFormationData(data)
      });
      console.log(_record);

      return _record;
    } catch(error) {
      console.log('Create formation error', error);
      throw error;
    }
  }

  async getFull(table) {
    try {
      let allRecords = [];

      allRecords = await base(table)
        .select({
        })
        .all();
        console.log('allRecords', allRecords[0]);
        return allRecords.map(it => ({
          id: it.id,
          fields: it.fields
        }));
    } catch(error) {
      throw error;
    }
  }

  async syncFormationToCoaching() {
    try {
      console.log("🔄 Synchronisation des formations vers coaching...");
      const formations = await this.getFull("DASHBOARD FORMATION");
      console.log("formations", formations.length);

      for (const formation of formations) {
        console.log("inside");
        const fields = formation.fields;
        const circleId = fields["ID CIRCLE"];
        const etudiant = fields["ETUDIANT"];
        let nextPaymentDate = fields["DATE DU PROCHAIN PAIEMENT"]
          ? new Date(fields["DATE DU PROCHAIN PAIEMENT"])
          : (new Date(fields["CREATION"])).setMonth((new Date(fields["CREATION"])).getMonth() + 2);
        const creationDate = formation.fields["CREATION"]
          ? new Date(formation.fields["CREATION"])
          : new Date();

        if (!etudiant) {
          console.log(
            "⚠️ Formation sans etudiant, ID:", formation.id
          )
          continue;
        };

        nextPaymentDate = new Date(nextPaymentDate);

        const now = new Date();
        let statutPaiement = "EN REGLE";
        let statutRelanceAuto = "EN RÈGLE";

        if (nextPaymentDate && nextPaymentDate < now) {
          statutPaiement = "EN RETARD";
          statutRelanceAuto = "RELANCE 2";
        }

        // Calculer nombre de jours depuis la création (optionnel pour analyse)
        const diffDays = Math.floor((now - creationDate) / (1000 * 60 * 60 * 24));
        
        let existingCoaching = await this.checkIfEmailExists(fields.EMAIL[0], "DASHBOARD COACHING");

        const updateData = {
          "NOM ET PRÉNOMS": Array.isArray(etudiant) ? etudiant : [etudiant],
          "ID CIRCLE": circleId || 0,
          "PROCHAIN PAIEMENT COACHING": nextPaymentDate
            ? nextPaymentDate.toISOString().split("T")[0]
            : undefined,
          "STATUT PAIEMENT ": statutPaiement,
          "STATUT RELANCE AUTO": statutRelanceAuto,
          "STATUT RELANCE MANUELLE": "EN RÈGLE",
          "ACTIONS": statutPaiement === "EN REGLE" ? "🤖 INTÉGRÉ" : "🤖 RETRAIT EFFECTUÉ",
        };

        if (existingCoaching) {
          existingCoaching = existingCoaching[0];
          await base("DASHBOARD COACHING").update(existingCoaching.id, updateData);
        } else {
          await base("DASHBOARD COACHING").create(updateData);
        }

        console.log(`✅ Sync terminé pour ${circleId} (${diffDays} jours depuis création)`);
      }

      console.log("🎉 Synchronisation terminée avec succès !");
    } catch (error) {
      console.error("❌ Erreur de synchronisation :", error);
      throw error;
    }
  }
  
  async createOrUpdateCoaching(data, _etudiant, _circle_etudiant, _formation, duration = 30) {
  try {
    const _coachings = await this.checkIfEmailExists(data.email[0], "DASHBOARD COACHING");

    const nextPaymentDate = new Date();
    nextPaymentDate.setMonth(nextPaymentDate.getMonth() + Math.floor(duration / 30));

    const now = new Date();
    const isLate = nextPaymentDate < now;

    const statutPaiement = isLate ? "EN RETARD" : "EN REGLE";
    const statutRelanceAuto = isLate ? "RELANCE 2" : "EN RÈGLE";

    const updateData = {
      "PROCHAIN PAIEMENT COACHING": nextPaymentDate.toISOString().split('T')[0],
      "STATUT PAIEMENT ": statutPaiement,
      "STATUT RELANCE AUTO": statutRelanceAuto,
      "TAG": ["ALL IN ONE"],
      "STATUT RELANCE MANUELLE": "EN RÈGLE",
      "ACTIONS": "🤖 INTÉGRÉ"
    };

    if (_coachings && _coachings.length > 0) {
      console.log('Coaching profile exists, updating...');
      const _record = await base("DASHBOARD COACHING").update(_coachings[0].id, updateData);
      return _record;
    }

    console.log("Coaching profile doesn't exist, creating...");
    const _record = await base("DASHBOARD COACHING").create({
      "NOM ET PRÉNOMS": [_etudiant[0].id],
      "ID CIRCLE": _circle_etudiant.user_id,
      ...updateData
    });

    console.log('Coaching created:', _record);
    return _record;

  } catch (error) {
    console.error("Create/Update coaching error", error);
    throw error;
  }
}
}
export const airtableManager = new AirtableManager();

class CircleManager {
  constructor(apiKey = 'SC4L6oxeEDWSKMp1P3TZRTd6hYA8Cx3x') {
    this.apiKey = apiKey;
    this.baseUrl = 'https://app.circle.so/api/admin/v2';
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    this.privateSpaces = [1290095, 1108523, 1108521];
    this.defaultSpaces = [1193660, 1193619, 1188388, 1158828, 1108574, 1108572, 1108569, 1108532, 
      1108531, 1108530, 1108518, 1108517, 1108516, 1105128, 1105127, 1105126, 2129713, 2041185];
    
    this.TAGS_BY_PLAN = {

      //UNIQUE
      "produits_gagnants": {
        tag: 189814,
        name: "Produits Gagnants",
        duration: 30,
        airtable: "PRODUITS GAGNANTS"
      },
      "support_direct": {
        tag: 189816,
        name: "Support Direct",
        duration: 30,
        airtable: "SUPPORT DIRECT"
      },
      "lives_rediffusions": {
        tag: 189817,
        name: "Lives & Rediffusions",
        duration: 30,
        airtable: "LIVE ET REDIFFUSIONS"
      },

      //UNIQUE SEMESTER
      "produits_gagnants_yearly": {
        tag: 189814,
        name: "Produits Gagnants",
        duration: 365,
        airtable: "PRODUITS GAGNANTS"
      },
      "support_direct_yearly": {
        tag: 189816,
        name: "Support Direct",
        duration: 365,
        airtable: "SUPPORT DIRECT"
      },
      "lives_rediffusions_yearly": {
        tag: 189817,
        name: "Lives & Rediffusions",
        duration: 365,
        airtable: "LIVE ET REDIFFUSIONS"
      },

      //ALL IN ONE
      "all_in_one_monthly": {
        tag: 189818,
        name: "All-In-One",
        duration: 90,
        airtable: "ALL IN ONE"
      },
      "all_in_one_semester": {
        tag: 189818,
        name: "All-In-One",
        duration: 182,
        airtable: "ALL IN ONE"
      },
      "all_in_one_yearly": {
        tag: 189818,
        name: "All-In-One",
        duration: 365,
        airtable: "ALL IN ONE"
      },
      "member": {
        tag: 190387,
        name: "Membre",
        duration: 30,
        airtable: "MEMBRE"
      },

      //NOUVEAUX PLANS
      "fin_accompagnement": {
        name: "Accompagnement Terminé",
        tag: 231374
      },
      "elite": {
        name: "Elite",
        tag: 231357,
        duration: 360
      },
      "premium": {
        name: "Premium",
        tag: 231356,
        duration: 182
      },
      "standard": {
        name: "Standard",
        tag: 231355,
        duration: 30
      }
    };
  }

  async sendInvitation(email, name, data) {
    try {
      const {status = 'Complet'} = data;

      const response = await this.client.post(`/community_members`, {
        email,
        name: name || 'User Test',
        skip_invitation: false,
        // ...(status && status !== 'Complet' ? {
        //   space_ids: this.defaultSpaces,
        // } : {
        //   space_ids: [...this.defaultSpaces, ...this.privateSpaces]
        // })
      });
      console.log('Invitation sent:', response.data);
      return response.data;
    } catch (error) {
      console.error(`Error sending invitation to ${email}:`, error.message);
      throw error;
    }
  }

  async addToSpace(email, spaceId) {
    try {
      let response = null;
      console.log(`Adding ${email} to space ${spaceId}`);
      try {
        response = await this.client.post(`/space_members`, {
          email,
          space_id: spaceId
        });
      } catch(error) {
        console.log(error);
        return null;
      }
      if (!response || !response.data) {
        return null;
      }
      return response.data;
    } catch(error) {
      throw error;
    }
  }

  async removeFromSpace(email, spaceId) {
    try {
      let response = null;
      console.log(`Removing ${email} from space ${spaceId}`);
      try {
        response = await this.client.delete(`/space_members`, {
          params: {
            email,
            space_id: spaceId
          }
        });
      } catch(error) {
        console.log(error.message);
        return null;
      }
      if (!response || !response.data) {
        return null;
      }
      return response.data;
    } catch(error) {
      throw error;
    }
  }

  async searchMember(email) {
    try {
      let response = null;
      console.log(`Searching member: ${email}`);
      try {
        response = await this.client.get(`/community_members/search?email=${email}`);
      } catch(error) {
        console.log(error);
        return null;
      }
      if (!response || response.data.length === 0) {
        return null;
      }
      return response.data;
    } catch (error) {
      console.error(`Error searching member ${email}:`, error.message);
      throw error;
    }
  }

  async tagMember(email, tag) {
    try {
      let response = null;

      const plan = this.TAGS_BY_PLAN[tag];
      if (!plan) {
        console.log(`Tag ${tag} not found in TAGS_BY_PLAN`);
        return null;
      }
      
      const tagId = plan.tag;
      
      try {
        response = await this.client.post(`/tagged_members`, {
          user_email: email,
          member_tag_id: tagId
        });
        console.log(`Tagged ${email} with ${tag}`);
      } catch(error) {
        console.log(error);
        return null;
      }
      if (!response || !response.data) {
        return null;
      }
      return plan;
    } catch(error) {
      throw error;
    }
  }

  async removeTag(email, tag) {
    try {
      const plan = this.TAGS_BY_PLAN[tag];
      if (!plan) {
        return null;
      }
      
      const tagId = plan.tag;
      
      try {
        const response = await this.client.delete(`/member_tags`, {
          params: {
            user_email: email,
            member_tag_id: tagId
          }
        });
        console.log(`Removed tag ${tag} from ${email}`);
        return response.data;
      } catch(error) {
        console.log(error);
        return null;
      }
    } catch(error) {
      throw error;
    }
  }

  async getAllmembers() {
    try {
      let response = null;
      let has_next = true, next_page = null;

      let members = [];
      while (has_next) {
        try {
          response = await this.client.get(`/community_members?per_page=100${next_page ? `&page=${next_page}` : ''}`);
          members = members.concat(response.data.records);
          has_next = response.data.has_next_page;
          next_page = response.data.page + 1;
        } catch(error) {
          console.log(error);
          return null;
        }
      }
      if (!response || !response.data) {
        console.log('Null Info..');
        return null;
      }
      return members;
    } catch(error) {
      throw error;
    }
  }
}

class EmailService {
  constructor() {
    // Configuration de votre service email (Gmail, SendGrid, etc.)
    this.transporter = nodemailer.createTransport({
      service: 'gmail', // ou votre service
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
  }

  async sendReminderEmail(reminderData) {
    const { email, studentName, type, daysBeforePayment, paymentDate } = reminderData;

    let subject = '';
    let message = '';

    if (daysBeforePayment === 7) {
      subject = `⏰ Rappel : Votre paiement ${type} dans 7 jours`;
      message = `
        Bonjour ${studentName || ''},
        
        Ceci est un rappel concernant votre paiement ${type} prévu pour le ${new Date(paymentDate).toLocaleDateString('fr-FR')}.
        
        Il vous reste 7 jours pour effectuer votre paiement.
        
        Pour maintenir votre accès, veuillez effectuer le paiement avant la date limite.
        
        Cordialement,
        L'équipe Ecom Africa Pro
      `;
    } else if (daysBeforePayment === 3) {
      subject = `⚠️ Important : Votre paiement ${type} dans 3 jours`;
      message = `
        Bonjour ${studentName || ''},
        
        ATTENTION : Votre paiement ${type} est prévu dans 3 jours (${new Date(paymentDate).toLocaleDateString('fr-FR')}).
        
        Pour éviter toute interruption de service, veuillez effectuer votre paiement dès que possible.
        
        Cordialement,
        L'équipe Ecom Africa Pro
      `;
    } else if (daysBeforePayment === 0) {
      subject = `🚨 URGENT : Votre paiement ${type} est dû aujourd'hui`;
      message = `
        Bonjour ${studentName || ''},
        
        Votre paiement ${type} est dû AUJOURD'HUI.
        
        Si vous n'effectuez pas le paiement, votre accès sera suspendu.
        
        Veuillez effectuer le paiement immédiatement pour maintenir votre accès.
        
        Cordialement,
        L'équipe Ecom Africa Pro
      `;
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: subject,
      text: message,
      html: `<pre>${message}</pre>`
    };

    try {
      await this.transporter.sendMail(mailOptions);
      console.log(`Email sent to ${email} - ${daysBeforePayment} days before payment`);
      return true;
    } catch (error) {
      console.error(`Error sending email to ${email}:`, error);
      return false;
    }
  }

  async sendWhatsAppReminder(reminderData) {
    // Implémentation WhatsApp si nécessaire
    // Vous pouvez utiliser Twilio, WhatsApp Business API, etc.
    console.log(`WhatsApp reminder would be sent to ${reminderData.whatsapp}`);
  }
}

const emailService = new EmailService();

class ReminderScheduler {
  constructor() {
    this.circle = new CircleManager();
    this.airtable = new AirtableManager();
  }

  async createReminder(email, paymentDate, type, tag, studentData = {}) {
    try {
      const reminderDates = [7, 3, 0].map(days => {
        const date = new Date(paymentDate);
        date.setDate(date.getDate() - days);
        return {
          date: date,
          daysBeforePayment: days,
          status: 'pending'
        };
      });

      const reminder = new Reminder({
        email,
        type,
        paymentDate,
        reminderDates,
        tag,
        studentName: studentData.name,
        whatsapp: studentData.whatsapp,
        status: 'active'
      });

      await reminder.save();
      console.log(`Reminder created for ${email} - Payment date: ${paymentDate}`);
      return reminder;
    } catch (error) {
      console.error('Error creating reminder:', error);
      throw error;
    }
  }

  async updateReminderForPayment(email, type, newPaymentDate) {
    try {
      // Trouver le reminder actif pour cet email et type
      const reminder = await Reminder.findOne({
        email,
        type,
        status: 'active'
      });

      if (!reminder) {
        console.log(`No active reminder found for ${email} - ${type}`);
        return null;
      }

      // Mettre à jour la date de paiement
      reminder.paymentDate = newPaymentDate;
      
      // Recalculer les dates de rappel
      reminder.reminderDates = [7, 3, 0].map(days => {
        const date = new Date(newPaymentDate);
        date.setDate(date.getDate() - days);
        return {
          date: date,
          daysBeforePayment: days,
          status: 'pending'
        };
      });

      reminder.updatedAt = new Date();
      await reminder.save();

      console.log(`Reminder updated for ${email} - New payment date: ${newPaymentDate}`);
      return reminder;
    } catch (error) {
      console.error('Error updating reminder:', error);
      throw error;
    }
  }

  async cancelReminder(email, type) {
    try {
      const reminder = await Reminder.findOne({
        email,
        type,
        status: 'active'
      });

      if (!reminder) {
        console.log(`No active reminder found to cancel for ${email} - ${type}`);
        return null;
      }

      reminder.status = 'cancelled';
      reminder.updatedAt = new Date();
      await reminder.save();

      console.log(`Reminder cancelled for ${email} - ${type}`);
      return reminder;
    } catch (error) {
      console.error('Error cancelling reminder:', error);
      throw error;
    }
  }

  async processReminders() {
    try {
      const now = new Date();
      console.log(`Processing reminders at ${now}`);

      // Trouver tous les reminders actifs avec des dates de rappel à envoyer
      const reminders = await Reminder.find({
        status: 'active',
        'reminderDates.status': 'pending',
        'reminderDates.date': { $lte: now }
      });

      console.log(`Found ${reminders.length} reminders to process`);

      for (const reminder of reminders) {
        for (const reminderDate of reminder.reminderDates) {
          if (reminderDate.status === 'pending' && reminderDate.date <= now) {
            const success = await emailService.sendReminderEmail({
              email: reminder.email,
              studentName: reminder.studentName,
              type: reminder.type,
              daysBeforePayment: reminderDate.daysBeforePayment,
              paymentDate: reminder.paymentDate
            });

            // Mettre à jour le statut du rappel
            reminderDate.status = success ? 'sent' : 'failed';
            reminderDate.sentAt = new Date();

            // Si c'est le dernier rappel (jour J), supprimer le tag
            if (reminderDate.daysBeforePayment === 0) {
              console.log(`Last reminder sent for ${reminder.email}, removing tag...`);
              await this.circle.removeTag(reminder.email, reminder.tag);
              
              // Marquer le reminder comme complété
              reminder.status = 'completed';
              
              // Mettre à jour le statut dans Airtable
              if (reminder.type === 'formation') {
                const _formations = await this.airtable.checkIfEmailExists(reminder.email, "DASHBOARD FORMATION");
                if (_formations && _formations.length > 0) {
                  await base("DASHBOARD FORMATION").update(_formations[0].id, {
                    "STATUT DE PAIEMENT": "EN RETARD",
                    "STATUT RELANCE AUTO": "RELANCE 3",
                  });
                }
              } else if (reminder.type === 'coaching') {
                const _coachings = await this.airtable.checkIfEmailExists(reminder.email, "DASHBOARD COACHING");
                if (_coachings && _coachings.length > 0) {
                  await base("DASHBOARD COACHING").update(_coachings[0].id, {
                    "STATUT PAIEMENT ": "EN RETARD",
                    "STATUT RELANCE AUTO": "RELANCE 3",
                  });
                }
              }
            }

            // Envoyer aussi sur WhatsApp si disponible
            if (reminder.whatsapp) {
              await emailService.sendWhatsAppReminder({
                whatsapp: reminder.whatsapp,
                studentName: reminder.studentName,
                type: reminder.type,
                daysBeforePayment: reminderDate.daysBeforePayment,
                paymentDate: reminder.paymentDate
              });
            }
          }
        }

        reminder.updatedAt = new Date();
        await reminder.save();
      }

      console.log('Reminder processing completed');
    } catch (error) {
      console.error('Error processing reminders:', error);
      throw error;
    }
  }
}

const reminderScheduler = new ReminderScheduler();

// ==================== CRON JOB ====================

// Exécuter toutes les heures
// cron.schedule('0 * * * *', async () => {
//   console.log('Running reminder cron job...');
//   try {
//     await reminderScheduler.processReminders();
//   } catch (error) {
//     console.error('Cron job error:', error);
//   }
// });

// Optionnel : exécuter toutes les 15 minutes pour plus de réactivité
// cron.schedule('*/15 * * * *', async () => {
//   console.log('Running reminder cron job...');
//   try {
//     await reminderScheduler.processReminders();
//   } catch (error) {
//     console.error('Cron job error:', error);
//   }
// });

// ==================== HELPER FUNCTIONS ====================

function parseTallyPayload(payload) {
  try {
    const fields = payload.data.fields;
    const map = {};
  
    for (const f of fields) {
      if (f.type === "MULTIPLE_CHOICE" && Array.isArray(f.value)) {
        const selected = f.options.filter(o => f.value.includes(o.id)).map(o => o.text);
        map[f.key] = selected.length === 1 ? selected[0] : selected;
      } else if (f.type === "FILE_UPLOAD" && Array.isArray(f.value)) {
        map[f.key] = f.value.map(file => ({ url: file.url, name: file.name }));
      } else {
        map[f.key] = f.value;
      }
    }
  
    return map;
  } catch(error) {
    console.log(error);
    throw error;
  }
}

function mapQuestionType(questions) {
  const _map = {};
  
  for (const q of questions) {
    _map[q.id] = q.type;
  }

  return _map;
}

function parsePayload(payload, questions) {
  try {
    const fileds = payload;
    const map = {};

    for (const f of fileds) {
      if (questions[f.questionId] === "MULTIPLE_CHOICE" && Array.isArray(f.answer)) {
        map[`question_${f.questionId}`] = f.answer.length === 1 ? f.answer[0] : f.answer;
      } else if (questions[f.questionId] === "FILE_UPLOAD" && Array.isArray(f.answer)) {
        map[`question_${f.questionId}`] = f.answer.map(file => ({ url: file.url, name: file.name }));
      } else if (questions[f.questionId] === "CALCULATED_FIELDS") {
        map[`question_${f.questionId}`] = f.answer['Modalité'];
      }  else {
        map[`question_${f.questionId}`] = f.answer;
      }
    }

    return map;
  } catch(error) {
    console.log(error);
    throw error;
  }
}

function getPaymentData(data) {
  return {
    "MODALITE DE PAIEMENT": data["question_o98vA1_5d35a515-3d34-4e89-8079-9563ff40e9b8"] || data["question_o98vA1"],
    "STATUT DE TRAITEMENT": "NON TRAITÉ",
    "PRODUIT": data["question_o9NW8b"],
    "MONTANT": data["question_BEJl7e"],
    "DEVISE": data["question_Vp7gWj"],
    "MOYEN DE PAIEMENT": data["question_GeEWOe"],
    "PREUVE DE PAIEMENT": data["question_PRQKZ1"].map(f => ({ url: f.url })),
  };
}

function getEtudiantData(data) {
  return {
    "NOM ET PRENOMS": data["question_rD979X"],
    "EMAIL": data["question_je4N41"],
    "WHATSAPP": data["question_2jd0dM"],
    "AGE": data["question_4a0505"],
    "OCCUPATION": data["question_RWepqK"],
    "OU AVEZ VOUS ENTENDU PARLE DE MYRIL LA PREMEIERE FOIS ?": data["question_xVbKbk"]
  };
}

function getFormationData(data) {
  const nextPaymentDate = new Date();
  nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

  return {
    "STATUT DE PAIEMENT": "EN RÈGLE", //data.paymentTerms === "Complet" ? "EN RÈGLE" : "EN ATTENTE",
    "STATUT RELANCE AUTO": "EN RÈGLE",
    "STATUT RELANCE MANUELLE": "EN RÈGLE",
    "ACTIONS": "🤖 INTÉGRÉ",
    "MODALITE DE PAIEMENT": data.paymentTerms,
    "DATE DU PROCHAIN PAIEMENT": data.paymentTerms === "Complet" ? undefined : nextPaymentDate.toISOString().split('T')[0]
  };
}
function getNextPaymentDate(duration, startDate = new Date()) {
  if (!duration || typeof duration !== "number") {
    throw new Error("Invalid duration: doit être un nombre de jours");
  }

  const baseDate = new Date(startDate);
  const nextDate = new Date(baseDate);
  nextDate.setDate(baseDate.getDate() + duration);

  return nextDate;
}

export async function syncCircle(_members = []) {
  try {
    const _circle = new CircleManager();
    const members = _members.length > 0 ? _members : await _circle.getAllmembers();

    console.log("Members: ", members[0], members.length);
    const _airtable = new AirtableManager();

    for (const member of members) {
      let existingCoaching = await _airtable.checkIfEmailExists(member.email, "DASHBOARD COACHING");

      if (!existingCoaching) {
        console.log("No coaching found for member:", member.email);
        continue;
      }
      existingCoaching = existingCoaching[0];
      if (existingCoaching.fields["STATUT PAIEMENT "] === "EN REGLE") {
        console.log("Coaching:", member.email);
        await _circle.tagMember(member.email, "all_in_one_monthly");
        await base("DASHBOARD COACHING").update(existingCoaching.id, { "TAG": ["ALL IN ONE"], "ID CIRCLE": member.id });
      } else {
        console.log("Member:", member.email);
        await _circle.tagMember(member.email, "member");
        await base("DASHBOARD COACHING").update(existingCoaching.id, { "TAG": ["MEMBER"], "ID CIRCLE": member.id });
      }
    }
    return {
      message: "Done"
    }

  } catch (error) {
    console.error('Error syncing Circle:', error);
  }
}

export async function handleCoachingPaymentWebhook(email, tag, studentData) {
  try {
    const _circle = new CircleManager();
    const _airtable = new AirtableManager();

    const plan = await _circle.tagMember(email, tag);

    await _airtable.createChariowPayment(studentData, plan.duration);

    const nextPaymentDate = getNextPaymentDate(plan.duration);

    await reminderScheduler.createReminder(
      email,
      nextPaymentDate,
      'coaching',
      tag,
      {
        name: studentData?.customer.name,
        email: email,
        whatsapp: studentData?.customer.phone || "+22901XXXXXXXX"
      }
    );

    const _etudiant = await _airtable.checkIfEmailExists(email, 'ETUDIANTS');
    if (_etudiant) {
      const _coachings = await _airtable.checkIfEmailExists(email, "DASHBOARD COACHING");
      if (_coachings && _coachings.length > 0) {
        await base("DASHBOARD COACHING").update(_coachings[0].id, {
          "PROCHAIN PAIEMENT COACHING": nextPaymentDate.toISOString().split('T')[0],
          "STATUT PAIEMENT ": "EN REGLE",
          "STATUT RELANCE AUTO": "EN RÈGLE",
          "STATUT RELANCE MANUELLE": "EN RÈGLE",
          "ACTIONS": "🤖 INTÉGRÉ"
        });

        await _airtable.addTagToAirtable(_coachings[0].id, plan.airtable);
      }
    }

    return { success: true, message: 'Coaching payment processed successfully' };
  } catch(error) {
    console.log("Errrrror:", error);
    throw error;
  }
}

export async function createReminderJob(email, createdTime, duration) {
  try {
    console.log("Creating reminder job for email:", email, "createdTime:", createdTime, duration)
    const date = new Date(createdTime);
    console.log(date);
    date.setDate(date.getDate() + duration);
    console.log(date);
    const delay = Math.max(0, date.getTime() - Date.now());
    console.log("Delay before", delay, "seconds");
    await CircleQueue.add('circle', { email, createdTime }, { delay });
  } catch (error) {
    console.log("Error creating reminder job:", error);
  }
}

export async function handleStatus(data) {
  try {
    const payload = data;
    console.log('Processing status change:', payload);
    
    const _airtable = new AirtableManager();
    const _circle = new CircleManager();
    if (payload.formation === 'COACHING') {
      return;
    }
    if (payload.status === 'TRAITÉ') {
      const _etudiant = await _airtable.checkIfEmailExists(payload.email[0], 'ETUDIANTS');
      
      if (!_etudiant) {
        console.log('ETUDIANT not found in Airtable');
        return;
      }

      let _circle_etudiant = _etudiant ? await _circle.searchMember(payload.email[0]) : null;

      if (!_circle_etudiant) {
        console.log('Sending invitation...');
        _circle_etudiant = await _circle.sendInvitation(
          payload.email[0],
          payload.name[0],
          {
            status: payload.paymentTerms
          }
        );
      }

      const studentData = {
        name: payload.name[0],
        whatsapp: _etudiant[0].fields.WHATSAPP
      };

      await _circle.tagMember(payload.email[0], payload.plan.toLowerCase());

      const _formation = await _airtable.createFormation(payload, _etudiant, _circle_etudiant);
      console.log(_formation);      
      await createReminderJob(payload.email[0], _formation._rawJson.createdTime, _circle.TAGS_BY_PLAN[payload.plan.toLowerCase()].duration);

      await _airtable.createOrUpdateCoaching(payload, _etudiant, _circle_etudiant, _formation, 60);

      // if (payload.paymentTerms === "Complet") {
      //   await _circle.tagMember(payload.email[0], "");

      //   const nextPaymentDate = new Date();
      //   nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 2);
        

      // } else {
      //   const nextPaymentDate = new Date();
      //   nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

      //   await _airtable.createFormation(payload, _etudiant, _circle_etudiant);
      //   await _airtable.createOrUpdateCoaching(payload, _etudiant, _circle_etudiant, _formation, 30);
      // }
    }

    return { success: true, message: 'Status processed successfully' };
  } catch(error) {
    console.log(error);
    throw error;
  }
}

export async function handlePaymentCompletion(email, paymentType = 'formation') {
  try {
    const _circle = new CircleManager();
    const _airtable = new AirtableManager();

    console.log(`Payment completed for ${email} - ${paymentType}`);

    // Annuler les reminders en cours
    await reminderScheduler.cancelReminder(email, paymentType);

    // Mettre à jour le dashboard approprié
    if (paymentType === 'formation') {
      const _formations = await _airtable.checkIfEmailExists(email, "DASHBOARD FORMATION");
      if (_formations && _formations.length > 0) {
        const isPartialPayment = _formations[0].fields["MODALITE DE PAIEMENT"] !== "Complet";
        
        // Calculer la prochaine date de paiement
        const nextPaymentDate = new Date();
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

        await base("DASHBOARD FORMATION").update(_formations[0].id, {
          "STATUT DE PAIEMENT": "EN RÈGLE",
          "STATUT RELANCE AUTO": "EN RÈGLE",
          "DATE DU PROCHAIN PAIEMENT": isPartialPayment ? nextPaymentDate.toISOString().split('T')[0] : null
        });

        // Si c'était un paiement partiel, créer un nouveau reminder pour le mois prochain
        if (isPartialPayment) {
          const _etudiant = await _airtable.checkIfEmailExists(email, 'ETUDIANTS');
          const studentData = {
            name: _formations[0].fields["NOM ET PRÉNOMS"] ? _formations[0].fields["NOM ET PRÉNOMS"][0] : '',
            whatsapp: _etudiant ? _etudiant[0].fields.WHATSAPP : ''
          };

          await reminderScheduler.createReminder(
            email,
            nextPaymentDate,
            'formation',
            'all_in_one_monthly',
            studentData
          );
        } else {
          // Si paiement complet, ajouter aux espaces privés
          for (const space of _circle.privateSpaces) {
            await _circle.addToSpace(email, space);
          }
        }

        // Re-tag le membre
        await _circle.tagMember(email, "all_in_one_monthly");
      }
    } else if (paymentType === 'coaching') {
      const _coachings = await _airtable.checkIfEmailExists(email, "DASHBOARD COACHING");
      if (_coachings && _coachings.length > 0) {
        const nextPaymentDate = new Date();
        nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);

        await base("DASHBOARD COACHING").update(_coachings[0].id, {
          "STATUT PAIEMENT ": "EN RÈGLE",
          "STATUT RELANCE AUTO": "EN RÈGLE",
          "PROCHAIN PAIEMENT COACHING": nextPaymentDate.toISOString().split('T')[0]
        });

        // Créer un nouveau reminder pour le mois prochain
        const studentData = {
          name: _coachings[0].fields["NOM ET PRÉNOMS"] ? _coachings[0].fields["NOM ET PRÉNOMS"][0] : '',
          whatsapp: _coachings[0].fields.WHATSAPP ? _coachings[0].fields.WHATSAPP[0] : ''
        };

        await reminderScheduler.createReminder(
          email,
          nextPaymentDate,
          'coaching',
          'all_in_one_monthly',
          studentData
        );

        // Re-tag le membre
        await _circle.tagMember(email, "all_in_one_monthly");
      }
    }

    return { success: true, message: 'Payment completion processed' };
  } catch(error) {
    console.log(error);
    throw error;
  }
}

export async function incomingResponse(data) {
  try {
    const payload = data;
    const userData = parseTallyPayload(payload);

    const _airtable = new AirtableManager();

    const _etudiant = await _airtable.checkIfEmailExists(userData["question_je4N41"], 'ETUDIANTS');

    if (_etudiant) {
      console.log('Updating existing student');
      await _airtable.updateEtudiant(userData, _etudiant[0].id);
    } else {
      console.log('Creating new student');
      await _airtable.createEtudiant(userData);
    }

    await _airtable.createPayment(userData);

    return { success: true, message: 'Response processed successfully' };
  } catch(error) {
    console.log(error);
    throw error;
  }
}

export async function regAirtable(data) {
  try {
    const payload = data;
    const subs = data.submissions;

    const _airtable = new AirtableManager();

    const questions = mapQuestionType(data.questions);
    console.log(questions);
    for (const sub of subs) {
      const userData = parsePayload(sub.responses, questions);

      const _etudiant = await _airtable.checkIfEmailExists(userData["question_je4N41"], 'ETUDIANTS');
  
      if (_etudiant) {
        console.log('Updating existing student');
        await _airtable.updateEtudiant(userData, _etudiant[0].id);
      } else {
        console.log('Creating new student');
        await _airtable.createEtudiant(userData);
      }
  
      await _airtable.createPayment(userData);
    }

  } catch(error) {
    console.log(error);
    throw error;
  }
}

export { 
  reminderScheduler, 
  Reminder, 
  EmailService,
  emailService 
};

