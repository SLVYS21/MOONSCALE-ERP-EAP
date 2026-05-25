import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
  UseInterceptors, UploadedFile, BadRequestException,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { FinancesService } from './finances.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { IsString, IsOptional, IsNumber, Min, IsIn, IsPositive } from 'class-validator'
import { Type } from 'class-transformer'
import type { UserDocument } from '../users/schemas/user.schema'

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreateCategoryDto {
  @IsString() name: string
  @IsOptional() @IsIn(['income', 'expense', 'both']) type?: string
  @IsOptional() @IsString() color?: string
  @IsOptional() @IsString() icon?: string
}

class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsIn(['income', 'expense', 'both']) type?: string
  @IsOptional() @IsString() color?: string
  @IsOptional() @IsString() icon?: string
}

class CreateTransactionDto {
  @IsIn(['income', 'expense']) type: string
  @IsNumber() @IsPositive() amount: number
  @IsOptional() @IsIn(['EUR', 'USD', 'XOF', 'MAD', 'CAD']) currency?: string
  @IsString() description: string
  @IsOptional() @IsString() categoryId?: string | null
  @IsString() date: string
  @IsOptional() @IsString() gateway?: string
  @IsOptional() @IsIn(['pending', 'completed', 'failed', 'refunded']) status?: string
  @IsOptional() @IsString() reference?: string
  @IsOptional() @IsString() notes?: string
}

class UpdateTransactionDto {
  @IsOptional() @IsIn(['income', 'expense']) type?: string
  @IsOptional() @IsNumber() @IsPositive() amount?: number
  @IsOptional() @IsIn(['EUR', 'USD', 'XOF', 'MAD', 'CAD']) currency?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() categoryId?: string | null
  @IsOptional() @IsString() date?: string
  @IsOptional() @IsString() gateway?: string
  @IsOptional() @IsIn(['pending', 'completed', 'failed', 'refunded']) status?: string
  @IsOptional() @IsString() reference?: string
  @IsOptional() @IsString() notes?: string
  @IsOptional() offerId?: string | null
  @IsOptional() productName?: string | null
}

class ListTransactionsQuery {
  @IsOptional() @IsIn(['income', 'expense']) type?: string
  @IsOptional() @IsString() categoryId?: string
  @IsOptional() @IsString() gateway?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() @IsString() currency?: string
  @IsOptional() @IsString() search?: string
  @IsOptional() @IsString() dateFrom?: string
  @IsOptional() @IsString() dateTo?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number
}

class StatsQuery {
  @IsOptional() @IsIn(['EUR', 'USD', 'XOF', 'MAD', 'CAD']) currency?: string
}

class ConfirmMappingDto {
  @IsString() offerId: string
}

class ListMappingsQuery {
  @IsOptional() @IsIn(['pending', 'confirmed', 'ignored']) status?: string
}

// ── Categories controller ─────────────────────────────────────────────────────

@Controller('finances/categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private financesService: FinancesService) {}

  @Get()
  listCategories(@Query('type') type?: string) {
    return this.financesService.listCategories(type)
  }

  @Post()
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.financesService.createCategory(dto)
  }

  @Patch(':id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.financesService.updateCategory(id, dto)
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  deleteCategory(@Param('id') id: string) {
    return this.financesService.deleteCategory(id)
  }
}

// ── Transactions controller ───────────────────────────────────────────────────

@Controller('finances')
@UseGuards(JwtAuthGuard)
export class FinancesController {
  constructor(private financesService: FinancesService) {}

  // stats before :id to avoid route conflict
  @Get('stats')
  getStats(@Query() query: StatsQuery) {
    return this.financesService.getStats(query.currency ?? 'EUR')
  }

  @Get('transactions')
  listTransactions(@Query() query: ListTransactionsQuery) {
    return this.financesService.listTransactions(query)
  }

  @Get('transactions/:id')
  getTransaction(@Param('id') id: string) {
    return this.financesService.getTransaction(id)
  }

  @Post('transactions')
  createTransaction(
    @Body() dto: CreateTransactionDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.financesService.createTransaction({ ...dto, createdById: user._id.toString() })
  }

  @Patch('transactions/:id')
  updateTransaction(@Param('id') id: string, @Body() dto: UpdateTransactionDto) {
    return this.financesService.updateTransaction(id, dto)
  }

  @Delete('transactions/:id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  deleteTransaction(@Param('id') id: string) {
    return this.financesService.deleteTransaction(id)
  }

  // ── Gateway sync endpoints ─────────────────────────────────────────────────

  /** Pull all completed Chariow sales since 2025-06-01 (requires CHARIOW_API_KEY). */
  @Post('sync/chariow')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  syncChariow() {
    return this.financesService.syncChariow()
  }

  /** Pull Stripe charges + payouts since 2025-06-01 (requires STRIPE_SECRET_KEY). */
  @Post('sync/stripe')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  syncStripe() {
    return this.financesService.syncStripe()
  }

  /** PawaPay has no historical list API — transactions arrive via webhook only. */
  @Post('sync/pawapay')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  syncPawaPay() {
    return this.financesService.syncPawaPay()
  }

  /**
   * Import FedaPay transactions from a CSV export.
   * Upload the file exported from the FedaPay dashboard as multipart/form-data field "file".
   */
  @Post('sync/fedapay-csv')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  syncFedaPayCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fichier CSV requis (champ "file")')
    const csvContent = file.buffer.toString('utf-8')
    return this.financesService.syncFedaPayCsv(csvContent)
  }

  /**
   * Import FedaPay transactions from the XLSX export (exports_transactions-YYYY-MM-DD.xlsx).
   * Upload as multipart/form-data field "file".
   */
  @Post('sync/fedapay-xlsx')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  syncFedaPayXlsx(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('Fichier XLSX requis (champ "file")')
    return this.financesService.syncFedaPayXlsx(file.buffer)
  }

  /** Seed default finance categories if they don't already exist. */
  @Post('categories/seed-defaults')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  seedDefaultCategories() {
    return this.financesService.seedDefaultCategories()
  }

  // ── Product mappings ───────────────────────────────────────────────────────

  @Get('product-mappings')
  listProductMappings(@Query() query: ListMappingsQuery) {
    return this.financesService.listProductMappings(query.status)
  }

  @Post('product-mappings/:id/confirm')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  confirmProductMapping(@Param('id') id: string, @Body() dto: ConfirmMappingDto) {
    return this.financesService.confirmProductMapping(id, dto.offerId)
  }

  @Post('product-mappings/:id/ignore')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  ignoreProductMapping(@Param('id') id: string) {
    return this.financesService.ignoreProductMapping(id)
  }

  @Post('product-mappings/:id/reset')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  resetProductMapping(@Param('id') id: string) {
    return this.financesService.resetProductMapping(id)
  }

  @Post('transactions/backfill-links')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @HttpCode(HttpStatus.OK)
  backfillEntityLinks() {
    return this.financesService.backfillEntityLinks()
  }
}
