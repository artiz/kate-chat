import React from "react";
import { MantineProvider } from "@mantine/core";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatInput, ChatInputRef } from "../ChatInput";

// Mantine needs matchMedia/ResizeObserver in jsdom
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const renderChatInput = (props: Partial<React.ComponentProps<typeof ChatInput>> = {}) => {
  const ref = React.createRef<ChatInputRef>();
  const onSendMessage = jest.fn().mockResolvedValue(undefined);
  const onDocumentsUpload = jest.fn();

  render(
    <MantineProvider>
      <ChatInput
        ref={ref}
        loadCompleted
        streaming={false}
        setSending={jest.fn()}
        contextFileFormats={["text/plain", "application/pdf"]}
        onSendMessage={onSendMessage}
        onDocumentsUpload={onDocumentsUpload}
        {...props}
      />
    </MantineProvider>
  );

  return { ref, onSendMessage, onDocumentsUpload };
};

const textFile = (name = "notes.txt") => new File(["file content"], name, { type: "text/plain" });

describe("ChatInput chat-context files", () => {
  it("asks RAG vs chat context when both routes are available", async () => {
    const { ref, onDocumentsUpload } = renderChatInput();

    act(() => ref.current!.handleAddFiles([textFile()]));

    expect(await screen.findByTestId("upload-type-selector")).toBeInTheDocument();

    // the modal root mounts before its transitioned content — retry until the button is committed
    await userEvent.click(await screen.findByTestId("upload-type-rag"));
    expect(onDocumentsUpload).toHaveBeenCalledTimes(1);
    expect(onDocumentsUpload.mock.calls[0][0].map((f: File) => f.name)).toEqual(["notes.txt"]);
  });

  it("attaches context files inline and sends them with the message", async () => {
    const { ref, onSendMessage, onDocumentsUpload } = renderChatInput();

    act(() => ref.current!.handleAddFiles([textFile()]));
    await userEvent.click(await screen.findByTestId("upload-type-context"));

    // FileReader is async — wait for the attachment chip
    await waitFor(() => expect(screen.getByTestId("context-files-list")).toBeInTheDocument());
    expect(onDocumentsUpload).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledTimes(1));
    const [message, images, audio, files] = onSendMessage.mock.calls[0];
    expect(message).toBe("");
    expect(images).toEqual([]);
    expect(audio).toBeUndefined();
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({
      fileName: "notes.txt",
      mimeType: "text/plain",
      size: 12,
    });
    expect(files[0].bytesBase64).toMatch(/^data:text\/plain;base64,/);
  });

  it("routes files straight to RAG when they are not eligible for chat context", async () => {
    const { ref, onDocumentsUpload } = renderChatInput();

    const docx = new File(["binary"], "report.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    act(() => ref.current!.handleAddFiles([docx]));

    // no RAG-vs-context dialog — the file goes straight to RAG upload
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDocumentsUpload).toHaveBeenCalledTimes(1);
  });

  it("attaches eligible files as context without asking when RAG upload is unavailable", async () => {
    const { ref, onDocumentsUpload } = renderChatInput({ onDocumentsUpload: undefined });

    act(() => ref.current!.handleAddFiles([textFile()]));

    // no RAG-vs-context dialog — the file is attached as chat context directly
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("context-files-list")).toBeInTheDocument());
    expect(onDocumentsUpload).not.toHaveBeenCalled();
  });
});
