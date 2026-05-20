import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'
import * as bcrypt from 'bcryptjs'
import { UsersService } from '../users/users.service'
import type { UserDocument } from '../users/schemas/user.schema'

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  async validateUser(email: string, password: string): Promise<UserDocument> {
    const user = await this.usersService.findByEmail(email, true)
    if (!user || !user.password) throw new UnauthorizedException('Identifiants invalides')
    if (!user.isActive) throw new UnauthorizedException('Compte inactif')

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) throw new UnauthorizedException('Identifiants invalides')

    return user
  }

  async login(email: string, password: string) {
    const user = await this.validateUser(email, password)
    const tokens = await this.generateTokens(user)

    const hashed = await bcrypt.hash(tokens.refreshToken, 10)
    await this.usersService.updateRefreshToken(user._id.toString(), hashed)
    await this.usersService.updateLastActivity(user._id.toString())

    return {
      user: this.sanitize(user),
      ...tokens,
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify<{ sub: string }>(refreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      })
      const user = await this.usersService.findById(payload.sub)
      if (!user?.refreshToken) throw new UnauthorizedException()

      const valid = await bcrypt.compare(refreshToken, user.refreshToken)
      if (!valid) throw new UnauthorizedException()

      const tokens = await this.generateTokens(user)
      const hashed = await bcrypt.hash(tokens.refreshToken, 10)
      await this.usersService.updateRefreshToken(user._id.toString(), hashed)

      return tokens
    } catch {
      throw new UnauthorizedException('Session expirée')
    }
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.updateRefreshToken(userId, null)
  }

  async acceptInvitation(token: string, firstName: string, lastName: string, password: string) {
    const user = await this.usersService.acceptInvitation(token, firstName, lastName, password)
    const tokens = await this.generateTokens(user)
    const hashed = await bcrypt.hash(tokens.refreshToken, 10)
    await this.usersService.updateRefreshToken(user._id.toString(), hashed)
    return { user: this.sanitize(user), ...tokens }
  }

  async setupSuperAdmin(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    setupKey: string,
  ) {
    const expected = this.config.get<string>('SETUP_KEY', '')
    if (!expected || setupKey !== expected) throw new ForbiddenException('Clé de setup invalide')

    const user = await this.usersService.createSuperAdmin(email, password, firstName, lastName)
    const tokens = await this.generateTokens(user)
    const hashed = await bcrypt.hash(tokens.refreshToken, 10)
    await this.usersService.updateRefreshToken(user._id.toString(), hashed)
    return { user: this.sanitize(user), ...tokens }
  }

  private async generateTokens(user: UserDocument) {
    const payload = { sub: user._id.toString(), email: user.email }
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_SECRET'),
        expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      }),
    ])
    return { accessToken, refreshToken }
  }

  private sanitize(user: UserDocument) {
    const obj = user.toObject()
    delete obj.password
    delete obj.refreshToken
    return obj
  }
}
