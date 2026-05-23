import { Controller, Get, Post, Body, Param, Delete, Req, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { SyncService } from './sync.service'

@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('status')
  getStatus() {
    return this.syncService.getStatus()
  }

  @Get('samples')
  getSamples(): any {
    return this.syncService.getSamples()
  }

  @Post('airtable')
  syncAirtable() {
    return this.syncService.syncAirtable()
  }

  @Post('circle')
  syncCircle() {
    return this.syncService.syncCircle()
  }

  @Post('debtors')
  detectDebtors() {
    return this.syncService.detectDebtors()
  }

  @Post('seed-tally-form')
  seedTallyForm(@Req() req: { user: { userId: string } }) {
    return this.syncService.seedTallyForm(req.user.userId)
  }

  @Post('tally-responses')
  syncTallyResponses() {
    return this.syncService.syncTallyResponses()
  }

  @Post('backfill-proofs')
  backfillProofImages() {
    return this.syncService.backfillProofImages()
  }

  @Post('students/:id/proofs')
  addProof(
    @Param('id') id: string,
    @Body() body: { url: string; type: 'image' | 'video' | 'link'; caption: string },
    @Req() req: { user: { userId: string } },
  ) {
    return this.syncService.addSuccessProof(id, { ...body, addedBy: req.user.userId })
  }

  @Delete('students/:id/proofs/:proofId')
  removeProof(@Param('id') id: string, @Param('proofId') proofId: string) {
    return this.syncService.removeSuccessProof(id, proofId)
  }
}
