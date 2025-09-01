import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Index, Column } from "typeorm";
import { Field, ID, ObjectType } from "type-graphql";
import { Chat } from "./Chat";
import { Document } from "./Document";

@ObjectType()
@Entity("chat_documents")
export class ChatDocument {
  @Field(() => ID)
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Field(() => Chat)
  @ManyToOne(() => Chat, { onDelete: "CASCADE" })
  @JoinColumn({ name: "chatId" })
  chat: Chat;

  @Field()
  @Column({ foreignKeyConstraintName: "FK_chat_documents_chat" })
  @Index()
  chatId: string;

  @Field(() => Document)
  @ManyToOne(() => Document, { onDelete: "CASCADE" })
  @JoinColumn({ name: "documentId" })
  document: Document;

  @Field()
  @Column({ foreignKeyConstraintName: "FK_chat_documents_document" })
  @Index()
  documentId: string;
}
