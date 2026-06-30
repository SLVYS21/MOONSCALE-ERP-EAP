import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Client as MinioClient } from 'minio'
import { randomUUID } from 'crypto'

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name)
  private client!: MinioClient
  private bucket = 'deozen'

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get<string>('MINIO_ENDPOINT', 'localhost')
    const port = parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10)
    const useSSL = this.config.get<string>('MINIO_USE_SSL', 'false') === 'true'
    const accessKey = this.config.get<string>('MINIO_ACCESS_KEY', '')
    const secretKey = this.config.get<string>('MINIO_SECRET_KEY', '')
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'deozen')

    this.client = new MinioClient({ endPoint: endpoint, port, useSSL, accessKey, secretKey })
    this.logger.log(`MinIO client → ${useSSL ? 'https' : 'http'}://${endpoint}:${port} (bucket: ${this.bucket})`)
  }

  async putVocal(buffer: Buffer, mimeType: string): Promise<{ key: string; size: number }> {
    const ext = mimeToExt(mimeType)
    const key = `typebot-vocals/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${ext}`
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
    })
    return { key, size: buffer.length }
  }

  async getStream(key: string) {
    return this.client.getObject(this.bucket, key)
  }

  async statObject(key: string) {
    return this.client.statObject(this.bucket, key)
  }
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/ogg; codecs=opus': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
  }
  return map[mime.toLowerCase()] ?? 'bin'
}
