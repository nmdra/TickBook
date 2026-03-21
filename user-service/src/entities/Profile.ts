import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';

@Entity({ name: 'profiles' })
export class Profile {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'address', type: 'varchar', length: 255, nullable: true })
  address!: string | null;

  @Column({ name: 'phone_number', type: 'varchar', length: 50, nullable: true })
  phoneNumber!: string | null;

  @Column({ name: 'total_tickets_booked', type: 'integer', default: 0 })
  totalTicketsBooked!: number;

  @OneToOne(() => User, (user) => user.profile, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
