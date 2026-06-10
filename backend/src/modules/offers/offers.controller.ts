import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common'
import {
  IsString, IsOptional, IsNumber, IsBoolean, Min,
} from 'class-validator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { OffersService } from './offers.service'

import { IsArray } from 'class-validator'

class CreateOfferDto {
  @IsString() name: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsArray() features?: string[]
}

class UpdateOfferDto {
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsBoolean() isActive?: boolean
  @IsOptional() @IsArray() features?: string[]
}

class CreatePlanDto {
  @IsString() name: string
  @IsNumber() @Min(1) durationMonths: number
  @IsOptional() @IsNumber() @Min(0) price?: number
  @IsOptional() @IsString() currency?: string
  @IsOptional() @IsNumber() @Min(1) partialDueAfterDays?: number
  @IsOptional() @IsBoolean() isActive?: boolean
}

class UpdatePlanDto {
  @IsOptional() @IsString() _id?: string
  @IsOptional() @IsString() name?: string
  @IsOptional() @IsNumber() @Min(1) durationMonths?: number
  @IsOptional() @IsNumber() @Min(0) price?: number
  @IsOptional() @IsString() currency?: string
  @IsOptional() @IsNumber() @Min(1) partialDueAfterDays?: number
  @IsOptional() @IsBoolean() isActive?: boolean
}

@Controller('subscription-offers')
@UseGuards(JwtAuthGuard)
export class OffersController {
  constructor(private offersService: OffersService) {}

  // ── Offres ──────────────────────────────────────────────────────

  @Get()
  listOffers(@Query('activeOnly') activeOnly?: string) {
    return this.offersService.listOffers(activeOnly === 'true')
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  createOffer(@Body() dto: CreateOfferDto) {
    return this.offersService.createOffer(dto)
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  updateOffer(@Param('id') id: string, @Body() dto: UpdateOfferDto) {
    return this.offersService.updateOffer(id, dto)
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  deleteOffer(@Param('id') id: string) {
    return this.offersService.deleteOffer(id)
  }

  // ── Plans ────────────────────────────────────────────────────────

  @Post(':id/plans')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  addPlan(@Param('id') id: string, @Body() dto: CreatePlanDto) {
    return this.offersService.addPlan(id, dto)
  }

  @Patch(':id/plans/:planId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  updatePlan(
    @Param('id') id: string,
    @Param('planId') planId: string,
    @Body() dto: UpdatePlanDto,
  ) {
    return this.offersService.updatePlan(id, planId, dto)
  }

  @Delete(':id/plans/:planId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  removePlan(@Param('id') id: string, @Param('planId') planId: string) {
    return this.offersService.removePlan(id, planId)
  }

  // ── Backfill ─────────────────────────────────────────────────────

  @Get('backfill/preview')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  backfillPreview() {
    return this.offersService.backfillPreview()
  }

  @Post('backfill/run')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  @HttpCode(HttpStatus.OK)
  backfillRun() {
    return this.offersService.backfillRun()
  }

  // ── Souscriptions ──────────────────────────────────────────────

  @Get('subscriptions')
  listSubscriptions(
    @Query('studentEmail') studentEmail?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.offersService.listSubscriptions({
      studentEmail,
      status,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
  }

  @Get('subscriptions/student/:email')
  getStudentSubscriptions(@Param('email') email: string) {
    return this.offersService.getStudentSubscriptions(email)
  }
}
