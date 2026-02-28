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
import { JSONTransformer } from "../utils/db";
import { User } from "./User";
import { DB_TYPE } from "../config/env";
import { DocumentStatus } from "../types/api";
import { ChatDocument } from "./ChatDocument";

const JSON_COLUMN_TYPE = DB_TYPE == "mssql" ? "ntext" : "json";

@ObjectType()
export class DocumentMetadata {
  @Field({ nullable: true })
  pagesCount?: number;
  @Field({ nullable: true })
  parsingStartedAt?: number; // ns
  @Field({ nullable: true })
  parsingEndedAt?: number; // ns
  @Field({ nullable: true })
  parsingPagePerSecond?: number;
  @Field({ nullable: true })
  chunkingStartedAt?: number; // ns
  @Field({ nullable: true })
  chunkingEndedAt?: number; // ns
  @Field({ nullable: true })
  chunkingPagePerSecond?: number;
  @Field({ nullable: true })
  batchingStartedAt?: number;
  @Field({ nullable: true })
  batchingEndedAt?: number;
  @Field({ nullable: true })
  batchingPagePerSecond?: number;
  @Field({ nullable: true })
  embeddingStartedAt?: number;
  @Field({ nullable: true })
  embeddingEndedAt?: number;
  @Field({ nullable: true })
  embeddingPagePerSecond?: number;
  @Field({ nullable: true })
  summarizationStartedAt?: number;
  @Field({ nullable: true })
  summarizationEndedAt?: number;
}

@ObjectType()
@Entity("documents")
export class Document {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field()
  @Column({ length: 4000 })
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
  @Column({ nullable: true, length: 4000 })
  // S3 key for the uploaded document
  s3key?: string;

  @Field(() => User)
  @ManyToOne(() => User)
  owner: User;

  @Field()
  @Column()
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
  @Column({ type: "text", nullable: true })
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
  @Column({ type: "text", nullable: true })
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

  @Field(() => DocumentMetadata, { nullable: true })
  @Column({ type: JSON_COLUMN_TYPE, nullable: true, transformer: JSONTransformer<DocumentMetadata>(), default: null })
  metadata?: DocumentMetadata;

  @OneToMany(() => ChatDocument, chatDocument => chatDocument.document)
  chatDocuments: ChatDocument[];

  @Field(() => String, { nullable: true })
  downloadUrl?: string;

  @Field(() => String, { nullable: true })
  downloadUrlMarkdown?: string;
}
