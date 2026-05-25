import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CategoriesController, FinancesController } from './finances.controller'
import { FinancesService } from './finances.service'
import { Category, CategorySchema } from './schemas/category.schema'
import { Transaction, TransactionSchema } from './schemas/transaction.schema'
import { ProductMapping, ProductMappingSchema } from './schemas/product-mapping.schema'
import { Offer, OfferSchema } from '../offers/schemas/offer.schema'
import { Student, StudentSchema } from '../students/schemas/student.schema'
import { Lead, LeadSchema } from '../leads/schemas/lead.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Transaction.name, schema: TransactionSchema },
      { name: ProductMapping.name, schema: ProductMappingSchema },
      { name: Offer.name, schema: OfferSchema },
      { name: Student.name, schema: StudentSchema },
      { name: Lead.name, schema: LeadSchema },
    ]),
  ],
  controllers: [CategoriesController, FinancesController],
  providers: [FinancesService],
  exports: [FinancesService],
})
export class FinancesModule {}
