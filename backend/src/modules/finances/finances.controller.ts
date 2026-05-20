import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common'
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
  @IsOptional() @IsIn(['stripe', 'chariow', 'pawapay', 'fedapay', 'wave', 'orange_money', 'virement', 'manual', 'bank_import']) gateway?: string
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

  // Gateway sync endpoints (require env keys to be effective)
  @Post('sync/stripe')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  syncStripe(@CurrentUser() user: UserDocument) {
    return this.financesService.syncStripe(user._id.toString())
  }

  @Post('sync/pawapay')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  syncPawaPay(@CurrentUser() user: UserDocument) {
    return this.financesService.syncPawaPay(user._id.toString())
  }

  @Post('sync/fedapay')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  syncFedaPay(@CurrentUser() user: UserDocument) {
    return this.financesService.syncFedaPay(user._id.toString())
  }
}
