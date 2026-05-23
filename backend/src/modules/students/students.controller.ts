import {
  Controller, Get, Post, Patch, Param, Body, Query,
  UseGuards, UseInterceptors, UploadedFile, HttpCode, HttpStatus,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { StudentsService } from './students.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { CloudinaryService } from '../cloudinary/cloudinary.service'
import type { UserDocument } from '../users/schemas/user.schema'
import { IsString, IsOptional, IsIn, IsNumber, Min, IsEnum } from 'class-validator'
import { Type } from 'class-transformer'

class TreatPaymentDto {
  @IsOptional() @IsString() planKey?: string
  @IsOptional() @IsString() modality?: string
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number
  @IsOptional() @IsString() currency?: string
  @IsOptional() @IsString() product?: string
  @IsOptional() @IsString() gateway?: string
  @IsOptional() @IsString() notes?: string
}

class UpdatePaymentFieldsDto {
  @IsOptional() @IsString() @IsIn(['NON TRAITÉ', 'TRAITÉ', 'REJETÉ']) status?: string
  @IsOptional() @IsString() @IsIn(['Complet', 'Partiel']) modality?: string
  @IsOptional() @IsString() @IsIn(['ECOM AFRICA PRO', 'COACHING', 'ECOM REVOLUTION']) product?: string
  @IsOptional() @IsString() gateway?: string
  @IsOptional() @Type(() => Number) @IsNumber() amount?: number
  @IsOptional() @IsString() currency?: string
}

class AddNoteDto {
  @IsString()
  note: string
}

class UpdateFormationStatusDto {
  @IsString() @IsIn(['EN RÈGLE', 'EN RETARD'])
  paymentStatus: 'EN RÈGLE' | 'EN RETARD'
}

class ListQuery {
  @IsOptional() @IsString() search?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() @IsString() debtStatus?: string
  @IsOptional() @IsString() product?: string
  @IsOptional() @IsString() studentEmail?: string
  @IsOptional() @IsString() dateFrom?: string
  @IsOptional() @IsString() dateTo?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number
}

@Controller()
@UseGuards(JwtAuthGuard)
export class StudentsController {
  constructor(
    private studentsService: StudentsService,
    private cloudinaryService: CloudinaryService,
  ) {}

  // ── Étudiants ──────────────────────────────────────────────────

  @Get('students/stats')
  getStudentStats() {
    return this.studentsService.getStudentStats()
  }

  @Get('students')
  listStudents(@Query() query: ListQuery) {
    return this.studentsService.listStudents(query)
  }

  @Get('students/:id')
  getStudent(@Param('id') id: string) {
    return this.studentsService.getStudent(id)
  }

  @Patch('students/:id/notes')
  addNote(@Param('id') id: string, @Body() dto: AddNoteDto) {
    return this.studentsService.addNote(id, dto.note)
  }

  @Post('students/:id/restrict')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  restrictAccess(@Param('id') id: string) {
    return this.studentsService.restrictStudentAccess(id)
  }

  @Post('students/:id/restore')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  restoreAccess(@Param('id') id: string, @Body('planKey') planKey: string) {
    return this.studentsService.restoreStudentAccess(id, planKey)
  }

  @Post('students/:id/circle-refresh')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  refreshCircle(@Param('id') id: string) {
    return this.studentsService.refreshCircleProfile(id)
  }

  @Patch('students/:id/admin')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  toggleAdmin(@Param('id') id: string) {
    return this.studentsService.toggleStudentAdmin(id)
  }

  @Patch('students/:id/formation-status')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  async updateFormationStatus(@Param('id') id: string, @Body() dto: UpdateFormationStatusDto) {
    await this.studentsService.updateFormationStatus(id, dto.paymentStatus)
    return { message: 'Statut formation mis à jour' }
  }

  @Post('students/:id/remove-coaching')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  async removeCoaching(@Param('id') id: string) {
    await this.studentsService.removeCoachingAccess(id)
    return { message: 'Accès coaching retiré' }
  }

  // ── Paiements ──────────────────────────────────────────────────

  @Get('payments/stats')
  getPaymentStats() {
    return this.studentsService.getPaymentStats()
  }

  @Get('payments')
  listPayments(@Query() query: ListQuery) {
    return this.studentsService.listPayments(query)
  }

  @Patch('payments/:id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  async updatePaymentFields(@Param('id') id: string, @Body() dto: UpdatePaymentFieldsDto) {
    await this.studentsService.updatePaymentFields(id, dto)
    return { message: 'Paiement mis à jour' }
  }

  @Post('payments/:id/treat')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  async treatPayment(
    @Param('id') id: string,
    @Body() dto: TreatPaymentDto,
    @CurrentUser() user: UserDocument,
  ) {
    await this.studentsService.treatPayment(id, user._id.toString(), dto)
    return { message: 'Paiement traité avec succès' }
  }

  @Post('payments/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  async rejectPayment(@Param('id') id: string) {
    await this.studentsService.rejectPayment(id)
    return { message: 'Paiement rejeté avec succès' }
  }

  @Post('payments/analyze-all')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  bulkAnalyzeProofs() {
    return this.studentsService.bulkAnalyzeProofs()
  }

  @Post('payments/analyze-debtors')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  analyzeDebtorProofs() {
    return this.studentsService.analyzeDebtorProofs()
  }

  @Post('payments/apply-ocr-amounts')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  applyOcrAmounts() {
    return this.studentsService.applyOcrAmounts()
  }

  @Post('payments/:id/analyze')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  analyzePayment(@Param('id') id: string) {
    return this.studentsService.analyzePaymentProof(id)
  }

  // ── Upload preuve de paiement ───────────────────────────────────

  @Post('payments/upload-proof')
  @UseInterceptors(FileInterceptor('file'))
  async uploadProof(@UploadedFile() file: Express.Multer.File) {
    const url = await this.cloudinaryService.upload(file.buffer, 'payment-proofs')
    return { url }
  }

  // ── Import Airtable (admin uniquement) ─────────────────────────

  @Post('admin/import-airtable')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  importAirtable() {
    return this.studentsService.importFromAirtable()
  }
}
