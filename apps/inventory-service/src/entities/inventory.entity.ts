import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('inventory_items')
export class InventoryItemEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  merchantId!: string; // e.g. "STORE-01"

  @Column({ type: 'varchar', length: 100 })
  ingredientId!: string; // e.g. "ING-01"

  @Column({ type: 'varchar', length: 255 })
  name!: string; // e.g. "Beef Patty 100g"

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  currentStock!: number; // e.g. 50 units

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 10 })
  reorderThreshold!: number; // e.g. Alert when stock <= 10

  @Column({ type: 'varchar', length: 50, default: 'pcs' })
  unit!: string; // "pcs", "kg", "liters"

  @Column({ type: 'boolean', default: false })
  isLowStock!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  recipeMappings!: Array<{
    externalItemId: string; // e.g. "ITEM-101" (Cheeseburger)
    quantityRequired: number; // e.g. 1 patty per burger
  }>;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
