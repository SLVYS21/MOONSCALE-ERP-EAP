import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'
import type { UserRole } from '../../modules/users/schemas/user.schema'

const ROLE_HIERARCHY: Record<UserRole, number> = {
  superadmin: 3,
  admin: 2,
  member: 1,
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!required?.length) return true

    const { user } = ctx.switchToHttp().getRequest()
    const userLevel = ROLE_HIERARCHY[user.role as UserRole] ?? 0
    const requiredLevel = Math.min(...required.map((r) => ROLE_HIERARCHY[r] ?? 99))

    if (userLevel < requiredLevel) {
      throw new ForbiddenException('Accès non autorisé')
    }
    return true
  }
}
