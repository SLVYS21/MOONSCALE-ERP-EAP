import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common'
import { TasksService } from './tasks.service'
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard'
import { RolesGuard } from '../../common/guards/roles.guard'
import { Roles } from '../../common/decorators/roles.decorator'
import { CurrentUser } from '../../common/decorators/current-user.decorator'
import { IsString, IsOptional, IsNumber, Min, IsIn, IsArray, IsDateString } from 'class-validator'
import { Type } from 'class-transformer'
import type { UserDocument } from '../users/schemas/user.schema'

// ── DTOs ─────────────────────────────────────────────────────────────────────

class CreateProjectDto {
  @IsString() title: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() color?: string
  @IsOptional() @IsString() icon?: string
  @IsOptional() @IsString() deadline?: string
  @IsOptional() @IsArray() memberIds?: string[]
}

class UpdateProjectDto {
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() color?: string
  @IsOptional() @IsString() icon?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() deadline?: string | null
  @IsOptional() @IsArray() memberIds?: string[]
}

class CreateTaskDto {
  @IsString() title: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsString() projectId?: string | null
  @IsOptional() @IsIn(['backlog', 'todo', 'in_progress', 'review', 'done']) status?: string
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string
  @IsOptional() @IsString() assignedTo?: string | null
  @IsOptional() @IsString() dueDate?: string | null
  @IsOptional() @IsArray() tags?: string[]
}

class UpdateTaskDto {
  @IsOptional() @IsString() title?: string
  @IsOptional() @IsString() description?: string
  @IsOptional() @IsIn(['backlog', 'todo', 'in_progress', 'review', 'done']) status?: string
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string
  @IsOptional() assignedTo?: string | null
  @IsOptional() dueDate?: string | null
  @IsOptional() @IsArray() tags?: string[]
  @IsOptional() @IsNumber() order?: number
}

class ListTasksQuery {
  @IsOptional() @IsString() projectId?: string
  @IsOptional() @IsString() status?: string
  @IsOptional() @IsString() assignedTo?: string
  @IsOptional() @IsString() priority?: string
  @IsOptional() @IsString() search?: string
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) page?: number
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) limit?: number
}

class ListProjectsQuery {
  @IsOptional() @IsString() search?: string
  @IsOptional() @IsString() status?: string
}

class AddCommentDto {
  @IsString() text: string
}

class AddChecklistItemDto {
  @IsString() text: string
}

// ── Controllers ───────────────────────────────────────────────────────────────

@Controller('projects')
@UseGuards(JwtAuthGuard)
export class ProjectsController {
  constructor(private tasksService: TasksService) {}

  @Get()
  listProjects(@Query() query: ListProjectsQuery) {
    return this.tasksService.listProjects(query)
  }

  @Get(':id/tasks')
  getProjectWithTasks(@Param('id') id: string) {
    return this.tasksService.getProjectWithTasks(id)
  }

  @Get(':id')
  getProject(@Param('id') id: string) {
    return this.tasksService.getProject(id)
  }

  @Post()
  createProject(@Body() dto: CreateProjectDto, @CurrentUser() user: UserDocument) {
    return this.tasksService.createProject({ ...dto, createdById: user._id.toString() })
  }

  @Patch(':id')
  updateProject(@Param('id') id: string, @Body() dto: UpdateProjectDto) {
    return this.tasksService.updateProject(id, dto)
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin')
  deleteProject(@Param('id') id: string) {
    return this.tasksService.deleteProject(id)
  }
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private tasksService: TasksService) {}

  // stats must be before :id to avoid route conflict
  @Get('stats')
  getStats() {
    return this.tasksService.getStats()
  }

  @Get()
  listTasks(@Query() query: ListTasksQuery) {
    return this.tasksService.listTasks(query)
  }

  @Get(':id')
  getTask(@Param('id') id: string) {
    return this.tasksService.getTask(id)
  }

  @Post()
  createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: UserDocument) {
    return this.tasksService.createTask({ ...dto, createdById: user._id.toString() })
  }

  @Patch(':id')
  updateTask(
    @Param('id') id: string,
    @Body() dto: UpdateTaskDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.tasksService.updateTask(id, dto, user._id.toString())
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  deleteTask(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    return this.tasksService.deleteTask(id, user._id.toString())
  }

  @Post(':id/comments')
  addComment(
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
    @CurrentUser() user: UserDocument,
  ) {
    return this.tasksService.addComment(id, dto.text, user._id.toString())
  }

  @Patch(':id/checklist/:index/toggle')
  @HttpCode(HttpStatus.OK)
  toggleChecklistItem(
    @Param('id') id: string,
    @Param('index') index: string,
  ) {
    return this.tasksService.toggleChecklistItem(id, Number(index))
  }

  @Post(':id/checklist')
  addChecklistItem(@Param('id') id: string, @Body() dto: AddChecklistItemDto) {
    return this.tasksService.addChecklistItem(id, dto.text)
  }
}
