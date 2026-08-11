import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('analytics_snapshots')
export class AnalyticsSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  merchantId!: string; // e.g. "STORE-01"

  @Column({ type: 'decimal', precision: 12, scale: 2, default: 0 })
  totalRevenue!: number; // e.g. 15450.75

  @Column({ type: 'integer', default: 0 })
  totalOrders!: number; // e.g. 320

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  averageOrderValue!: number; // AOV = totalRevenue / totalOrders

  @Column({ type: 'jsonb', nullable: true })
  platformBreakdown!: {
    DOORDASH: { revenue: number; orderCount: number };
    SWIGGY: { revenue: number; orderCount: number };
    UBER_EATS: { revenue: number; orderCount: number };
  };

  @Column({ type: 'jsonb', nullable: true })
  statusBreakdown!: {
    CREATED: number;
    ACCEPTED: number;
    READY_FOR_PICKUP: number;
    DELIVERED: number;
    CANCELLED: number;
  };

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
