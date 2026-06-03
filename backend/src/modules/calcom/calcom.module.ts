import { Module } from '@nestjs/common'
import { CalComService } from './calcom.service'

@Module({
  providers: [CalComService],
  exports: [CalComService],
})
export class CalComModule {}
