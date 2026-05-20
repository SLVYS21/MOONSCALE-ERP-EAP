import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Cron } from '@nestjs/schedule'
import { Model } from 'mongoose'
import { StudentsService, ReminderRunSummary } from '../students/students.service'
import { ReminderCronRun, ReminderCronRunDocument } from './schemas/cron-run.schema'

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name)

  constructor(
    private studentsService: StudentsService,
    @InjectModel(ReminderCronRun.name) private cronRunModel: Model<ReminderCronRunDocument>,
  ) {}

  // Chaque jour à 9h (heure de Paris)
  @Cron('0 9 * * *', { timeZone: 'Europe/Paris' })
  async runScheduled() {
    await this.execute()
  }

  async execute(): Promise<{ run: ReminderCronRunDocument; summary: ReminderRunSummary }> {
    const runAt = new Date()
    const start = Date.now()
    this.logger.log(`Démarrage du cron de rappels — ${runAt.toISOString()}`)

    let summary: ReminderRunSummary
    let fatalError: string | null = null

    try {
      summary = await this.studentsService.processReminders()
    } catch (err: unknown) {
      fatalError = (err as Error).message
      this.logger.error(`Erreur fatale du cron de rappels : ${fatalError}`)
      summary = {
        totalReminders: 0,
        emailsSent: 0,
        emailsFailed: 0,
        accessRestricted: 0,
        entries: [],
      }
    }

    const durationMs = Date.now() - start

    const run = await this.cronRunModel.create({
      runAt,
      durationMs,
      totalReminders: summary.totalReminders,
      emailsSent: summary.emailsSent,
      emailsFailed: summary.emailsFailed,
      accessRestricted: summary.accessRestricted,
      fatalError,
      entries: summary.entries,
    })

    this.logger.log(
      `Cron rappels terminé en ${durationMs}ms — ` +
      `${summary.emailsSent} envoyé(s), ${summary.emailsFailed} échoué(s), ` +
      `${summary.accessRestricted} accès restreint(s)`,
    )

    return { run: run as ReminderCronRunDocument, summary }
  }

  async listRuns(page = 1, limit = 30) {
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      this.cronRunModel.find().sort({ runAt: -1 }).skip(skip).limit(limit).lean(),
      this.cronRunModel.countDocuments(),
    ])
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getRun(id: string) {
    return this.cronRunModel.findById(id).lean()
  }
}
