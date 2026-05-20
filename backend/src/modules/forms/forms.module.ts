import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { FormsController, PublicFormsController } from './forms.controller'
import { FormsService } from './forms.service'
import { Form, FormSchema } from './schemas/form.schema'
import { FormResponse, FormResponseSchema } from './schemas/form-response.schema'
import { CloudinaryModule } from '../cloudinary/cloudinary.module'
import { AutomationsModule } from '../automations/automations.module'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Form.name, schema: FormSchema },
      { name: FormResponse.name, schema: FormResponseSchema },
    ]),
    CloudinaryModule,
    AutomationsModule,
  ],
  controllers: [FormsController, PublicFormsController],
  providers: [FormsService],
})
export class FormsModule {}
