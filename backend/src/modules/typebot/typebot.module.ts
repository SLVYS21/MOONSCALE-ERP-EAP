import { Module } from '@nestjs/common'
import { TypebotController } from './typebot.controller'
import { MinioService } from './minio.service'

@Module({
  controllers: [TypebotController],
  providers: [MinioService],
  exports: [MinioService],
})
export class TypebotModule {}
