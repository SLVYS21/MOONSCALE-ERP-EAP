import { IsString, IsOptional, IsIn, IsObject } from 'class-validator'
import type { Permissions, UserRole } from '../schemas/user.schema'

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  firstName?: string

  @IsOptional()
  @IsString()
  lastName?: string

  @IsOptional()
  @IsIn(['admin', 'member'])
  role?: Exclude<UserRole, 'superadmin'>

  @IsOptional()
  @IsObject()
  permissions?: Partial<Permissions>
}
