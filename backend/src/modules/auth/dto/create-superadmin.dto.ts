import { IsEmail, IsString, MinLength } from 'class-validator'

export class CreateSuperAdminDto {
  @IsEmail()
  email: string

  @IsString()
  firstName: string

  @IsString()
  lastName: string

  @IsString()
  @MinLength(8)
  password: string

  @IsString()
  setupKey: string
}
