import { ObjectType, Field } from "type-graphql";

export interface RagInputChunk {
  id: string;
  page: number;
  content: string;
}

export interface RagRequest {
  systemPrompt: string;
  userInput: string;
}

@ObjectType()
export class RagResponse {
  @Field({ nullable: true })
  step_by_step_analysis?: string;

  @Field({ nullable: true })
  reasoning_summary?: string;

  @Field({ nullable: true })
  final_answer?: string;

  @Field(() => [String], { nullable: true })
  relevant_chunks_ids?: string[];

  @Field(() => [Number], { nullable: true })
  chunks_relevance?: number[];
}
