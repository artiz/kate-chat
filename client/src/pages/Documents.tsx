import React from "react";
import { useQuery, useSubscription } from "@apollo/client";
import { gql } from "@apollo/client";

const GET_DOCUMENTS = gql`
  query GetDocuments {
    documents {
      id
      fileName
      fileSize
      status
      createdAt
    }
  }
`;

const DOCUMENT_STATUS_SUBSCRIPTION = gql`
  subscription DocumentStatus($documentIds: [String!]!) {
    documentsStatus(documentIds: $documentIds) {
      id
      status
      statusProgress
    }
  }
`;

const DocumentsPage: React.FC = () => {
  const { loading, error, data } = useQuery(GET_DOCUMENTS);
  const documentIds = data?.documents.map((doc: any) => doc.id) || [];

  const { data: subscriptionData } = useSubscription(DOCUMENT_STATUS_SUBSCRIPTION, {
    variables: { documentIds }, // replace with actual ownerId
  });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error :(</p>;

  return (
    <div>
      <h1>Documents</h1>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Status</th>
            <th>Created At</th>
          </tr>
        </thead>
        <tbody>
          {data.documents.map((doc: any) => (
            <tr key={doc.id}>
              <td>{doc.fileName}</td>
              <td>{doc.fileSize}</td>
              <td>{doc.status}</td>
              <td>{doc.createdAt}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DocumentsPage;
