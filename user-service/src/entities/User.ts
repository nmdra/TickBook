import {
  Column,
  CreateDateColumn,
  Entity,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Profile } from './Profile';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn({ name: 'id' })
  id!: number;

  @Column({ name: 'email', type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ name: 'password', type: 'varchar', length: 255, select: false })
  password!: string;

  @Column({ name: 'role', type: 'varchar', length: 50, default: 'user' })
  role!: string;

  @Column({ name: 'refresh_token', type: 'varchar', length: 255, nullable: true, select: false })
  refreshToken!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;

  @OneToOne(() => Profile, (profile) => profile.user, {
    cascade: true,
  })
  profile!: Profile;
}
