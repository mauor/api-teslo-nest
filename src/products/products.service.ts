import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product, ProductImage } from './entities';
import { PaginationDto } from 'src/common/dtos/pagination.dto';

import { validate as isUUID } from 'uuid'; 

@Injectable()
export class ProductsService {

  private readonly logger = new Logger('Product Service');

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductImage)
    private readonly productImgRepository: Repository<ProductImage>,

    private readonly dataSource: DataSource,
  ){}

  async create(createProductDto: CreateProductDto) {
    try{
      const { images = [], ...productDetails } = createProductDto;
      const product = this.productRepository.create({
        ...productDetails, 
        images: images.map( image => this.productImgRepository.create( {url: image} ))
      });
      await this.productRepository.save(product);
      return {...product, images};
    }
    catch(error){
      this.handleExceptionsDB(error);
    }
  }

  async findAll(paginationDto: PaginationDto) {
    const { limit = 10, offset = 0 } = paginationDto;
    const products = await this.productRepository.find({
      skip: offset, 
      take: limit,
      relations: { 
        images: true
      }
    });
    return products.map( (products) => ({
      ...products,
      images: products.images.map( img => img.url)
    }));
  }

  async findOne(term: string) {
    let product: Product;
    
    if( isUUID(term) ){
      product = await this.productRepository.findOneBy( {id: term} );
    }
    else{
      const queryBuilder = await this.productRepository.createQueryBuilder('prod');
      product = await queryBuilder
        .where(`UPPER(title) = :title or slug = :slug`, {
          title: term.toLocaleUpperCase(), 
          slug: term.toLocaleLowerCase()
        })
        .leftJoinAndSelect('prod.images', 'prodImg')
        .getOne();
    }

    if(!product) throw new NotFoundException(`Product with term: "${ term }" not found`);

    return product;
  }

  async findOnePlain(term: string){
    const {images = [], ...rest} = await this.findOne(term);
    return {
      ...rest,
      images: images.map(image => image.url)
    }
  }

  async update(id: string, updateProductDto: UpdateProductDto) {

    const { images, ...toUpdate } = updateProductDto;


    const product = await this.productRepository.preload({
      id,
      ...toUpdate
    })

    if( !product ) throw new NotFoundException(`Product with id: "${ id }" not found`);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();


    try{
      if( images ){
        await queryRunner.manager.delete( ProductImage, { product: {id} })

        product.images = images.map(image => this.productImgRepository.create({url: image}))
      }
      else{

      }
      await queryRunner.manager.save( product );
      await queryRunner.commitTransaction();
      await queryRunner.release();
      // await this.productRepository.save(product);
      return this.findOnePlain( id ); 
    }
    catch(error){
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      this.handleExceptionsDB(error);
    }

  }

  async remove(id: string) {
    const product = await this.findOne(id);
    if( !product ) throw new BadRequestException(`Product with id "${id}" not found`);
    try{
      await this.productRepository.remove( product );
      return;
    }
    catch(error){
      this.handleExceptionsDB(error);
    }
  }

  private handleExceptionsDB(error: any){
    if(error.code === '23505') throw new BadRequestException(error.detail);
    console.log(error.code)
    this.logger.error(error);
    throw new InternalServerErrorException('Unexpexted error, check server logs');
  }

  async deleteAllProducts(){
    const query = this.productRepository.createQueryBuilder('product');

    try{
      return await query.delete().where({}).execute();
    }
    catch(error){
      this.handleExceptionsDB(error);
    }
  }
}
