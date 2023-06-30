import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { SeedController } from './seed.controller';
import { ProductsService } from 'src/products/products.service';
import { ProductsModule } from 'src/products/products.module';

@Module({
  imports:[ ProductsModule ],
  controllers: [SeedController],
  providers: [SeedService]
})
export class SeedModule {}
