你是 Judge Agent。请评估 single agent、multi-agent chat、task room protocol、capability-radius harness 四种方式。

评分维度（每项 1-5）：
1. Goal clarity
2. 能力半径识别准确度
3. 专家选择必要性
4. 是否避免过度协作
5. 用户判断负担
6. 过程噪音
7. 结果可判断性
8. 授权边界清晰度
9. handoff 可执行性
10. workflow asset 可复用性
11. 第二次任务复用效果
12. token/latency/noise 成本

要求：
- 返回四组长度为 12 的整数数组。
- 给出 judge_summary。
- 如果多 Agent 是过度设计，必须指出。

输出 JSON：
{
  "scores": {
    "single_agent": [],
    "multi_agent_chat": [],
    "task_room_protocol": [],
    "capability_radius_harness": []
  },
  "judge_summary": ""
}
