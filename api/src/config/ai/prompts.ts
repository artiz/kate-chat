import { SearchResult } from "@/services/ai/tools/web_search";

export const DEFAULT_CHAT_PROMPT = `You a experienced software developer. 
Being asked about code examples please always comment tricky moments and generate most effective and secure code.
In case of formulas output always use MatJAX format.`;

export const WEB_SEARCH_TEST_QUERY = "Capital of France";

export const PROMPT_DOCUMENT_SUMMARY = ({ content }: { content: string }) =>
  `Please provide a comprehensive summary of the following document in up to 1024 words. 
    Return only summary, without any additional commentaries.
    Focus on the main topics, key findings, and important details:\n\n${content}`;

export const PROMPT_CHAT_TITLE = ({ question, answer }: { question: string; answer: string }) =>
  `Please provide a short title from 1 to 7 words for a chat based on the following question and answer.
    Question: ${question}
    Answer: ${answer}
    The title should be concise and capture the essence of the conversation and have a maximum of 7 words.`;

interface RagInputChunk {
  id: string;
  page: number;
  content: string;
}

export interface RagRequest {
  systemPrompt: string;
  userInput: string;
}

export interface RagResponse {
  step_by_step_analysis?: string;
  reasoning_summary?: string;
  final_answer?: string;
  relevant_chunks_ids?: string[];
  chunks_relevance?: number[];
}

// some info here: https://platform.openai.com/docs/guides/structured-outputs?type-restrictions=string-restrictions#examples
const RAG_RESPONSE_SCHEMA = {
  name: "rag_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      step_by_step_analysis: {
        type: "string",
        description: `
          Detailed step-by-step analysis of the answer with at least 5 steps and at least 150 words. 
          Pay special attention to the wording of the question to avoid being tricked. 
          Sometimes it seems that there is an answer in the context, but this is might be not the requested value, but only a similar one.
          If user asks for date and only a year information is available, provide the year in the final answer.`,
      },
      reasoning_summary: {
        type: "string",
        description: `Concise summary of the step-by-step reasoning process. Around 50 words.`,
        minLength: 1,
        maxLength: 100,
      },
      final_answer: {
        type: "string",
        description: `
          Final answer. 
          - If it is a company name, should be extracted exactly as it appears in question.
          - If it is a person name, it should be their full name.
          - If it is a product name, it should be extracted exactly as it appears in the context.
          - Answer without any extra information, words or comments.
          - Return 'N/A' if information is not available in the context`,
        minLength: 1,
      },
      relevant_chunks_ids: {
        type: "array",
        items: {
          type: "string",
        },
        description: `
          List of relevant chunks IDs containing information directly used to answer the question. 
          This ID must be loaded from input chunk "id".
          Include only:
            - Chunks with direct answers or explicit statements,
            - Chunks with key information that strongly supports the answer.
          Do not include chunks with only tangentially related information or weak connections to the answer. At least one chunk should be included in the list.`,
        minLength: 1,
      },
      chunks_relevance: {
        type: "array",
        items: {
          type: "number",
        },
        description: `
          List of relevance scores for each chunk in the same order as the chunk IDs.
          Each score should be a number between 0 and 1, representing the relevance of the corresponding chunk to the question.
        `,
        minLength: 1,
      },
    },
    additionalProperties: false,
    required: ["final_answer", "relevant_chunks"],
  },
};

export const RAG_REQUEST = ({ chunks, question }: { chunks: RagInputChunk[]; question: string }): RagRequest => {
  const context = chunks
    .map(chunk => {
      return `
    #Chunk
    id: ${chunk.id}
    content: 
    """
    ${chunk.content?.replace(/(\n|\r)+/gm, "\n")}
    """`;
    })
    .join("\n\n---\n\n");

  const instruction = `
    You are a RAG (Retrieval-Augmented Generation) answering system.
    Your task is to answer the given question based only on information from the provided documents, which is uploaded in the format of relevant pages extracted using RAG.

    Before giving a final answer, carefully think out loud and step by step. Pay special attention to the wording of the question.
    - Keep in mind that the content containing the answer may be worded differently than the question.
    - If it is a date, it should be in ISO Format "yyyy-MM-dd" (e.g., 2020-01-01).
    - If the question asks for a specific detail (e.g., date, full name, exact term), ensure your answer matches that detail precisely.
       But if only partial date is available, like year and month or only month, then provide this info in the final answer.
  `;

  const systemPrompt = `
    ${instruction}

    ---

    Your answer should be in JSON and strictly follow this schema, filling in the fields in the order they are given:
    \`\`\`
    ${JSON.stringify(RAG_RESPONSE_SCHEMA, null, 2)}
    \`\`\`

    ---

    # Example
    Question: 
    "Who was the CEO of 'Southwest Airlines Co.'?" 

    Answer: 
    \`\`\`
    {
      "step_by_step_analysis": "1. The question asks for the CEO of 'Southwest Airlines Co.'. The CEO is typically the highest-ranking executive responsible for the overall management of the company, sometimes referred to as the President or Managing Director.\n2. My source of information is a document that appears to be 'Southwest Airlines Co.''s annual report. This document will be used to identify the individual holding the CEO position.\n3. Within the provided document, there is a section that identifies Robert E. Jordan as the President & Chief Executive Officer of 'Southwest Airlines Co.'. The document confirms his role since February 2022.\n4. Therefore, based on the information found in the document, the CEO of 'Southwest Airlines Co.' is Robert E. Jordan.",
      "reasoning_summary": "'Southwest Airlines Co.''s annual report explicitly names Robert E. Jordan as President & Chief Executive Officer since February 2021. This directly answers the question.",
      "relevant_chunks": [
        {
          "id": "15013a6e-a2df-4cd3-81d2-6e98dff16193",
          "page": 5,
          "relevance": 0.9
        },
        {
          "id": "15013a6e-a2df-4cd3-81d2-6e98dff16195",
          "page": 6,
          "relevance": 0.8
        }
      ],
      "final_answer": "Robert E. Jordan"
    }
    \`\`\`
  `;

  const userInput = `
    Here is the context:
    """
    ${context}
    """

    ---

    Here is the question:
    """
    ${question}
    """
  `;

  return {
    systemPrompt,
    userInput,
  };
};

export const WEB_SEARCH_TOOL_MAX_CONTENT_LENGTH = 1024;
export const WEB_SEARCH_TOOL_RESULT = (results: SearchResult[]): string => {
  const context = results
    .map(result => {
      return `
    ### Result
    title: ${result.title}
    url: ${result.url}
    domain: ${result.domain}
    summary: ${result.summary || "N/A"}
    content: 
    """
    ${result.content?.replace(/(\n|\r)+/gm, "\n").substring(0, WEB_SEARCH_TOOL_MAX_CONTENT_LENGTH) || "N/A"}
    """`;
    })
    .join("\n\n---\n\n");

  return `
    # Web search results
    Please use this information to assist with your answer.
    Alsways include a reference to the source of the information in your answer, using the format [title](url).

    ${context}
  `;
};
