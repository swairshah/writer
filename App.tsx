import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import { Markdown } from "@tiptap/markdown";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Slice } from "@tiptap/pm/model";
import { marked } from "marked";
import { signInWithGoogle, signOut, getSession, onAuthStateChange, getSupabase } from "./auth";
import type { Session } from "@supabase/supabase-js";
import "./styles.css";

// ── Types ──────────────────────────────────────────────────────

type Post = { filename: string; name: string; date: string };

type HighlightType = "question" | "suggestion" | "edit" | "voice" | "weakness" | "evidence" | "wordiness" | "factcheck";

type Highlight = {
  id: string;
  type: HighlightType;
  matchText: string;
  comment: string;
  suggestedEdit?: string;
  dismissed?: boolean;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  highlights?: Highlight[];
  timestamp: string;
};

// ── Highlight helpers ──────────────────────────────────────────

const HIGHLIGHT_CLASSES: Record<HighlightType, string> = {
  question: "highlight-question",
  suggestion: "highlight-suggestion",
  edit: "highlight-edit",
  voice: "highlight-voice",
  weakness: "highlight-weakness",
  evidence: "highlight-evidence",
  wordiness: "highlight-wordiness",
  factcheck: "highlight-factcheck",
};

function getDocFlatText(doc: any): string {
  const parts: string[] = [];
  doc.descendants((node: any, pos: number) => {
    if (node.isText) {
      parts.push(node.text);
    } else if (node.isBlock && pos > 0) {
      parts.push("\n");
    }
  });
  return parts.join("");
}

function flatOffsetToPos(doc: any, flatOffset: number) {
  let currentOffset = 0;
  const result = { found: false, pos: 0 };
  doc.descendants((node: any, pos: number) => {
    if (result.found) return false;
    if (node.isText) {
      const textLen = node.text.length;
      if (flatOffset >= currentOffset && flatOffset <= currentOffset + textLen) {
        result.pos = pos + (flatOffset - currentOffset);
        result.found = true;
        return false;
      }
      currentOffset += textLen;
    } else if (node.isBlock && pos > 0) {
      currentOffset += 1;
    }
    return true;
  });
  return result;
}

function createHighlightExtension(
  highlightsRef: React.MutableRefObject<Highlight[]>,
  onHighlightClick: (h: Highlight, rect: DOMRect) => void
) {
  const pluginKey = new PluginKey("highlights");
  return Extension.create({
    name: "highlights",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: pluginKey,
          state: {
            init() {
              return DecorationSet.empty;
            },
            apply(_tr: any, _oldSet: any, _oldState: any, newState: any) {
              const highlights = highlightsRef.current;
              if (!highlights || highlights.length === 0) return DecorationSet.empty;
              const flatText = getDocFlatText(newState.doc);
              const decorations: Decoration[] = [];
              for (const h of highlights) {
                if (h.dismissed) continue;
                const idx = flatText.indexOf(h.matchText);
                if (idx === -1) continue;
                const fromResult = flatOffsetToPos(newState.doc, idx);
                const toResult = flatOffsetToPos(newState.doc, idx + h.matchText.length);
                if (!fromResult.found || !toResult.found) continue;
                if (fromResult.pos >= toResult.pos) continue;
                decorations.push(
                  Decoration.inline(fromResult.pos, toResult.pos, {
                    class: HIGHLIGHT_CLASSES[h.type] || "highlight-question",
                    "data-highlight-id": h.id,
                  })
                );
              }
              return DecorationSet.create(newState.doc, decorations);
            },
          },
          props: {
            decorations(state: any) {
              return pluginKey.getState(state);
            },
            handleClick(_view: any, _pos: number, event: MouseEvent) {
              const target = event.target as HTMLElement;
              if (!target?.dataset?.highlightId) return false;
              const highlightId = target.dataset.highlightId;
              const highlight = highlightsRef.current?.find((h) => h.id === highlightId);
              if (!highlight) return false;
              const rect = target.getBoundingClientRect();
              onHighlightClick(highlight, rect);
              return true;
            },
          },
        }),
      ];
    },
  });
}

// ── Markdown detection ─────────────────────────────────────────

