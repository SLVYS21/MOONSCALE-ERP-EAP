import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { AppSettings, AppSettingsSchema } from './app-settings.schema'
import { AppSettingsService } from './app-settings.service'
import { AppSettingsController } from './app-settings.controller'

@Module({
  imports: [MongooseModule.forFeature([{ name: AppSettings.name, schema: AppSettingsSchema }])],
  controllers: [AppSettingsController],
  providers: [AppSettingsService],
  exports: [AppSettingsService],
})
export class AppSettingsModule {}
