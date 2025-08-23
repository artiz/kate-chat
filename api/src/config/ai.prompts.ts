export const PROMPT_DOCUMENT_SUMMARY = ({ content }: { content: string }) =>
  `Please provide a comprehensive summary of the following document in up to 1024 words. 
    Return only summary, without any additional commentaries.
    Focus on the main topics, key findings, and important details:\n\n${content}`;
