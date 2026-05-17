import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Project, ProjectDocument } from './schemas/project.schema'
import { Task, TaskDocument } from './schemas/task.schema'

const USER_SELECT = 'firstName lastName email _id'

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(Project.name) private projectModel: Model<ProjectDocument>,
    @InjectModel(Task.name) private taskModel: Model<TaskDocument>,
  ) {}

  // ── Projects ──────────────────────────────────────────────────────────────

  async listProjects(filters: { search?: string; status?: string } = {}) {
    const query: Record<string, unknown> = {}
    if (filters.status) query.status = filters.status
    if (filters.search) {
      query.$or = [
        { title: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ]
    }

    const projects = await this.projectModel
      .find(query)
      .populate('createdBy', USER_SELECT)
      .populate('memberIds', USER_SELECT)
      .sort({ createdAt: -1 })
      .lean()

    // Attach task counts
    const ids = projects.map((p) => p._id)
    const [totalCounts, doneCounts] = await Promise.all([
      this.taskModel.aggregate([
        { $match: { projectId: { $in: ids } } },
        { $group: { _id: '$projectId', count: { $sum: 1 } } },
      ]),
      this.taskModel.aggregate([
        { $match: { projectId: { $in: ids }, status: 'done' } },
        { $group: { _id: '$projectId', count: { $sum: 1 } } },
      ]),
    ])

    const totalMap = new Map(totalCounts.map((r) => [r._id.toString(), r.count]))
    const doneMap = new Map(doneCounts.map((r) => [r._id.toString(), r.count]))

    return projects.map((p) => ({
      ...p,
      taskCount: totalMap.get(p._id.toString()) ?? 0,
      completedCount: doneMap.get(p._id.toString()) ?? 0,
    }))
  }

  async getProject(id: string) {
    const project = await this.projectModel
      .findById(id)
      .populate('createdBy', USER_SELECT)
      .populate('memberIds', USER_SELECT)
      .lean()
    if (!project) throw new NotFoundException('Projet introuvable')
    return project
  }

  async getProjectWithTasks(id: string) {
    const [project, tasks] = await Promise.all([
      this.getProject(id),
      this.taskModel
        .find({ projectId: new Types.ObjectId(id) })
        .populate('assignedTo', USER_SELECT)
        .populate('createdBy', USER_SELECT)
        .sort({ order: 1, createdAt: 1 })
        .lean(),
    ])

    const columns: Record<string, typeof tasks> = {
      backlog: [],
      todo: [],
      in_progress: [],
      review: [],
      done: [],
    }
    for (const t of tasks) {
      if (columns[t.status]) columns[t.status].push(t)
    }

    return { project, columns }
  }

  async createProject(data: {
    title: string
    description?: string
    color?: string
    icon?: string
    deadline?: string
    memberIds?: string[]
    createdById: string
  }) {
    return this.projectModel.create({
      title: data.title,
      description: data.description ?? '',
      color: data.color ?? '#6366f1',
      icon: data.icon ?? '📁',
      deadline: data.deadline ? new Date(data.deadline) : null,
      memberIds: (data.memberIds ?? []).map((id) => new Types.ObjectId(id)),
      createdBy: new Types.ObjectId(data.createdById),
    })
  }

  async updateProject(id: string, data: Partial<{
    title: string
    description: string
    color: string
    icon: string
    status: string
    deadline: string | null
    memberIds: string[]
  }>) {
    const project = await this.projectModel.findById(id)
    if (!project) throw new NotFoundException('Projet introuvable')

    if (data.title !== undefined) project.title = data.title
    if (data.description !== undefined) project.description = data.description
    if (data.color !== undefined) project.color = data.color
    if (data.icon !== undefined) project.icon = data.icon
    if (data.status !== undefined) project.status = data.status
    if (data.deadline !== undefined) {
      project.deadline = data.deadline ? new Date(data.deadline) : null
    }
    if (data.memberIds !== undefined) {
      project.memberIds = data.memberIds.map((id) => new Types.ObjectId(id))
    }

    return project.save()
  }

  async deleteProject(id: string) {
    const project = await this.projectModel.findById(id)
    if (!project) throw new NotFoundException('Projet introuvable')
    await Promise.all([
      this.projectModel.deleteOne({ _id: id }),
      this.taskModel.deleteMany({ projectId: new Types.ObjectId(id) }),
    ])
    return { deleted: true }
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(filters: {
    projectId?: string
    status?: string
    assignedTo?: string
    priority?: string
    search?: string
    page?: number
    limit?: number
  }) {
    const { page = 1, limit = 25 } = filters
    const query: Record<string, unknown> = {}

    if (filters.projectId) query.projectId = new Types.ObjectId(filters.projectId)
    if (filters.status) query.status = filters.status
    if (filters.assignedTo) query.assignedTo = new Types.ObjectId(filters.assignedTo)
    if (filters.priority) query.priority = filters.priority
    if (filters.search) {
      query.$or = [
        { title: { $regex: filters.search, $options: 'i' } },
        { description: { $regex: filters.search, $options: 'i' } },
      ]
    }

    const [data, total] = await Promise.all([
      this.taskModel
        .find(query)
        .populate('assignedTo', USER_SELECT)
        .populate('createdBy', USER_SELECT)
        .sort({ order: 1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.taskModel.countDocuments(query),
    ])

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getTask(id: string) {
    const task = await this.taskModel
      .findById(id)
      .populate('assignedTo', USER_SELECT)
      .populate('createdBy', USER_SELECT)
      .lean()
    if (!task) throw new NotFoundException('Tâche introuvable')
    return task
  }

  async createTask(data: {
    title: string
    description?: string
    projectId?: string | null
    status?: string
    priority?: string
    assignedTo?: string | null
    dueDate?: string | null
    tags?: string[]
    createdById: string
  }) {
    const order = await this.taskModel.countDocuments({
      projectId: data.projectId ? new Types.ObjectId(data.projectId) : null,
      status: data.status ?? 'todo',
    })

    return this.taskModel.create({
      title: data.title,
      description: data.description ?? '',
      projectId: data.projectId ? new Types.ObjectId(data.projectId) : null,
      status: data.status ?? 'todo',
      priority: data.priority ?? 'medium',
      assignedTo: data.assignedTo ? new Types.ObjectId(data.assignedTo) : null,
      dueDate: data.dueDate ? new Date(data.dueDate) : null,
      tags: data.tags ?? [],
      createdBy: new Types.ObjectId(data.createdById),
      order,
    })
  }

  async updateTask(
    id: string,
    data: Partial<{
      title: string
      description: string
      status: string
      priority: string
      assignedTo: string | null
      dueDate: string | null
      tags: string[]
      order: number
    }>,
    userId: string,
  ) {
    const task = await this.taskModel.findById(id)
    if (!task) throw new NotFoundException('Tâche introuvable')

    if (data.title !== undefined) task.title = data.title
    if (data.description !== undefined) task.description = data.description
    if (data.status !== undefined) task.status = data.status
    if (data.priority !== undefined) task.priority = data.priority
    if (data.assignedTo !== undefined) {
      task.assignedTo = data.assignedTo ? new Types.ObjectId(data.assignedTo) : null
    }
    if (data.dueDate !== undefined) {
      task.dueDate = data.dueDate ? new Date(data.dueDate) : null
    }
    if (data.tags !== undefined) task.tags = data.tags
    if (data.order !== undefined) task.order = data.order

    return task.save()
  }

  async deleteTask(id: string, userId: string) {
    const task = await this.taskModel.findById(id)
    if (!task) throw new NotFoundException('Tâche introuvable')

    const isCreator = task.createdBy.toString() === userId
    if (!isCreator) {
      // Caller should have verified admin role via guard before calling this
    }

    await this.taskModel.deleteOne({ _id: id })
    return { deleted: true }
  }

  async addComment(taskId: string, text: string, authorId: string) {
    const task = await this.taskModel.findById(taskId)
    if (!task) throw new NotFoundException('Tâche introuvable')

    task.comments.push({
      text,
      authorId: new Types.ObjectId(authorId),
      createdAt: new Date(),
    })
    return task.save()
  }

  async toggleChecklistItem(taskId: string, itemIndex: number) {
    const task = await this.taskModel.findById(taskId)
    if (!task) throw new NotFoundException('Tâche introuvable')
    if (!task.checklist[itemIndex]) throw new NotFoundException('Item introuvable')

    task.checklist[itemIndex].done = !task.checklist[itemIndex].done
    return task.save()
  }

  async addChecklistItem(taskId: string, text: string) {
    const task = await this.taskModel.findById(taskId)
    if (!task) throw new NotFoundException('Tâche introuvable')
    task.checklist.push({ text, done: false })
    return task.save()
  }

  // ── Stats / KPIs ──────────────────────────────────────────────────────────

  async getStats() {
    const now = new Date()

    const [byStatusRaw, overdueCount, memberStatsRaw] = await Promise.all([
      this.taskModel.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      this.taskModel.countDocuments({
        dueDate: { $lt: now },
        status: { $nin: ['done'] },
      }),
      this.taskModel.aggregate([
        {
          $group: {
            _id: '$assignedTo',
            total: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'done'] }, 1, 0] } },
            inProgress: { $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] } },
            overdue: {
              $sum: {
                $cond: [
                  { $and: [{ $lt: ['$dueDate', now] }, { $ne: ['$status', 'done'] }, { $ne: ['$dueDate', null] }] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $match: { _id: { $ne: null } } },
      ]),
    ])

    const byStatus: Record<string, number> = {
      backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0,
    }
    for (const r of byStatusRaw) {
      byStatus[r._id as string] = r.count
    }

    const total = Object.values(byStatus).reduce((a, b) => a + b, 0)

    // Populate user info
    const userIds = memberStatsRaw.map((r) => r._id).filter(Boolean)
    const users = userIds.length
      ? await (this.taskModel.db as unknown as { model: (name: string) => Model<{ _id: Types.ObjectId; firstName: string; lastName: string; email: string }> })
          .model('User')
          .find({ _id: { $in: userIds } })
          .select(USER_SELECT)
          .lean()
      : []

    const userMap = new Map(users.map((u) => [u._id.toString(), u]))

    const byMember = memberStatsRaw.map((r) => ({
      user: userMap.get(r._id?.toString() ?? '') ?? null,
      total: r.total,
      completed: r.completed,
      inProgress: r.inProgress,
      overdue: r.overdue,
    }))

    return { total, byStatus, overdue: overdueCount, byMember }
  }
}
