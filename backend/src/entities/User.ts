import {
  Entity,
  ObjectIdColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
  PrimaryGeneratedColumn,
} from "typeorm";
import { AuthProvider } from "../types/ai.types";
import { Field, ID, ObjectType } from "type-graphql";

@ObjectType()
@Entity("users")
export class User {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Field()
  @Column()
  firstName: string;

  @Field()
  @Column()
  lastName: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  defaultModelId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  defaultSystemPrompt?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  msalId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  googleId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  githubId?: string;

  @Field(() => String, { nullable: true })
  @Column({ nullable: true, type: "varchar" })
  authProvider?: AuthProvider;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
