import React, { useMemo, useRef, useState } from "react";
import {
  ApolloClient,
  ApolloProvider,
  InMemoryCache,
  HttpLink,
  split,
  from,
  NormalizedCacheObject,
} from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";
import { GraphQLWsLink } from "@apollo/client/link/subscriptions";
import { createClient } from "graphql-ws";
import { getMainDefinition } from "@apollo/client/utilities";
import { notifications } from "@mantine/notifications";
import { useSelector } from "react-redux";
import { RootState } from "../store";

// Setup the Apollo Client provider with authentication and error handling
export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const token = useSelector((state: RootState) => state.auth.token);

  const client = useMemo(() => {
    // Get the API URL from environment variables
    const baseUrl = process.env.REACT_APP_API_URL || "http://localhost:4000";

    // Extract the base URL from the API URL
    const apiUrl = baseUrl + "/graphql";

    // Create WebSocket URL for subscriptions
    const wsUrl = baseUrl.replace(/^http/, "ws") + "/graphql/subscriptions";

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
                const params = {
                  authorization: token ? `Bearer ${token}` : "",
                };
                return params;
              },
              retryAttempts: 5,
              retryWait: retries =>
                new Promise(resolve => {
                  // Exponential backoff with jitter
                  const delay = Math.min(1000 * 2 ** retries, 30000);
                  const jitter = Math.random() * 1000;
                  console.log(`WS reconnecting in ${(delay + jitter) / 1000}s (attempt ${retries + 1})`);
                  setTimeout(resolve, delay + jitter);
                }),
              on: {
                // connected: ws => {
                //   console.debug("WebSocket connected successfully", ws);
                // },
                // closed: () => console.debug("WebSocket connection closed"),
                // connecting: () => console.debug("WebSocket connecting..."),
                // opened: socket => console.debug("WebSocket connection opened"),
                error: e => console.error("WebSocket connection error:", e),
              },
            })
          )
        : null;

    // Authentication link that adds the token to every request
    const authLink = setContext((_, { headers }) => {
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
    const clientInstance = new ApolloClient({
      connectToDevTools: true,
      link: from([errorLink, authLink, splitLink]),
      name: "react-web-client",
      cache: new InMemoryCache(),
      defaultOptions: {
        watchQuery: {
          fetchPolicy: "cache-and-network",
        },
      },
    });

    return clientInstance;
  }, [token]);

  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
