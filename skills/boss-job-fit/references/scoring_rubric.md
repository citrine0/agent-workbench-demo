# 岗位匹配评分规则

总分 100。

## 分项

- 核心能力匹配，30 分：岗位要求与简历中的已验证技能、项目、产品判断是否一致。
- 领域/产品方向匹配，20 分：是否与 Agent、workflow、AI coding、collaboration harness、human-in-the-loop 等方向一致。
- 资历与职责匹配，15 分：候选人过往产物是否能支撑岗位 seniority、ownership 和跨职能要求。
- 约束匹配，15 分：城市、薪资、行业、公司阶段、远程/通勤偏好。
- 证据强度，10 分：推荐理由是否能被简历或作品集中的真实证据支撑。
- 风险扣分，10 分：硬性要求缺失、方向偏离、职责过窄、需要编造经历才能匹配等。

## 输出要求

每个岗位必须输出：

- `score`
- `score_breakdown`
- `why`
- `resume_evidence`
- `gaps`
- `risk_flags`
- `recommended_action`

## 不确定性

如果岗位 JD 信息不足，不要给高分。标记 `insufficient_jd_detail`，并建议用户确认详情。

