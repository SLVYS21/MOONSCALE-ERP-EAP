import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'
import { CategoriesController, FinancesController } from './finances.controller'
import { FinancesService } from './finances.service'
import { Category, CategorySchema } from './schemas/category.schema'
import { Transaction, TransactionSchema } from './schemas/transaction.schema'

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Category.name, schema: CategorySchema },
      { name: Transaction.name, schema: TransactionSchema },
    ]),
  ],
  controllers: [CategoriesController, FinancesController],
  providers: [FinancesService],
  exports: [FinancesService],
})
export class FinancesModule {}
