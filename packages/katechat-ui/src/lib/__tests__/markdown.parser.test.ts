import { parseMarkdown, parseChatMessages, escapeHtml } from "../markdown.parser";
import { Message, MessageRole } from "../../core/message";

// Mock the sanitizeUrl function by accessing it through module internals
// Since sanitizeUrl is not exported, we'll test it indirectly through parseMarkdown
// or we can use jest.mock to access internals, but for now we'll test through integration

describe("MarkdownParser", () => {
  describe("escapeHtml", () => {
    it("should escape HTML entities", () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
      expect(escapeHtml("&<>\"'`")).toBe("&amp;&lt;&gt;&quot;&#x27;`");
    });

    it("should handle null and undefined", () => {
      expect(escapeHtml(null)).toBe("");
      expect(escapeHtml(undefined)).toBe("");
      expect(escapeHtml("")).toBe("");
    });

    it("should preserve safe text", () => {
      expect(escapeHtml("Hello World!")).toBe("Hello World!");
      expect(escapeHtml("123 + 456 = 579")).toBe("123 + 456 = 579");
    });
  });

  describe("parseMarkdown", () => {
    it("should handle null and undefined content", () => {
      expect(parseMarkdown(null)).toEqual([]);
      expect(parseMarkdown(undefined)).toEqual([]);
      expect(parseMarkdown("")).toEqual([]);
    });

    it("should parse simple markdown text", () => {
      const result = parseMarkdown("Hello **world**!");
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("<strong>world</strong>");
    });

    it("should handle code blocks as single block", () => {
      const codeBlock = '```javascript\nconsole.log("hello");\n```';
      const result = parseMarkdown(codeBlock);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("console.log");
    });

    it("should handle tables as single block", () => {
      const table = "| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |";
      const result = parseMarkdown(table);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain("<table>");
    });

    it("should split text by double newlines", () => {
      const text = "Paragraph 1\n\nParagraph 2\n\nParagraph 3";
      const result = parseMarkdown(text);
      expect(result).toHaveLength(3);
      expect(result[0]).toContain("Paragraph 1");
      expect(result[1]).toContain("Paragraph 2");
      expect(result[2]).toContain("Paragraph 3");
    });

    describe("Link Security Tests", () => {
      it("should sanitize javascript: URLs", () => {
        const maliciousLink = '[Click me](javascript:alert("xss"))';
        const result = parseMarkdown(maliciousLink);
        expect(result[0]).not.toContain("javascript:");
        // Should render as text or empty href
        expect(result[0]).toContain("Click me");
      });

      it("should sanitize data: URLs", () => {
        const dataUrl = '[Click me](data:text/html,<script>alert("xss")</script>)';
        const result = parseMarkdown(dataUrl);
        expect(result[0]).not.toContain("data:text/html");
        expect(result[0]).toContain("Click me");
      });

      it("should allow https URLs", () => {
        const httpsLink = "[Safe link](https://example.com)";
        const result = parseMarkdown(httpsLink);
        expect(result[0]).toContain('href="https://example.com"');
        expect(result[0]).toContain('target="_blank"');
        expect(result[0]).toContain('rel="noopener noreferrer"');
      });

      it("should allow http URLs", () => {
        const httpLink = "[HTTP link](http://example.com)";
        const result = parseMarkdown(httpLink);
        expect(result[0]).toContain('href="http://example.com"');
      });

      it("should allow mailto URLs", () => {
        const mailtoLink = "[Email me](mailto:test@example.com)";
        const result = parseMarkdown(mailtoLink);
        expect(result[0]).toContain('href="mailto:test@example.com"');
      });

      it("should handle protocol-relative URLs", () => {
        const protocolRelative = "[Link](//example.com)";
        const result = parseMarkdown(protocolRelative);
        expect(result[0]).toContain('href="https://example.com"');
      });

      it("should allow relative URLs", () => {
        const relativeLink = "[Relative](/path/to/page)";
        const result = parseMarkdown(relativeLink);
        expect(result[0]).toContain('href="/path/to/page"');
      });

      it("should escape link titles and text", () => {
        const linkWithQuotes = '[Link with "quotes"](https://example.com "Title with \'quotes\'")';
        const result = parseMarkdown(linkWithQuotes);
        expect(result[0]).toContain('title="Title with &#x27;quotes&#x27;"');
        expect(result[0]).toContain("Link with &quot;quotes&quot;");
      });

      it("should handle XSS attempts in link text", () => {
        const xssText = '[<script>alert("xss")</script>](https://example.com)';
        const result = parseMarkdown(xssText);
        expect(result[0]).not.toContain("<script>");
        expect(result[0]).toContain("&lt;script&gt;");
      });

      it("should handle XSS attempts in link titles", () => {
        const xssTitle = '[Link](https://example.com "Title<script>alert(\\"xss\\")</script>")';
        const result = parseMarkdown(xssTitle);
        expect(result[0]).not.toContain("<script>");
        expect(result[0]).toContain("&lt;script&gt;");
      });
    });

    describe("Math Formula Tests", () => {
      it("should render inline math formulas", () => {
        const mathFormula = "The equation is $x^2 + y^2 = z^2$";
        const result = parseMarkdown(mathFormula);
        expect(result[0]).toContain("katex");
      });

      it("should render block math formulas", () => {
        const blockMath = "$$\\sum_{i=1}^{n} x_i$$";
        const result = parseMarkdown(blockMath);
        expect(result[0]).toContain("katex");
      });
    });

    describe("Code Highlighting Tests", () => {
      it("should highlight code with language specified", () => {
        const code = "```javascript\nconst x = 5;\n```";
        const result = parseMarkdown(code);
        expect(result[0]).toContain("hljs");
        expect(result[0]).toContain("code-data");
      });

      it("should handle code without language", () => {
        const code = "```\nsome code\n```";
        const result = parseMarkdown(code);
        // Code blocks without language don't get hljs classes applied
        expect(result[0]).toContain("<pre><code>");
        expect(result[0]).toContain("some code");
      });
    });
  });

  describe("parseChatMessages", () => {
    const mockMessage: Message = {
      id: "1",
      chatId: "chat1",
      content: "Hello **world**!",
      role: MessageRole.USER,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    it("should handle empty messages array", () => {
      expect(parseChatMessages([])).toEqual([]);
      expect(parseChatMessages()).toEqual([]);
    });

    it("should parse USER and ASSISTANT messages as markdown", () => {
      const messages: Message[] = [
        { ...mockMessage, role: MessageRole.USER },
        { ...mockMessage, role: MessageRole.ASSISTANT, id: "2" },
      ];

      const result = parseChatMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].html).toBeDefined();
      expect(result[1].html).toBeDefined();
      expect(result[0].html![0]).toContain("<strong>world</strong>");
      expect(result[1].html![0]).toContain("<strong>world</strong>");
    });

    it("should escape non-USER/ASSISTANT messages", () => {
      const systemMessage: Message = {
        ...mockMessage,
        role: MessageRole.ERROR,
        content: '<script>alert("xss")</script>',
      };

      const result = parseChatMessages([systemMessage]);

      expect(result).toHaveLength(1);
      expect(result[0].html![0]).toBe("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    });

    it("should handle linked messages", () => {
      const messageWithLinked: Message = {
        ...mockMessage,
        linkedMessages: [
          { ...mockMessage, id: "2", role: MessageRole.ASSISTANT, content: "Response **bold**" },
          { ...mockMessage, id: "3", role: MessageRole.SYSTEM, content: '<script>alert("xss")</script>' },
        ],
      };

      const result = parseChatMessages([messageWithLinked]);

      expect(result).toHaveLength(1);
      expect(result[0].linkedMessages).toHaveLength(2);
      expect(result[0].linkedMessages![0].html![0]).toContain("<strong>bold</strong>");
      expect(result[0].linkedMessages![1].html![0]).toContain("&lt;script&gt;");
    });

    it("should handle malicious links in chat messages", () => {
      const maliciousMessage: Message = {
        ...mockMessage,
        content: '[Click here](javascript:alert("xss")) for a "surprise"',
        role: MessageRole.USER,
      };

      const result = parseChatMessages([maliciousMessage]);

      expect(result[0].html![0]).not.toContain("javascript:");
      expect(result[0].html![0]).toContain("Click here");
      expect(result[0].html![0]).toContain("&quot;surprise&quot;");
    });

    it("should preserve message metadata", () => {
      const result = parseChatMessages([mockMessage]);

      expect(result[0].id).toBe(mockMessage.id);
      expect(result[0].role).toBe(mockMessage.role);
      expect(result[0].createdAt).toBe(mockMessage.createdAt);
      expect(result[0].updatedAt).toBe(mockMessage.updatedAt);
    });
  });

  describe("HTML Injection Prevention", () => {
    it("should prevent HTML injection in regular text", () => {
      const maliciousText = 'Hello <img src="x" onerror="alert(\'xss\')">';
      const result = parseMarkdown(maliciousText);
      // HTML should be escaped, but onerror= might still appear in escaped form
      expect(result[0]).toContain("&lt;img");
      expect(result[0]).toContain("&quot;alert");
      // Should not contain unescaped HTML
      expect(result[0]).not.toContain('<img src="x"');
    });

    it("should prevent HTML injection in code blocks", () => {
      const maliciousCode = '```html\n<script>alert("xss")</script>\n```';
      const result = parseMarkdown(maliciousCode);
      // Code in code blocks should be syntax highlighted but not executed
      // HTML syntax highlighting will show tags but they're still safe
      expect(result[0]).toContain("hljs-tag");
      expect(result[0]).toContain("script");
      // Should not contain executable script tag
      expect(result[0]).not.toContain('<script>alert("xss")</script>');
    });

    it("should handle mixed content safely", () => {
      const mixedContent = `
# Header with <script>alert("xss")</script>

[Malicious link](javascript:void(0)) and normal [safe link](https://example.com)

\`\`\`javascript
// This <script> should be highlighted but not executed
console.log("<script>alert('safe')</script>");
\`\`\`
      `;

      const result = parseMarkdown(mixedContent);
      expect(result[0]).not.toContain("javascript:void(0)");
      expect(result[0]).toContain("https://example.com");
      expect(result[0]).toContain("&lt;script&gt;alert(&#x27;safe&#x27;)&lt;/script&gt;");
    });
  });
});
