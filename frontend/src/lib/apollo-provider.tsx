"use client";

import React, { useState } from "react";
import { ApolloClient, ApolloProvider, InMemoryCache, HttpLink, split, from } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { getMainDefinition } from "@apollo/client/utilities";
import { notifications } from "@mantine/notifications";

// Setup the Apollo Client provider with authentication and error handling
export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => {
    // Get the API URL from environment variables
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/graphql";
    const wsUrl = apiUrl.replace(/^http/, "ws");

    // Create HTTP link for queries and mutations
    const httpLink = new HttpLink({
      uri: apiUrl,
    });

    // Create WebSocket link for subscriptions
    const wsLink =
      typeof window !== "undefined"
        ? new GraphQLWsLink(
            createClient({
              url: wsUrl,
              connectionParams: () => {
                // Get authentication token
                const token = localStorage.getItem("auth-token");
                return {
                  authorization: token ? `Bearer ${token}` : "",
                };
              },
            })
          )
        : null;

    // Authentication link that adds the token to every request
    const authLink = setContext((_, { headers }) => {
      // Get authentication token from local storage
      const token = localStorage.getItem("auth-token");

      // Return the headers to the context
      return {
        headers: {
          ...headers,
          authorization: token ? `Bearer ${token}` : "",
        },
      };
    });

    // Error handling link
    const errorLink = onError(({ graphQLErrors, networkError }) => {
      if (graphQLErrors) {
        graphQLErrors.forEach(({ message, locations, path }) => {
          console.error(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`);

          // Show error notification
          notifications.show({
            title: "GraphQL Error",
            message: message,
            color: "red",
          });
        });
      }

      if (networkError) {
        console.error(`[Network error]: ${networkError}`);

        // Show network error notification
        notifications.show({
          title: "Network Error",
          message: "Unable to connect to the server",
          color: "red",
        });
      }
    });

    // Split link to use WebSocket for subscriptions and HTTP for queries/mutations
    const splitLink = wsLink
      ? split(
          ({ query }) => {
            const definition = getMainDefinition(query);
            return definition.kind === "OperationDefinition" && definition.operation === "subscription";
          },
          wsLink,
          httpLink
        )
      : httpLink;

    // Create and return the Apollo Client instance
    return new ApolloClient({
      link: from([errorLink, authLink, splitLink]),
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: "cache-and-network",
        },
      },
    });
  });

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
