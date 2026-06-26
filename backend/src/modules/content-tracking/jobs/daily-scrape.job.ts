import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { ContentTrackingService } from '../content-tracking.service'

@Injectable()
export class DailyScrapeJob {
  private readonly logger = new Logger(DailyScrapeJob.name)

  constructor(private readonly tracking: ContentTrackingService) {}

  @Cron('0 6 * * *', { timeZone: 'Africa/Abidjan' })
  async runDailyScrape(): Promise<void> {
    const accounts = await this.tracking.listActiveAccounts()
    this.logger.log(`[DailyScrape] ${accounts.length} comptes actifs à scraper`)

    for (const account of accounts) {
      try {
        const { videos_added, snapshots_added } = await this.tracking.scrapeAccount(String(account._id))
        this.logger.log(
          `[DailyScrape] ${account.platform}/${account.handle} → +${videos_added} vidéos, +${snapshots_added} snapshots`,
        )
      } catch (err) {
        this.logger.error(
          `[DailyScrape] échec ${account.platform}/${account.handle}: ${(err as Error).message}`,
        )
      }
    }
  }

  @Cron('0 7 * * *', { timeZone: 'Africa/Abidjan' })
  async runDailyReports(): Promise<void> {
    const accounts = await this.tracking.listActiveAccounts()
    this.logger.log(`[DailyReports] ${accounts.length} comptes à analyser`)

    for (const account of accounts) {
      try {
        await this.tracking.generateDailyReport(String(account._id))
        this.logger.log(`[DailyReports] OK ${account.platform}/${account.handle}`)
      } catch (err) {
        this.logger.error(
          `[DailyReports] échec ${account.platform}/${account.handle}: ${(err as Error).message}`,
        )
      }
    }
  }
}
