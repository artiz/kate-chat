import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Group, Loader } from "@mantine/core";
import { IconCircleChevronDown } from "@tabler/icons-react";
import { Message, Model, PluginProps, CodePlugin } from "@/core";
import { useIntersectionObserver } from "@/hooks";
import { ChatMessagesList } from "./ChatMessagesList";

import "./ChatMessagesContainer.scss";

interface IProps {
  messages?: Message[];
  models?: Model[];
  addChatMessage: (message: Message) => void;
  removeMessages: (args: { messagesToDelete?: Message[]; deleteAfter?: Message }) => void;
  loadMoreMessages?: () => void;
  plugins?: React.FC<PluginProps<Message>>[];
  detailsPlugins?: ((message: Message) => React.ReactNode)[];
  codePlugins?: Record<string, CodePlugin>;
  streaming?: boolean;
  loading?: boolean;
  loadCompleted?: boolean;
  autoScroll?: boolean;
  id?: string;
}

export interface ChatMessagesContainerRef {
  scrollToBottom: () => void;
}

export const ChatMessagesContainer = React.forwardRef<ChatMessagesContainerRef, IProps>(
  (
    {
      messages,
      models = [],
      addChatMessage,
      removeMessages,
      loadMoreMessages,
      plugins,
      detailsPlugins,
      codePlugins,
      streaming = false,
      loadCompleted = true,
      loading = false,
      autoScroll = true,
      id = "chat",
    },
    ref
  ) => {
    const [showAnchorButton, setShowAnchorButton] = useState<boolean>(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    // Distinguishes our own scrollTo() calls from user-initiated scrolling, so
    // autoscroll during streaming never fights the user scrolling up
    const isProgrammaticScroll = useRef<boolean>(false);
    // Synchronous mirror of "user scrolled away": checked by autoscroll before
    // the async showAnchorButton state has committed
    const autoScrollPaused = useRef<boolean>(false);

    // #region Scrolling
    const scrollToBottom = useCallback(() => {
      const el = messagesContainerRef.current;
      if (!el) return;
      if (el.scrollHeight - el.scrollTop - el.clientHeight >= 1) {
        // flag only when the position will actually change (a no-op scrollTo
        // fires no scroll event and would leave the flag stuck)
        isProgrammaticScroll.current = true;
      }
      el.scrollTo(0, el.scrollHeight);
    }, [messagesContainerRef]);

    // Expose scrollToBottom method to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom,
      }),
      [scrollToBottom]
    );

    const handleAutoScroll = useCallback(() => {
      if (!autoScrollPaused.current) {
        scrollToBottom();
      }
    }, [scrollToBottom]);

    // keep the view pinned to the bottom when the scroller itself resizes
    // (e.g. the voice equalizer appears/collapses or the input grows)
    useEffect(() => {
      const el = messagesContainerRef.current;
      if (!el || !autoScroll) return;

      const observer = new ResizeObserver(() => {
        if (!autoScrollPaused.current) {
          scrollToBottom();
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    }, [autoScroll, scrollToBottom]);

    useEffect(() => {
      if (autoScroll) {
        handleAutoScroll();
      } else {
        // When autoScroll is disabled and new messages arrive, show the anchor button
        // if user is not already at the bottom
        const container = messagesContainerRef.current;
        if (container) {
          const { scrollTop, scrollHeight, clientHeight } = container;
          const isAtBottom = scrollHeight - scrollTop - clientHeight < 2;
          if (!isAtBottom) {
            autoScrollPaused.current = true;
            setShowAnchorButton(true);
          }
        }
      }
    }, [messages, handleAutoScroll, autoScroll]);

    const handleScroll = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLDivElement;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 2;

        // Our own scrollToBottom() — never treat it as user intent
        if (isProgrammaticScroll.current) {
          isProgrammaticScroll.current = false;
          if (isAtBottom) {
            setShowAnchorButton(false);
          }
          return;
        }

        if (isAtBottom) {
          autoScrollPaused.current = false;
          setShowAnchorButton(false);
        } else if (messages?.length) {
          // User scrolled away from the bottom: show the anchor and pause
          // autoscroll until they return or click the anchor
          autoScrollPaused.current = true;
          setShowAnchorButton(true);
        }
      },
      [messages?.length]
    );

    const anchorHandleClick = useCallback(() => {
      autoScrollPaused.current = false;
      setShowAnchorButton(false);
      scrollToBottom();
    }, [scrollToBottom]);

    useEffect(() => {
      if (loadCompleted) {
        autoScrollPaused.current = false;
        setShowAnchorButton(false);
        setTimeout(scrollToBottom, 200);
      }
    }, [loadCompleted, autoScroll]);

    const firstMessageRef = useIntersectionObserver<HTMLDivElement>(
      () => loadMoreMessages?.(),
      [loadMoreMessages],
      200
    );

    // #endregion

    return (
      <div
        className={[
          "katechat-messages-container",
          loadCompleted ? "container--load-completed" : "",
          loadCompleted && messages?.length === 0 ? "container--empty" : "",
        ].join(" ")}
      >
        <div className="katechat-messages-container-scroller" ref={messagesContainerRef} onScroll={handleScroll}>
          <div ref={firstMessageRef} id={`${id}-first-message`} />
          {loading && (
            <Group justify="center" align="center" py="xl">
              <Loader />
            </Group>
          )}

          <div className="katechat-messages-list">
            {messages && (
              <ChatMessagesList
                messages={messages}
                onMessageDeleted={removeMessages} // Reload messages after deletion
                onAddMessage={addChatMessage}
                models={models}
                plugins={plugins}
                detailsPlugins={detailsPlugins}
                codePlugins={codePlugins}
              />
            )}
          </div>
        </div>

        <div className={["katechat-anchor-container", showAnchorButton ? "container--visible" : ""].join(" ")}>
          <div className="katechat-anchor">
            <IconCircleChevronDown size={32} color="teal" onClick={anchorHandleClick} />
          </div>
        </div>
      </div>
    );
  }
);

ChatMessagesContainer.displayName = "ChatMessagesContainer";
