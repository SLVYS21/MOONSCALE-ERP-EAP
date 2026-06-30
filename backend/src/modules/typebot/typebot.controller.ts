import {
  BadRequestException,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'
import { readFileSync } from 'fs'
import { join } from 'path'
import { MinioService } from './minio.service'

const MAX_VOCAL_BYTES = 25 * 1024 * 1024 // 25 MB

@Controller('typebot')
export class TypebotController {
  private readonly logger = new Logger(TypebotController.name)
  private recorderHtml?: string

  constructor(
    private readonly minio: MinioService,
    private readonly config: ConfigService,
  ) {}

  @Get('recorder')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "frame-ancestors 'self' https://type.ecomafricapro.com")
  serveRecorder(): string {
    if (!this.recorderHtml) {
      this.recorderHtml = readFileSync(join(__dirname, 'recorder.html'), 'utf8')
    }
    return this.recorderHtml
  }

  @Post('vocal/upload')
  @UseInterceptors(FileInterceptor('vocal', { limits: { fileSize: MAX_VOCAL_BYTES } }))
  async uploadVocal(@UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Aucun fichier vocal reçu')
    if (!file.mimetype.startsWith('audio/')) {
      throw new BadRequestException(`Type de fichier invalide: ${file.mimetype}`)
    }
    const { key, size } = await this.minio.putVocal(file.buffer, file.mimetype)
    const publicBase = this.config.get<string>('BACKEND_PUBLIC_URL', 'http://localhost:3001')
    const urlPath = key.split('/').map(encodeURIComponent).join('/')
    const url = `${publicBase.replace(/\/$/, '')}/api/typebot/vocal/${urlPath}`
    this.logger.log(`Vocal stocké → ${key} (${size} bytes)`)
    return { url, key, size }
  }

  @Get('vocal/*key')
  async streamVocal(@Param('key') keySegments: string | string[], @Res() res: Response) {
    const key = Array.isArray(keySegments) ? keySegments.join('/') : keySegments
    try {
      const stat = await this.minio.statObject(key)
      const stream = await this.minio.getStream(key)
      res.setHeader('Content-Type', stat.metaData['content-type'] ?? 'audio/webm')
      res.setHeader('Content-Length', String(stat.size))
      res.setHeader('Cache-Control', 'private, max-age=3600')
      stream.pipe(res)
    } catch {
      throw new NotFoundException('Vocal introuvable')
    }
  }

  @Get('health')
  @HttpCode(200)
  health() {
    return { ok: true }
  }
}
