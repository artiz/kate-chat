import { Entity, ObjectIdColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn, JoinColumn } from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { User } from "./User";

@ObjectType()
@Entity("chats")
export class Chat {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid") 
  id: string;

  @Field()
  @Column()
  title: string;

  @Field()
  @Column({ default: "" })
  description: string;

  @Field(() => User)
  @ManyToOne(() => User)
  user: User;

  @Field()
  @Column({ default: true })
  isActive: boolean;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
