import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'
import * as bcrypt from 'bcryptjs'
import { User, UserDocument, ADMIN_PERMISSIONS, DEFAULT_PERMISSIONS } from './schemas/user.schema'
import { Invitation, InvitationDocument } from './schemas/invitation.schema'
import { InviteUserDto } from './dto/invite-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { MailService } from '../mail/mail.service'

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Invitation.name) private invitationModel: Model<InvitationDocument>,
    private mailService: MailService,
  ) {}

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().select('-password -refreshToken').sort({ createdAt: -1 })
  }

  async findById(id: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id).select('-password -refreshToken')
    if (!user) throw new NotFoundException('Utilisateur introuvable')
    return user
  }

  async findByEmail(email: string, withPassword = false): Promise<UserDocument | null> {
    const q = this.userModel.findOne({ email: email.toLowerCase() })
    if (withPassword) q.select('+password')
    return q
  }

  async invite(dto: InviteUserDto, invitedById: string, frontendUrl: string): Promise<void> {
    const existing = await this.userModel.findOne({ email: dto.email.toLowerCase() })
    if (existing) throw new ConflictException('Cet email est déjà utilisé')

    const pendingInvite = await this.invitationModel.findOne({
      email: dto.email.toLowerCase(),
      used: false,
      expiresAt: { $gt: new Date() },
    })
    if (pendingInvite) throw new ConflictException('Une invitation est déjà en attente pour cet email')

    const token = uuidv4()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await this.invitationModel.create({
      email: dto.email.toLowerCase(),
      token,
      role: dto.role,
      invitedBy: invitedById,
      expiresAt,
    })

    const link = `${frontendUrl}/invite?token=${token}`
    await this.mailService.sendInvitation(dto.email, link)
  }

  async acceptInvitation(
    token: string,
    firstName: string,
    lastName: string,
    password: string,
  ): Promise<UserDocument> {
    const invitation = await this.invitationModel.findOne({
      token,
      used: false,
      expiresAt: { $gt: new Date() },
    })
    if (!invitation) throw new ForbiddenException('Invitation invalide ou expirée')

    const existing = await this.userModel.findOne({ email: invitation.email })
    if (existing) throw new ConflictException('Un compte existe déjà avec cet email')

    const hashed = await bcrypt.hash(password, 12)
    const user = await this.userModel.create({
      email: invitation.email,
      firstName,
      lastName,
      password: hashed,
      role: invitation.role,
      permissions: invitation.role === 'admin' ? ADMIN_PERMISSIONS : DEFAULT_PERMISSIONS,
      isActive: true,
      invitedBy: invitation.invitedBy,
    })

    invitation.used = true
    await invitation.save()

    return user
  }

  async updateUser(id: string, dto: UpdateUserDto, requesterId: string, requesterRole: string): Promise<UserDocument> {
    const user = await this.userModel.findById(id)
    if (!user) throw new NotFoundException('Utilisateur introuvable')
    if (user.role === 'superadmin' && requesterRole !== 'superadmin') {
      throw new ForbiddenException('Impossible de modifier un superadmin')
    }

    if (dto.firstName !== undefined) user.firstName = dto.firstName
    if (dto.lastName !== undefined) user.lastName = dto.lastName
    if (dto.role !== undefined && requesterRole === 'superadmin') user.role = dto.role
    if (dto.permissions !== undefined) {
      user.permissions = { ...user.permissions, ...dto.permissions }
    }

    return user.save()
  }

  async deactivateUser(id: string): Promise<void> {
    const user = await this.userModel.findById(id)
    if (!user) throw new NotFoundException('Utilisateur introuvable')
    if (user.role === 'superadmin') throw new ForbiddenException('Impossible de désactiver le superadmin')
    user.isActive = false
    user.refreshToken = null
    await user.save()
  }

  async updateRefreshToken(userId: string, token: string | null): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { refreshToken: token })
  }

  async updateLastActivity(userId: string): Promise<void> {
    await this.userModel.findByIdAndUpdate(userId, { lastActivity: new Date() })
  }

  async listInvitations(): Promise<object[]> {
    const invitations = await this.invitationModel
      .find()
      .populate('invitedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })

    const now = new Date()
    return invitations.map((inv) => {
      let status: 'pending' | 'accepted' | 'expired'
      if (inv.used) status = 'accepted'
      else if (inv.expiresAt < now) status = 'expired'
      else status = 'pending'
      return { ...inv.toObject(), status }
    })
  }

  async createSuperAdmin(email: string, password: string, firstName: string, lastName: string): Promise<UserDocument> {
    const existing = await this.userModel.findOne({ role: 'superadmin' })
    if (existing) throw new ConflictException('Un superadmin existe déjà')

    const hashed = await bcrypt.hash(password, 12)
    return this.userModel.create({
      email,
      password: hashed,
      firstName,
      lastName,
      role: 'superadmin',
      isActive: true,
      permissions: {
        students: { view: true, edit: true, delete: true },
        finances: { view: true, edit: true },
        automations: { view: true, edit: true },
        forms: { view: true, edit: true },
        team: { view: true, manage: true },
      },
    })
  }
}
