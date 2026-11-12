"""Small LangGraph agent for explaining A-share research data."""

from __future__ import annotations

import json
import logging
import re
from typing import Annotated, TypedDict

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode

from ..config import settings
from ..tools import ALL_TOOLS

logger = logging.getLogger(__name__)
_agent_app = None


class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    final_answer: str


SYSTEM_PROMPT = """你是一个 A 股研究助手。

规则：
1. 涉及股票、指数、板块、行情、财务、热度或异动等具体数据时，必须先调用工具。
2. 用户只提供名称或不完整代码时，先用搜索工具消歧。
3. 只能使用工具返回的数据，不得编造价格、涨跌幅、财务数字或报告期。
4. 工具无数据或失败时，明确说明原因，不要用常识补齐结果。
5. 解释指标时要区分报告期、行情时间和抓取时间。
6. 回答投资判断时说明“仅供研究参考，不构成投资建议”。
"""


def _payload(message: ToolMessage) -> dict | None:
    try:
        value = json.loads(message.content)
    except (TypeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _instrument_ids(value: object) -> set[str]:
    if isinstance(value, dict):
        found: set[str] = set()
        for key, item in value.items():
            if key in {"thscode", "ticker", "code", "security_code"}:
                match = re.search(r"(?<!\d)\d{6}(?:\.(?:SH|SZ|BJ|TI))?(?!\d)", str(item or "").upper())
                if match:
                    found.add(match.group(0))
            found.update(_instrument_ids(item))
        return found
    if isinstance(value, list):
        found: set[str] = set()
        for item in value:
            found.update(_instrument_ids(item))
        return found
    return set()


def _evidence(messages: list[BaseMessage]) -> dict:
    tools: list[str] = []
    records: list[dict] = []
    for message in messages:
        if isinstance(message, AIMessage):
            tools.extend(call.get("name", "") for call in (message.tool_calls or []) if call.get("name"))
        elif isinstance(message, ToolMessage):
            payload = _payload(message)
            name = getattr(message, "name", None) or "unknown"
            record = {
                "tool": name,
                "status": "error" if not payload or payload.get("error") else "ok",
                "source": (payload or {}).get("source", "Fuyao/HiThink"),
                "as_of": next(((payload or {}).get(key) for key in ("as_of", "trade_date", "report_date", "date") if (payload or {}).get(key)), None),
                "fetched_at": (payload or {}).get("fetched_at"),
                "instrument_ids": sorted(_instrument_ids(payload)),
                "result_ref": getattr(message, "tool_call_id", None),
            }
            if payload and payload.get("error"):
                record["error"] = str(payload["error"])
            records.append(record)
    return {
        "tools": list(dict.fromkeys(tools)),
        "data_sources": list(dict.fromkeys(record["source"] for record in records)),
        "has_tool_evidence": any(record["status"] == "ok" for record in records),
        "evidence": records,
    }


def _answer(messages: list[BaseMessage]) -> str:
    for message in reversed(messages):
        if isinstance(message, AIMessage) and isinstance(message.content, str) and message.content.strip():
            answer = message.content
            if "不构成投资建议" not in answer:
                answer += "\n\n以上数据仅供研究参考，不构成投资建议。"
            return answer
    return "抱歉，我无法处理这个问题。"


def _agent_node(llm_with_tools):
    def run(state: AgentState) -> dict:
        return {"messages": [llm_with_tools.invoke([SystemMessage(content=SYSTEM_PROMPT), *state["messages"]])]}
    return run


def create_market_agent():
    llm = ChatOpenAI(
        model=settings.OPENAI_MODEL,
        api_key=settings.OPENAI_API_KEY,
        base_url=settings.OPENAI_BASE_URL,
        temperature=0,
    )
    llm_with_tools = llm.bind_tools(ALL_TOOLS)
    workflow = StateGraph(AgentState)
    workflow.add_node("agent", _agent_node(llm_with_tools))
    workflow.add_node("tools", ToolNode(ALL_TOOLS))
    workflow.add_node("summary", lambda state: {"final_answer": _answer(state["messages"])})
    workflow.set_entry_point("agent")
    workflow.add_conditional_edges(
        "agent",
        lambda state: "tools" if getattr(state["messages"][-1], "tool_calls", None) else "summary",
        {"tools": "tools", "summary": "summary"},
    )
    workflow.add_edge("tools", "agent")
    workflow.add_edge("summary", END)
    return workflow.compile()


def get_market_agent():
    global _agent_app
    if _agent_app is None:
        _agent_app = create_market_agent()
    return _agent_app


async def query_market_with_audit(question: str) -> dict:
    result = await get_market_agent().ainvoke(
        {"messages": [HumanMessage(content=question)]},
        config={"recursion_limit": 10},
    )
    messages = result.get("messages", [])
    return {"answer": result.get("final_answer", _answer(messages)), "tool_audit": _evidence(messages)}
