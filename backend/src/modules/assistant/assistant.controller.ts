import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common'
import { IsBoolean, IsNumber, IsOptional, IsString, IsArray, IsObject, IsIn } from 'class-validator'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { AssistantService } from './assistant.service'

class ProviderChoiceBody {
  @IsIn(['groq', 'gemini', 'anthropic']) provider: 'groq' | 'gemini' | 'anthropic'
  @IsString() model: string
}

class BusinessHoursBody {
  @IsOptional() @IsBoolean() enabled?: boolean
  @IsOptional() @IsString() startTime?: string
  @IsOptional() @IsString() endTime?: string
  @IsOptional() @IsArray() days?: number[]
  @IsOptional() @IsBoolean() aiOffDuringHours?: boolean
}

class UpdateAssistantBody {
  @IsOptional() @IsBoolean() aiMasterEnabled?: boolean
  @IsOptional() @IsString() systemPrompt?: string
  @IsOptional() @IsObject() primary?: ProviderChoiceBody
  @IsOptional() fallback?: ProviderChoiceBody | null
  @IsOptional() @IsNumber() temperature?: number
  @IsOptional() @IsNumber() maxTokens?: number
  @IsOptional() @IsArray() languages?: string[]
  @IsOptional() @IsObject() businessHours?: BusinessHoursBody
  @IsOptional() @IsNumber() contextWindow?: number
}

@Controller('assistant')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Get('config')
  getConfig() {
    return this.service.getConfig()
  }

  @Patch('config')
  updateConfig(@Body() body: UpdateAssistantBody) {
    return this.service.updateConfig(body as any)
  }
}