function looksLikeMarkdown(text: string) {
  return /(?:^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```|---|\*\*|__|\[.+\]\()/.test(text);
}

function getWordCount(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

// ── SSE Stream Reader ──────────────────────────────────────────

async function readAssistantStream(
  response: Response,
  callbacks: {
    onText?: (chunk: string) => void;
    onHighlight?: (h: Highlight) => void;
    onDone?: () => void;
    onError?: (e: any) => void;
  }
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "text";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        try {
          const parsed = JSON.parse(line.slice(6));
          if (currentEvent === "text") callbacks.onText?.(parsed.chunk);
          else if (currentEvent === "highlight") callbacks.onHighlight?.(parsed);
          else if (currentEvent === "done") callbacks.onDone?.();
          else if (currentEvent === "error") callbacks.onError?.(parsed);
        } catch {}
      }
    }
  }
}

// ── Highlight Popover ──────────────────────────────────────────

const TYPE_LABELS: Record<HighlightType, string> = {
  question: "Question",
  suggestion: "Suggestion",
  edit: "Edit",
  voice: "Voice",
  weakness: "Weakness",
  evidence: "Evidence",
  wordiness: "Wordiness",
  factcheck: "Fact Check",
};

function HighlightPopover({
  highlight,
  rect,
  onDismiss,
  onAcceptEdit,
  onReply,
}: {
  highlight: Highlight | null;
  rect: DOMRect | null;
  onDismiss: (id?: string) => void;
  onAcceptEdit: (h: Highlight) => void;
  onReply: (h: Highlight) => void;
}) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onDismiss();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onDismiss]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onDismiss]);

  if (!highlight || !rect) return null;

  // Convert viewport-relative rect to scroll-area-relative position
  const scrollArea = document.querySelector(".scroll-area");
  const scrollTop = scrollArea ? scrollArea.scrollTop : 0;
  const scrollRect = scrollArea ? scrollArea.getBoundingClientRect() : { top: 0, left: 0 };
  const top = rect.bottom - scrollRect.top + scrollTop + 8;
  const left = rect.left - scrollRect.left + rect.width / 2;

  return (
    <div ref={popoverRef} className="popover" style={{ top, left }}>
      <div className={`popover-badge popover-badge-${highlight.type}`}>
        {TYPE_LABELS[highlight.type]}
      </div>
      <div className="popover-comment">{highlight.comment}</div>
      {(highlight.type === "edit" || highlight.type === "wordiness") && highlight.suggestedEdit && (
        <div className="popover-edit-preview">
          <div className="popover-edit-label">Suggested replacement:</div>
          <div className="popover-edit-text">{highlight.suggestedEdit}</div>
        </div>
      )}
      <div className="popover-actions">
        {(highlight.type === "edit" || highlight.type === "wordiness") && highlight.suggestedEdit ? (
          <>
            <button className="popover-accept-btn" onClick={() => onAcceptEdit(highlight)}>Accept</button>
            <button className="popover-dismiss-btn" onClick={() => onDismiss(highlight.id)}>Dismiss</button>
          </>
        ) : (
          <>
            <button className="popover-reply-btn" onClick={() => onReply(highlight)}>Reply</button>
            <button className="popover-dismiss-btn" onClick={() => onDismiss(highlight.id)}>Dismiss</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Chat Panel ─────────────────────────────────────────────────

function ChatPanel({
  getMarkdown,
  currentFilename,
  postId,
  onHighlights,
  expanded,
  onToggle,
  session,
  authFetch,
  clearChatRef,
}: {
  getMarkdown: () => string;
  currentFilename: string | null;
  postId: string | null;
  onHighlights: (highlights: Highlight[]) => void;
  expanded: boolean;
  onToggle: (open: boolean) => void;
  session: Session | null;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
  clearChatRef: React.MutableRefObject<(() => void) | null>;
}) {
  const handleSetExpanded = useCallback((open: boolean) => {
    onToggle(open);
  }, [onToggle]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const inputValueRef = useRef("");
  const [streaming, setStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Expose clear chat function to parent
  useEffect(() => {
    clearChatRef.current = () => {
      abortRef.current?.abort();
      setMessages([]);
      setInput("");
      inputValueRef.current = "";
      // Clear on server too
      const chatKey = postId || currentFilename;
      if (chatKey) {
        authFetch(`/api/assistant/conversation/${encodeURIComponent(chatKey)}`, {
          method: "DELETE",
        }).catch(() => {});
      }
    };
    return () => { clearChatRef.current = null; };
  }, [postId, currentFilename, authFetch, clearChatRef]);

  // Load conversation when file changes
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    const chatKey = postId || currentFilename;
    if (!chatKey) {
      setMessages([]);
      setLoaded(true);
      return;
    }
    setLoaded(false);
    authFetch(`/api/assistant/conversation/${encodeURIComponent(chatKey)}`)
      .then((r) => r.json())
      .then((data) => {
        const msgs = data.messages || [];
        setMessages(msgs);
        setLoaded(true);
        // Restore highlights from conversation
        const allHighlights: Highlight[] = [];
        for (const msg of msgs) {
          if (msg.highlights) {
            allHighlights.push(...msg.highlights);
          }
        }
        if (allHighlights.length > 0 && onHighlights) {
          onHighlights(allHighlights);
        }
      })
      .catch(() => {
        setMessages([]);
        setLoaded(true);
      });
  }, [currentFilename]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = (input || inputValueRef.current).trim();
    if (!text || streaming || !currentFilename) return;

    setInput("");
    inputValueRef.current = "";
    setStreaming(true);

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: ChatMessage = { role: "assistant", content: "", timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, assistantMsg]);

    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const response = await authFetch("/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({
          filename: currentFilename,
          postId,
          message: text,
          markdown: getMarkdown(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error("Stream failed");

      const collectedHighlights: Highlight[] = [];
      let textBuffer = "";
      let rafId: number | null = null;

      function flushTextBuffer() {
        if (!textBuffer) return;
        const flushed = textBuffer;
        textBuffer = "";
        setMessages((prev) => {
          const updated = prev.slice(0, -1);
          const last = prev[prev.length - 1];
          if (last.role === "assistant") {
            updated.push({ ...last, content: last.content + flushed });
          } else {
            updated.push(last);
          }
          return updated;
        });
      }

      await readAssistantStream(response, {
        onText(chunk) {
          textBuffer += chunk;
          if (rafId === null) {
            rafId = requestAnimationFrame(() => {
              rafId = null;
              flushTextBuffer();
            });
          }
        },
        onHighlight(highlight) {
          collectedHighlights.push(highlight);
        },
        onDone() {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = null;
          flushTextBuffer();
          if (collectedHighlights.length > 0) {
            onHighlights(collectedHighlights);
          }
        },
        onError() {
          if (rafId !== null) cancelAnimationFrame(rafId);
          rafId = null;
        },
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.role === "assistant" && !last.content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setStreaming(false);
    }
  }, [input, streaming, currentFilename, getMarkdown, onHighlights]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Focus input when panel opens
  useEffect(() => {
    if (expanded) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [expanded]);

  // Expose focusInput for "Reply" from highlight popover
  useEffect(() => {
    (window as any).__chatFocus = (prefill?: string) => {
      handleSetExpanded(true);
      if (prefill) setInput(prefill);
    };
    return () => { (window as any).__chatFocus = undefined; };
  }, [handleSetExpanded]);

  // Expose auto-send for voice recording
  useEffect(() => {
    (window as any).__chatAutoSend = () => {
      handleSend();
    };
    return () => { (window as any).__chatAutoSend = undefined; };
  }, [handleSend]);

  // Voice recording via long-press
  const [recording, setRecording] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognitionRef = useRef<any>(null);
  const didLongPress = useRef(false);

  const startRecording = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    let transcript = "";
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
    };
    recognition.onend = () => {
      setRecording(false);
      if (transcript.trim()) {
        handleSetExpanded(true);
        setTimeout(() => {
          const text = transcript.trim();
          setInput(text);
          inputValueRef.current = text;
          setTimeout(() => {
            (window as any).__chatAutoSend?.();
          }, 50);
        }, 100);
      }
    };
    recognition.onerror = () => {
      setRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  }, [handleSetExpanded]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
  }, []);

  const makeOrbHandlers = useCallback((clickAction: () => void) => ({
    onPointerDown: () => {
      didLongPress.current = false;
      longPressTimer.current = setTimeout(() => {
        didLongPress.current = true;
        startRecording();
      }, 400);
    },
    onPointerUp: () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
      if (recording) {
        stopRecording();
      } else if (!didLongPress.current) {
        clickAction();
      }
    },
    onPointerLeave: () => {
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
    },
  }), [startRecording, stopRecording, recording]);

  const fabHandlers = makeOrbHandlers(() => handleSetExpanded(true));
  const miniOrbHandlers = makeOrbHandlers(() => handleSetExpanded(false));

  if (!expanded) {
    return (
      <button
        className={`chat-fab ${recording ? "chat-fab-recording" : ""}`}
        {...fabHandlers}
        aria-label={recording ? "Recording..." : "Open assistant"}
      />
    );
  }

  return (
    <div className="chat-card">
      <div className="chat-messages">
        {!loaded ? (
          <div className="chat-loading">Loading...</div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">Ask me anything about your writing.</div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "chat-msg-user" : "chat-msg-assistant"}>
              <div className="chat-msg-text">{msg.content || (streaming && i === messages.length - 1 ? "..." : "")}</div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
      <div className="chat-input-area">
        <button
          className={`chat-mini-orb ${recording ? "chat-fab-recording" : ""}`}
          {...miniOrbHandlers}
          aria-label={recording ? "Recording..." : "Minimize assistant"}
        />
        <input
          ref={inputRef}
          className="chat-input"
          type="text"
          placeholder={streaming ? "Thinking..." : "Ask about your writing..."}
          value={input}
          onChange={(e) => { setInput(e.target.value); inputValueRef.current = e.target.value; }}
          onKeyDown={handleKeyDown}
          disabled={streaming}
        />
      </div>
    </div>
  );
}

// ── Icons ──────────────────────────────────────────────────────

const SaveIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const FolderIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const SunIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="3" />
    <line x1="12" y1="21" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="3" y2="12" />
    <line x1="21" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

// ── Main App ───────────────────────────────────────────────────

// ── Login Page ─────────────────────────────────────────────
function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setError(err.message || "Sign in failed");
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <h1 className="login-title">WRITER</h1>
        <p className="login-subtitle">An AI-guided writing tool</p>
        <button className="login-google-btn" onClick={handleGoogleLogin} disabled={loading}>
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          {loading ? "Signing in..." : "Continue with Google"}
        </button>
        {error && <p className="login-error">{error}</p>}
      </div>
    </div>
  );
}

function App() {
  // Auth state
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authConfigured, setAuthConfigured] = useState(false);
  const [currentPostId, setCurrentPostId] = useState<string | null>(null);

  // Authenticated fetch helper
  const authFetch = useCallback((url: string, options?: RequestInit) => {
    const headers = new Headers(options?.headers);
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
    if (!headers.has("Content-Type") && options?.method === "POST") {
      headers.set("Content-Type", "application/json");
    }
    return fetch(url, { ...options, headers });
  }, [session]);

  useEffect(() => {
    let sub: { unsubscribe: () => void } | null = null;

    (async () => {
      const sb = await getSupabase();
      setAuthConfigured(!!sb);

      if (sb) {
        const s = await getSession();
        setSession(s);
        sub = await onAuthStateChange((s) => {
          setSession(s);
          setAuthLoading(false);
        });
      }
      setAuthLoading(false);
    })();

    return () => { sub?.unsubscribe(); };
  }, []);

  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
  );
  const [currentFilename, setCurrentFilename] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const shortcutsRef = useRef<HTMLDivElement>(null);

  // Tabs — writing + agent scratchpad
  const TAB_COLORS = [
    { key: "writing", hex: "#e07a5f", label: "Writing" },
    { key: "scratchpad", hex: "#6b9e7a", label: "Scratchpad" },
  ];
  const TAB_KEYS = TAB_COLORS.map((t) => t.key);
  const EMPTY_PAGES: Record<string, string> = { writing: "", scratchpad: "" };

  const [pages, setPages] = useState<Record<string, string>>(EMPTY_PAGES);
  const [activeTab, setActiveTab] = useState("writing");
  const pagesRef = useRef<Record<string, string>>(EMPTY_PAGES);
  const activeTabRef = useRef("writing");
  const switchingRef = useRef(false);
  const initialLoadDone = useRef(false);

  // Highlights state
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [activeHighlight, setActiveHighlight] = useState<Highlight | null>(null);
  const [popoverRect, setPopoverRect] = useState<DOMRect | null>(null);
  const highlightsRef = useRef<Highlight[]>([]);

  const handleHighlightClick = useCallback((highlight: Highlight, rect: DOMRect) => {
    setActiveHighlight(highlight);
    setPopoverRect(rect);
  }, []);

  const [highlightExtension] = useState(() =>
    createHighlightExtension(highlightsRef, handleHighlightClick)
  );

  const addHighlights = useCallback((newHighlights: Highlight[]) => {
    setHighlights((prev) => {
      const active = prev.filter((h) => !h.dismissed);
      const updated = [...active, ...newHighlights];
      highlightsRef.current = updated;
      return updated;
    });
  }, []);

  const dismissHighlight = useCallback((highlightId: string) => {
    setHighlights((prev) => {
      const updated = prev.map((h) => (h.id === highlightId ? { ...h, dismissed: true } : h));
      highlightsRef.current = updated;
      return updated;
    });
    setActiveHighlight(null);
    setPopoverRect(null);
  }, []);

  const clearHighlight = useCallback(() => {
    setActiveHighlight(null);
    setPopoverRect(null);
  }, []);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Markdown,
      Placeholder.configure({ placeholder: "Start writing..." }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        defaultProtocol: "https",
      }),
      highlightExtension,
    ],
    editorProps: {
      clipboardTextParser(text: string, $context: any, plainText: boolean) {
        if (plainText || !looksLikeMarkdown(text)) return null;
        const parsed = (editor as any)?.markdown?.parse(text);
        if (!parsed?.content) return null;
        try {
          const doc = editor!.schema.nodeFromJSON(parsed);
          return new Slice(doc.content, 0, 0);
        } catch {
          return null;
        }
      },
    },
    content: "",
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      if (switchingRef.current) return;
      setWordCount(getWordCount(ed.getText()));
      const text = ed.getText();
      const md = text.trim().length > 0 ? (ed as any).getMarkdown() : "";
      const tab = activeTabRef.current;
      setPages((prev) => {
        const next = { ...prev, [tab]: md };
        pagesRef.current = next;
        return next;
      });
    },
  });

  // Sync highlights when they change
  useEffect(() => {
    if (editor) {
      editor.view.dispatch(editor.state.tr);
    }
  }, [editor, highlights]);

  // Theme
  useEffect(() => {
    document.body.classList.remove("light", "dark");
    document.body.classList.add(theme);
  }, [theme]);

  // Close shortcuts popover on outside click
  useEffect(() => {
    if (!shortcutsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (shortcutsRef.current && !shortcutsRef.current.contains(e.target as Node)) {
        setShortcutsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [shortcutsOpen]);

  // Load most recent post on startup (runs only once)
  useEffect(() => {
    if (authLoading || !editor || initialLoadDone.current) return;
    initialLoadDone.current = true;
    authFetch("/api/posts")
      .then((r) => r.json())
      .then((posts) => {
        if (posts.length > 0) {
          const most = posts[0];
          authFetch(`/api/load/${encodeURIComponent(most.filename || most.id)}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.content && editor) {
                const freshPages = { writing: data.content, scratchpad: data.scratchpad || "" };
                setPages(freshPages);
                pagesRef.current = freshPages;
                switchingRef.current = true;
                editor.commands.setContent(data.content, { contentType: "markdown" });
                setTimeout(() => { switchingRef.current = false; }, 50);
                setWordCount(getWordCount(editor.getText()));
                setCurrentFilename(most.filename || most.id);
                setCurrentPostId(most.id || null);
              }
            });
        }
      })
      .catch(() => {});
  }, [editor, authLoading, authFetch]);

  // Tab switching
  const handleTabChange = useCallback((key: string) => {
    if (!editor || key === activeTab) return;
    switchingRef.current = true;
    // Save current tab content
    const text = editor.getText();
    const md = text.trim().length > 0 ? (editor as any).getMarkdown() : "";
    setPages((prev) => {
      const next = { ...prev, [activeTab]: md };
      pagesRef.current = next;
      return next;
    });
    // Switch to new tab
    setActiveTab(key);
    activeTabRef.current = key;
    const newContent = pagesRef.current[key] || "";
    editor.commands.setContent(newContent, { contentType: "markdown" });
    setWordCount(getWordCount(editor.getText()));
    // Clear highlights when switching tabs
    highlightsRef.current = [];
    setHighlights([]);
    setTimeout(() => { switchingRef.current = false; }, 50);
  }, [editor, activeTab]);

  const getMarkdown = useCallback((): string => {
    if (!editor) return "";
    const text = editor.getText();
    const currentMd = text.trim().length > 0 ? (editor as any).getMarkdown() : "";
    const allPages = { ...pagesRef.current, [activeTabRef.current]: currentMd };
    // Return writing tab content (assistant also gets scratchpad via the endpoint)
    return allPages.writing || "";
  }, [editor]);

  const getPages = useCallback((): Record<string, string> => {
    if (!editor) return pagesRef.current;
    const text = editor.getText();
    const currentMd = text.trim().length > 0 ? (editor as any).getMarkdown() : "";
    return { ...pagesRef.current, [activeTabRef.current]: currentMd };
  }, [editor]);

  const handleSave = async () => {
    if (saveStatus === "saving" || !editor) return;

    // Save current editor content to pages first
    const text = editor.getText();
    const currentMd = text.trim().length > 0 ? (editor as any).getMarkdown() : "";
    const currentPages = { ...pagesRef.current, [activeTabRef.current]: currentMd };
    pagesRef.current = currentPages;

    const markdown = currentPages.writing || "";
    const title = markdown.match(/^#\s+(.+)$/m)?.[1] || "untitled";
    const filename = title.toLowerCase().replace(/\s+/g, "-");
    const html = await marked(markdown);
    const scratchpad = currentPages.scratchpad || "";

    setSaveStatus("saving");
    try {
      const response = await authFetch("/api/save", {
        method: "POST",
        body: JSON.stringify({
          filename,
          markdown,
          html,
          scratchpad,
          highlights: highlightsRef.current,
          existingFilename: currentFilename,
          postId: currentPostId,
        }),
      });
      const result = await response.json();
      if (result.success) {
        setCurrentFilename(result.filename || result.postId);
        if (result.postId) setCurrentPostId(result.postId);
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  // Autosave: save 3 seconds after the user stops typing
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editor || saveStatus === "saving") return;
    // Only autosave if there's actual content and a change happened
    const text = editor.getText().trim();
    if (!text) return;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (saveStatus !== "saving") {
        handleSave();
      }
    }, 3000);

    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [pages]); // triggers on every keystroke via onUpdate -> setPages

  // Keyboard shortcuts
  const [chatOpen, setChatOpen] = useState(false);
  const clearChatRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Cmd+S / Ctrl+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+[ / Ctrl+] to switch tabs
      if (e.ctrlKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        const keys = TAB_KEYS;
        const idx = keys.indexOf(activeTabRef.current);
        if (e.key === "[" && idx > 0) {
          handleTabChange(keys[idx - 1]);
        } else if (e.key === "]" && idx < keys.length - 1) {
          handleTabChange(keys[idx + 1]);
        }
      }
    };
    // Ctrl+/ to toggle assistant
    const handleAssistantToggle = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "/") {
        e.preventDefault();
        e.stopPropagation();
        setChatOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKey);
    document.addEventListener("keydown", handleAssistantToggle, true); // capture phase
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("keydown", handleAssistantToggle, true);
    };
  }, [handleSave, handleTabChange]);

  const openLoadModal = async () => {
    try {
      const response = await authFetch("/api/posts");
      const data = await response.json();
      setPosts(data);
      setShowLoadModal(true);
    } catch {}
  };

  const loadPost = async (filename: string, id?: string) => {
    try {
      const loadId = id || filename;
      const response = await authFetch(`/api/load/${encodeURIComponent(loadId)}`);
      const data = await response.json();
      if (data.content && editor) {
        const freshPages = { writing: data.content, scratchpad: data.scratchpad || "" };
        setPages(freshPages);
        pagesRef.current = freshPages;
        setActiveTab("writing");
        activeTabRef.current = "writing";
        switchingRef.current = true;
        editor.commands.setContent(data.content, { contentType: "markdown" });
        setTimeout(() => { switchingRef.current = false; }, 50);
        setWordCount(getWordCount(editor.getText()));
        setCurrentFilename(loadId);
        setCurrentPostId(id || null);
        setShowLoadModal(false);
        // Restore highlights from saved post
        if (data.highlights && data.highlights.length > 0) {
          highlightsRef.current = data.highlights;
          setHighlights(data.highlights);
        } else {
          highlightsRef.current = [];
          setHighlights([]);
        }
      }
    } catch {}
  };

  const handleNewPost = () => {
    if (!editor) return;
    const freshPages = { writing: "", scratchpad: "" };
    setPages(freshPages);
    pagesRef.current = freshPages;
    setActiveTab("writing");
    activeTabRef.current = "writing";
    switchingRef.current = true;
    editor.commands.clearContent();
    editor.commands.setNode("paragraph");
    editor.commands.focus("start");
    setTimeout(() => { switchingRef.current = false; }, 50);
    setWordCount(0);
    setCurrentFilename(null);
    setCurrentPostId(null);
    highlightsRef.current = [];
    setHighlights([]);
  };

  // Highlight popover handlers
  const handleAcceptEdit = useCallback(
    (highlight: Highlight) => {
      if (!editor || !highlight.suggestedEdit) return;
      const flatText = getDocFlatText(editor.state.doc);
      const idx = flatText.indexOf(highlight.matchText);
      if (idx !== -1) {
        const from = flatOffsetToPos(editor.state.doc, idx);
        const to = flatOffsetToPos(editor.state.doc, idx + highlight.matchText.length);
        if (from.found && to.found) {
          editor.chain().focus().insertContentAt({ from: from.pos, to: to.pos }, highlight.suggestedEdit).run();
        }
      }
      dismissHighlight(highlight.id);
    },
    [editor, dismissHighlight]
  );

  const handleReply = useCallback(
    (highlight: Highlight) => {
      const prefill = `Re: "${highlight.matchText.slice(0, 50)}${highlight.matchText.length > 50 ? "..." : ""}" — `;
      (window as any).__chatFocus?.(prefill);
      clearHighlight();
    },
    [clearHighlight]
  );

  const handleDismissHighlight = useCallback(
    (id?: string) => {
      if (id) {
        dismissHighlight(id);
      } else {
        clearHighlight();
      }
    },
    [dismissHighlight, clearHighlight]
  );

  const [barVisible, setBarVisible] = useState(true);
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  const modKey = isMac ? "Cmd" : "Ctrl";

  // Auth gate — show login if Supabase is configured and no session
  if (authLoading) {
    return <div className="login-page"><div className="login-card"><p className="login-subtitle">Loading...</p></div></div>;
  }
  if (!session && authConfigured) {
    return <LoginPage />;
  }

  return (
    <div className="page">
      {/* Toggle for settings bar */}
      <button
        className={`bar-toggle ${barVisible ? "" : "bar-toggle-hidden"}`}
        onClick={() => setBarVisible((v) => !v)}
        aria-label={barVisible ? "Hide toolbar" : "Show toolbar"}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {barVisible ? (
            <><line x1="4" y1="5" x2="12" y2="5" /><line x1="4" y1="8" x2="12" y2="8" /><line x1="4" y1="11" x2="12" y2="11" /></>
          ) : (
            <><line x1="4" y1="5" x2="12" y2="5" /><line x1="4" y1="8" x2="12" y2="8" /><line x1="4" y1="11" x2="12" y2="11" /></>
          )}
        </svg>
      </button>
      {/* Settings bar */}
      <div className={`settings-bar ${barVisible ? "" : "settings-bar-hidden"}`}>
        <span className="brand-label">WRITER</span>
        <div className="settings-right">
          <span className="word-count">
            {wordCount} {wordCount === 1 ? "word" : "words"}
          </span>
          <button className="settings-btn" onClick={handleNewPost} title="New post">
            <PlusIcon />
          </button>
          <button className="settings-btn" onClick={openLoadModal} title="Load post">
            <FolderIcon />
          </button>
          <button
            className={`settings-btn ${saveStatus === "saved" ? "save-success" : ""} ${saveStatus === "error" ? "save-error" : ""}`}
            onClick={handleSave}
            title="Save"
            disabled={saveStatus === "saving"}
          >
            {saveStatus === "saved" ? <CheckIcon /> : <SaveIcon />}
          </button>

          {/* Shortcuts */}
          <div className="shortcuts-wrap" ref={shortcutsRef}>
            <button className="settings-btn" onClick={() => setShortcutsOpen((v) => !v)} title="Shortcuts">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </button>
            {shortcutsOpen && (
              <div className="shortcuts-popover">
                <div className="shortcuts-section">
                  <div className="shortcuts-section-title">Shortcuts</div>
                  <div className="shortcut-row"><kbd>Ctrl+/</kbd><span>Toggle assistant</span></div>
                  <div className="shortcut-row"><kbd>Ctrl+[</kbd><span>Previous tab</span></div>
                  <div className="shortcut-row"><kbd>Ctrl+]</kbd><span>Next tab</span></div>
                  <div className="shortcut-row"><kbd>{modKey}+S</kbd><span>Save</span></div>
                  <div className="shortcut-row"><kbd>{modKey}+B</kbd><span>Bold</span></div>
                  <div className="shortcut-row"><kbd>{modKey}+I</kbd><span>Italic</span></div>
                  <div className="shortcut-row"><kbd>{modKey}+Z</kbd><span>Undo</span></div>
                  <div className="shortcut-row"><kbd>{modKey}+Shift+Z</kbd><span>Redo</span></div>
                </div>
                <div className="shortcuts-section">
                  <div className="shortcuts-section-title">Markdown</div>
                  <div className="shortcut-row"><code># </code><span>Heading</span></div>
                  <div className="shortcut-row"><code>**text**</code><span>Bold</span></div>
                  <div className="shortcut-row"><code>*text*</code><span>Italic</span></div>
                  <div className="shortcut-row"><code>~~text~~</code><span>Strikethrough</span></div>
                  <div className="shortcut-row"><code>`code`</code><span>Inline code</span></div>
                  <div className="shortcut-row"><code>&gt; </code><span>Blockquote</span></div>
                  <div className="shortcut-row"><code>- </code><span>Bullet list</span></div>
                  <div className="shortcut-row"><code>1. </code><span>Numbered list</span></div>
                  <div className="shortcut-row"><code>---</code><span>Divider</span></div>
                  <div className="shortcut-row"><code>[text](url)</code><span>Link</span></div>
                </div>
              </div>
            )}
          </div>

          <button
            className="settings-btn clear-chat-btn"
            onClick={() => {
              if (clearChatRef.current && confirm("Clear assistant conversation? This can't be undone.")) {
                clearChatRef.current();
              }
            }}
            title="Clear assistant chat"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
              <line x1="18" y1="9" x2="12" y2="15" />
              <line x1="12" y1="9" x2="18" y2="15" />
            </svg>
          </button>

          <button className="settings-btn" onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))} title="Toggle theme">
            {theme === "light" ? <MoonIcon /> : <SunIcon />}
          </button>

          {session && (
            <button className="settings-btn" onClick={() => signOut()} title={`Sign out (${session.user?.email})`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16,17 21,12 16,7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Scroll area with editor */}
      <div className="scroll-area">
        {/* Page tabs */}
        <div className="page-tabs">
          {TAB_COLORS.map(({ key, hex }) => {
            const isActive = key === activeTab;
            const hasContent = !!(pages[key] && pages[key].trim());
            const cls = [
              "page-tab",
              isActive ? "page-tab-active" : "",
              !isActive && !hasContent ? "page-tab-empty" : "",
            ].filter(Boolean).join(" ");
            return (
              <button
                key={key}
                className={cls}
                style={{ backgroundColor: hex }}
                onClick={() => handleTabChange(key)}
                aria-label={`${key} tab`}
              />
            );
          })}
        </div>
        <div className="content">
          <div className="editor-wrap">
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Highlight popover — inside scroll-area so it scrolls with content */}
        <HighlightPopover
          highlight={activeHighlight}
          rect={popoverRect}
          onDismiss={handleDismissHighlight}
          onAcceptEdit={handleAcceptEdit}
          onReply={handleReply}
        />
      </div>

      {/* Chat panel */}
      <ChatPanel
        getMarkdown={getMarkdown}
        currentFilename={currentFilename}
        postId={currentPostId}
        onHighlights={addHighlights}
        expanded={chatOpen}
        onToggle={setChatOpen}
        session={session}
        authFetch={authFetch}
        clearChatRef={clearChatRef}
      />

      {/* Load modal */}
      {showLoadModal && (
        <div className="modal-overlay" onClick={() => setShowLoadModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>LOAD POST</h2>
              <button className="modal-close" onClick={() => setShowLoadModal(false)}>&times;</button>
            </div>
            <div className="modal-content">
              {posts.length === 0 ? (
                <p className="modal-empty">No saved posts yet</p>
              ) : (
                <ul className="post-list">
                  {posts.map((post) => (
                    <li key={post.id || post.filename} className="post-item" onClick={() => loadPost(post.filename, post.id)}>
                      <span className="post-name">{post.name}</span>
                      <span className="post-date">{post.date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
