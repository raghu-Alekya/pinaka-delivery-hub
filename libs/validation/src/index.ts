import { IsString, IsNumber, IsArray, IsNotEmpty, IsOptional, ValidateNested, IsEnum, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderStatus } from '@pinaka-delivery-hub/canonical-model';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

export class DoorDashItemDto {
  @IsString()
  @IsNotEmpty({ message: 'DoorDash item name is required' })
  name!: string;

  @IsNumber()
  @Min(1, { message: 'Item quantity must be at least 1' })
  qty!: number;

  @IsNumber()
  @Min(0, { message: 'Item price cannot be negative' })
  price!: number;
}

export class CreateDoorDashOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'DoorDash order_id is required' })
  order_id!: string;

  @IsString()
  @IsNotEmpty({ message: 'DoorDash store_id is required' })
  store_id!: string;

  @IsNumber()
  @Min(0, { message: 'Total price cannot be negative' })
  total!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DoorDashItemDto)
  items!: DoorDashItemDto[];
}

export class SwiggyItemDto {
  @IsString()
  @IsNotEmpty({ message: 'Swiggy item title is required' })
  title!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  price!: number;
}

export class SwiggyCartDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SwiggyItemDto)
  items!: SwiggyItemDto[];
}

export class CreateSwiggyOrderDto {
  @IsString()
  @IsNotEmpty({ message: 'swiggy_order_id is required' })
  swiggy_order_id!: string;

  @IsString()
  @IsNotEmpty({ message: 'restaurant_id is required' })
  restaurant_id!: string;

  @IsNumber()
  @Min(0)
  final_bill!: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => SwiggyCartDto)
  cart?: SwiggyCartDto;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus, { message: 'Invalid order status. Allowed values: CREATED, ACCEPTED, IN_KITCHEN, READY_FOR_PICKUP, OUT_FOR_DELIVERY, DELIVERED, CANCELLED' })
  status!: OrderStatus;
}
