import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Group, Loader } from "@mantine/core";
import { IconCircleChevronDown } from "@tabler/icons-react";
import { Message, Model, PluginProps } from "@/core";
import { useIntersectionObserver } from "@/hooks";
import { ChatMessagesList } from "./ChatMessagesList";

import "./ChatMessagesContainer.scss";

interface IProps {
  messages?: Message[];
  models: Model[];
  addChatMessage: (message: Message) => void;
  removeMessages: (args: { messagesToDelete?: Message[]; deleteAfter?: Message }) => void;
  loadMoreMessages?: () => void;
  plugins?: React.FC<PluginProps<Message>>[];
  detailsPlugins?: ((message: Message) => React.ReactNode)[];
  streaming?: boolean;
  loading?: boolean;
  loadCompleted?: boolean;
}

export interface ChatMessagesContainerRef {
  scrollToBottom: () => void;
}

export const ChatMessagesContainer = React.forwardRef<ChatMessagesContainerRef, IProps>(
  (
    {
      messages,
      models,
      addChatMessage,
      removeMessages,
      loadMoreMessages,
      plugins,
      detailsPlugins,
      streaming = false,
      loadCompleted = true,
      loading = false,
    },
    ref
  ) => {
    const [showAnchorButton, setShowAnchorButton] = useState<boolean>(false);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const anchorTimer = useRef<NodeJS.Timeout | null>(null);

    // #region Scrolling
    const scrollToBottom = useCallback(() => {
      messagesContainerRef.current?.scrollTo(0, messagesContainerRef.current?.scrollHeight ?? 0);
    }, [messagesContainerRef]);

    // Expose scrollToBottom method to parent via ref
    useImperativeHandle(
      ref,
      () => ({
        scrollToBottom,
      }),
      [scrollToBottom]
    );

    const autoScroll = useCallback(() => {
      if (!showAnchorButton) {
        scrollToBottom();
      }
    }, [scrollToBottom, showAnchorButton]);

    useEffect(() => {
      autoScroll();
    }, [messages, autoScroll]);

    const handleScroll = useCallback(
      (e: React.MouseEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLDivElement;
        anchorTimer.current && clearTimeout(anchorTimer.current);

        if (scrollHeight - scrollTop - clientHeight < 2) {
          setShowAnchorButton(false);
        } else if (messages?.length) {
          if (streaming) {
            anchorTimer.current = setTimeout(() => {
              setShowAnchorButton(true);
            }, 100);
          } else {
            setShowAnchorButton(true);
          }
        }
      },
      [messages?.length, streaming]
    );

    const anchorHandleClick = useCallback(() => {
      setShowAnchorButton(false);
      scrollToBottom();
    }, [scrollToBottom]);

    useEffect(() => {
      if (loadCompleted) {
        setShowAnchorButton(false);
        setTimeout(scrollToBottom, 200);
      }
    }, [loadCompleted]);

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
          <div ref={firstMessageRef} />
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
