import React, { useCallback, useState } from "react";
import { ActionIcon, Tooltip } from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { DeleteMessageResponse, Message } from "@/types/graphql";

/** Delete Message */
export const RAGDetails = (message: Message) => {
  const { metadata = {} } = message;
  const { relevantsChunks = [], documentIds = [] } = metadata;

  // if (documentIds.length && chatDocuments) {
  //   const docsMap = chatDocuments.reduce(
  //     (acc, doc) => {
  //       acc[doc.id] = doc;
  //       return acc;
  //     },
  //     {} as Record<string, Document>
  //   );

  //   const cmp = (
  //     <div key="rag-search">
  //       <Text w={500} size="sm">
  //         Semantic search
  //       </Text>
  //       <ol>
  //         {documentIds.map((docId, idx) => (
  //           <li key={idx}>
  //             {docsMap[docId] ? (
  //               docsMap[docId].downloadUrl ? (
  //                 <a href={docsMap[docId].downloadUrl} target="_blank" rel="noopener noreferrer">
  //                   {docsMap[docId].fileName}
  //                 </a>
  //               ) : (
  //                 docsMap[docId].fileName
  //               )
  //             ) : (
  //               docId
  //             )}
  //           </li>
  //         ))}
  //       </ol>
  //     </div>
  //   );

  //   detailsNodes.push(cmp);
  // }

  // if (relevantsChunks.length) {
  //   const cmp = (
  //     <div key="rag-chunks">
  //       <Text w={500} size="sm" mt="lg">
  //         Related chunks
  //       </Text>
  //       {relevantsChunks.map((chunk, idx) => (
  //         <div key={idx}>
  //           <Text size="xs" c="dimmed">
  //             {chunk.documentName || chunk.id} (Page {chunk.page})
  //           </Text>
  //           <Text size="xs" c="dimmed">
  //             Relevance: {chunk.relevance || "N/A"}
  //           </Text>
  //           <Box fz="12">
  //             <pre>{chunk.content}</pre>
  //           </Box>
  //         </div>
  //       ))}
  //     </div>
  //   );

  //   detailsNodes.push(cmp);
  // }

  return <></>;
};
