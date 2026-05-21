import { IsEmail, IsIn } from 'class-validator'

export class InviteUserDto {
  @IsEmail()
  email: string

  @IsIn(['admin', 'member'])
  role: 'admin' | 'member'
}
