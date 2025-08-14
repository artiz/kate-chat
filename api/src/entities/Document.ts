import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn, ManyToOne } from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { User } from "./User";
import { DocumentStatus } from "@/types/ai.types";

@ObjectType()
@Entity("documents")
export class Document {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  // original file name
  fileName: string;

  @Field(() => User)
  @ManyToOne(() => User)
  owner: User;

  @Field()
  @Column()
  ownerId: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  // `modelId` from models but not `id`
  embeddingsModelId: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  // generated summary
  summary?: string;

  @Field()
  @Column({ type: "int", default: 0 })
  // 0 for documents without pages like HTML or images
  pagesCount: number;

  @Field()
  @Column({ default: DocumentStatus.UPLOAD })
  status: DocumentStatus;

  @Field({ nullable: true })
  @Column({ type: "float" })
  // 0 for documents without pages like HTML or images
  statusProgress?: number;

  @Field()
  @CreateDateColumn()
  createdAt: Date;

  @Field()
  @UpdateDateColumn()
  updatedAt: Date;
}
