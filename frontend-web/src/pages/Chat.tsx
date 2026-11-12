import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send, Trash2, User } from "lucide-react";
import { api, type JsonMap } from "../api";
import { ErrorState, Loading } from "../components";

type ToolAudit = {
  tools?: string[];
  data_sources?: string[];
  has_tool_evidence?: boolean;
  evidence?: Array<{
    tool: string;
    source: string;
    status: "ok" | "error";
    as_of?: string | number | null;
    fetched_at?: string | null;
    key_fields?: Record<string, string | number>;
    result_ref?: string | null;
    error?: string | null;
  }>;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  toolAudit?: ToolAudit;
};

function ToolAuditBar({ audit }: { audit?: ToolAudit }) {
  if (!audit) return null;

  const sources = audit.data_sources?.length ? audit.data_sources.join(" / ") : "无";
  const tools = audit.tools?.length ? audit.tools.join(" / ") : "未调用工具";

  return (
    <div className="tool-audit">
      <span>数据源：{sources}</span>
      <span>工具：{tools}</span>
      <span>{audit.has_tool_evidence ? "已取得工具返回" : "本轮无工具返回"}</span>
      {audit.evidence?.map((item) => {
        const fields = Object.entries(item.key_fields || {}).map(([key, value]) => `${key}: ${value}`).join("，");
        const detail = item.status === "error"
          ? item.error || "工具调用失败"
          : [item.as_of ? `截至 ${item.as_of}` : "", fields, item.result_ref ? `引用 ${item.result_ref}` : ""].filter(Boolean).join(" / ");
        return <span key={`${item.tool}-${item.result_ref || detail}`}>{item.status === "ok" ? "证据" : "失败"}：{item.source} / {detail || item.tool}</span>;
      })}
    </div>
  );
}

export function Chat() {
  const [messages, setMessages] = useState<Message[]>(() => JSON.parse(sessionStorage.getItem("market-chat") || "[]"));
  const [question, setQuestion] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: (text: string) => api.post<JsonMap>("/chat", { question: text }, 180_000),
    onSuccess: (data) =>
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: data.answer,
          toolAudit: data.tool_audit,
        },
      ]),
  });

  useEffect(() => {
    sessionStorage.setItem("market-chat", JSON.stringify(messages));
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const text = question.trim();
    if (!text || mutation.isPending) return;
    setMessages((current) => [...current, { role: "user", content: text }]);
    setQuestion("");
    mutation.mutate(text);
  }

  return (
    <div className="page chat-page">
      <div className="page-title">
        <div>
          <span className="eyebrow">AGENT</span>
          <h1>智能助手</h1>
          <p>金融数据问题会由 LangGraph Agent 调用工具验证</p>
        </div>
        <button className="icon-button" type="button" aria-label="清空对话" title="清空对话" onClick={() => setMessages([])}>
          <Trash2 size={17} aria-hidden="true" />
        </button>
      </div>

      <div className="chat-shell">
        <div className="messages">
          {messages.length === 0 && (
            <div className="welcome-state">
              <Bot size={28} aria-hidden="true" />
              <strong>从一个具体问题开始</strong>
              <span>例如：分析 600519.SH 最近的财务表现</span>
              <div className="suggestions">
                {["贵州茅台最近财务表现如何？", "机器人概念有哪些股票？", "查看 600519.SH 最近行情"].map((item) => (
                  <button key={item} onClick={() => setQuestion(item)}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message, index) => (
            <div className={`message ${message.role}`} key={index}>
              <div className="avatar">{message.role === "user" ? <User size={16} aria-hidden="true" /> : <Bot size={16} aria-hidden="true" />}</div>
              <div className="message-body">
                <div className="message-content">{message.content}</div>
                {message.role === "assistant" && <ToolAuditBar audit={message.toolAudit} />}
              </div>
            </div>
          ))}

          {mutation.isPending && (
            <div className="message assistant">
              <div className="avatar">
                <Bot size={16} aria-hidden="true" />
              </div>
              <Loading label="Agent 正在调用数据工具" />
            </div>
          )}
          {mutation.error && <ErrorState error={mutation.error} />}
          <div ref={endRef} />
        </div>

        <form className="chat-input" onSubmit={submit}>
          <label className="sr-only" htmlFor="chat-question">问题</label>
          <textarea
            id="chat-question"
            name="question"
            autoComplete="off"
            rows={2}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(event);
              }
            }}
            placeholder="输入股票、指数或财务问题…"
          />
          <button className="primary icon-button" aria-label="发送" title="发送" disabled={!question.trim() || mutation.isPending}>
            <Send size={18} aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}
