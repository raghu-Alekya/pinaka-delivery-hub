import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AggregatorWebhookStatus = 'RECEIVED' | 'SUCCESS' | 'FAILED';

@Entity('aggregator_webhooks')
export class AggregatorWebhookEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  storeId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  restaurantId!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'RECEIVED' })
  status!: AggregatorWebhookStatus;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
