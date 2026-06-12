"use client";

import { useCallback, useEffect, useState } from "react";
import type { Message } from "@/lib/types";

export function useThreadChat(questionId: string | null) {
  const [messagesState, setMessagesState] = useState<{ questionId: string | null; messages: Message[] }>({
    questionId: null,
    messages: [],
  });
  const [includeWebState, setIncludeWebState] = useState<{ questionId: string | null; includeWeb: boolean }>({
    questionId: null,
    includeWeb: false,
  });
  const [streaming, setStreaming] = useState(false);
  const [streamBuffer, setStreamBuffer] = useState("");

  const messages =
    questionId && messagesState.questionId === questionId ? messagesState.messages : [];
  const includeWeb =
    questionId && includeWebState.questionId === questionId ? includeWebState.includeWeb : false;

  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;
    fetch(`/api/questions/${questionId}/messages`)
      .then((r) => r.json())
      .then((msgs: Message[]) => {
        if (!cancelled) setMessagesState({ questionId, messages: msgs });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [questionId]);

  useEffect(() => {
    if (!questionId) return;
    let cancelled = false;
    fetch(`/api/questions/${questionId}`)
      .then((r) => r.json())
      .then((q: { includeWeb?: boolean }) => {
        if (!cancelled) {
          setIncludeWebState({ questionId, includeWeb: q.includeWeb === true });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [questionId]);

  const patchIncludeWeb = useCallback(async (enabled: boolean) => {
    if (!questionId) return;
    const res = await fetch(`/api/questions/${questionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeWeb: enabled }),
    });
    if (res.ok) setIncludeWebState({ questionId, includeWeb: enabled });
  }, [questionId]);

  const streamMessage = useCallback(async (content: string) => {
    if (!questionId) return;
    const userMsg: Message = {
      id: crypto.randomUUID(),
      questionId,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessagesState((prev) => ({
      questionId,
      messages: [...(prev.questionId === questionId ? prev.messages : []), userMsg],
    }));
    setStreaming(true);
    setStreamBuffer("");

    const res = await fetch(`/api/questions/${questionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });

    if (!res.ok || !res.body) {
      setStreaming(false);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      full += decoder.decode(value);
      setStreamBuffer(full);
    }

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      questionId,
      role: "assistant",
      content: full,
      createdAt: new Date().toISOString(),
    };
    setMessagesState((prev) => ({
      questionId,
      messages: [...(prev.questionId === questionId ? prev.messages : []), assistantMsg],
    }));
    setStreamBuffer("");
    setStreaming(false);
  }, [questionId]);

  const resetMessages = useCallback(() => {
    setMessagesState({ questionId: null, messages: [] });
    setStreamBuffer("");
  }, []);

  const setIncludeWebForQuestion = useCallback((qid: string, enabled: boolean) => {
    setIncludeWebState({ questionId: qid, includeWeb: enabled });
  }, []);

  return {
    messages,
    includeWeb,
    streaming,
    streamBuffer,
    streamMessage,
    patchIncludeWeb,
    resetMessages,
    setIncludeWebForQuestion,
    setMessagesState,
  };
}
