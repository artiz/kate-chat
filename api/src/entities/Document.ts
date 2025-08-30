import {
  Entity,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
  ManyToOne,
  Index,
  OneToMany,
} from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { User } from "./User";
import { DocumentStatus } from "../types/ai.types";
import { ChatDocument } from "./ChatDocument";

@ObjectType()
@Entity("documents")
export class Document {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column()
  @Index({ fulltext: true })
  // original file name
  fileName: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  mime?: string;

  @Field()
  @Column({ type: "bigint", default: 0 })
  fileSize: number;

  @Field()
  @Column()
  @Index()
  // SHA-256 checksum
  sha256checksum: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  // S3 key for the uploaded document
  s3key?: string;

  @Field(() => User)
  @ManyToOne(() => User)
  owner: User;

  @Field()
  @Column({ foreignKeyConstraintName: "FK_documents_owner" })
  ownerId: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  // `modelId` from models but not `id`
  embeddingsModelId?: string;

  @Field({ nullable: true })
  @Column({ nullable: true })
  // `modelId` from models but not `id`
  summaryModelId?: string;

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
  @Column({ nullable: true })
  statusInfo?: string;

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

  @OneToMany(() => ChatDocument, chatDocument => chatDocument.document)
  chatDocuments: ChatDocument[];

  @Field({ nullable: true })
  downloadUrl?: string;
}
