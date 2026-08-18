import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('pos_sync_logs')
export class PosSyncLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  merchantId!: string; // e.g. "Pinaka_013"

  @Column({ type: 'varchar', length: 100 })
  externalOrderId!: string;

  @Column({ type: 'varchar', length: 100, default: 'WOOCOMMERCE_REST' })
  posSystemType!: string;

  @Column({ type: 'varchar', length: 100 })
  status!: string; // "SYNCED_TO_POS", "FAILED", "ACKNOWLEDGED_BY_POS"

  @Column({ type: 'varchar', length: 255, nullable: true })
  posTargetUrl!: string; // "https://merchantrestaurant.alektasolutions.com/"

  @Column({ type: 'jsonb', nullable: true })
  payload!: any;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
