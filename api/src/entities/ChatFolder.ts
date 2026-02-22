import { Entity, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { User } from "./User";
import { DB_TYPE } from "../config/env";

@ObjectType()
@Entity("chat_folders")
export class ChatFolder {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  name: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  color?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: "CASCADE" })
  user?: User;

  @Field({ nullable: true })
  @Column({ nullable: true })
  parentId?: string;

  @ManyToOne(() => ChatFolder, { nullable: true, onDelete: DB_TYPE == "mssql" ? undefined : "CASCADE" })
  parent?: ChatFolder;

  @Field({ nullable: true })
  @Column({ nullable: true })
  topParentId?: string;

  @ManyToOne(() => ChatFolder, { nullable: true, onDelete: DB_TYPE == "mssql" ? undefined : "CASCADE" })
  topParent?: ChatFolder;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
