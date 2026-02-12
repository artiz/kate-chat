import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, Index, JoinColumn } from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { EmbeddingTransformer } from "../utils/db";
import { Document } from "./Document";
import { DB_TYPE } from "../config/env";

export const EMBEDDINGS_DIMENSIONS = DB_TYPE === "mssql" ? 1998 : 3072;
const VECTOR_TYPE = DB_TYPE !== "sqlite" ? "vector" : "text";
const VECTOR_LENGTH = DB_TYPE !== "sqlite" ? EMBEDDINGS_DIMENSIONS : undefined;

@ObjectType()
@Entity("document_chunks")
export class DocumentChunk {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field(() => Document)
  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "documentId" })
  document: Document;

  @Field()
  @Column()
  @Index()
  documentId: string;

  @Field()
  @Column()
  modelId: string; // AI model ID, that was used to generate embeddings

  @Field({ nullable: true })
  documentName?: string;

  // 0 - document without pages
  @Field()
  @Column({ type: "int", default: 0 })
  page: number;

  @Field()
  @Column({ type: "bigint", default: 0 })
  pageIndex: number;

  @Field()
  @Column({ type: "text" })
  content: string;

  @Field(() => [Number], { nullable: true })
  @Column({
    type: VECTOR_TYPE,
    length: VECTOR_LENGTH,
    nullable: true,
    transformer: EmbeddingTransformer(EMBEDDINGS_DIMENSIONS),
  })
  embedding?: number[];
}
