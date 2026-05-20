import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { WikiController } from './wiki.controller'
import { WikiService } from './wiki.service'
import { WikiPage, WikiPageSchema } from './schemas/wiki-page.schema'

@Module({
  imports: [MongooseModule.forFeature([{ name: WikiPage.name, schema: WikiPageSchema }])],
  controllers: [WikiController],
  providers: [WikiService],
})
export class WikiModule {}
