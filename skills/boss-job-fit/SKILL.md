---
name: boss-job-fit
description: 当用户需要在 Agent Collaboration Demo 的求职示例中，通过本机只读 boss-agent-cli 连接器获取 BOSS 直聘岗位与 JD，并完成岗位标准化、匹配打分、简历证据映射、风险边界和人工确认面板时使用。不得用于自动投递、批量打招呼、联系招聘方、绕过验证码、伪造简历经历或未经授权抓取数据。
---

# BOSS 岗位匹配 Skill

## 定位

这是 Example A 的注册 workflow skill，不是单独的 BOSS CLI 包装器。

它把稳定求职流程固化为一个可审计能力包：

1. 通过 `boss-agent-cli` 只读获取岗位列表和 JD。
2. 将岗位标准化为统一 schema。
3. 根据候选人画像、简历证据和约束打分。
4. 输出 Top jobs checkpoint、证据映射、缺口和禁止动作。

`boss-agent-cli` 只是底层 connector。`boss-job-fit` 负责完整 job-fit workflow。

## 适用场景

- 用户要展示 Agent Collaboration Harness 的 Auto-JobHunter / Job 示例。
- 用户要获取 BOSS 岗位和 JD，然后进行匹配打分。
- 用户要把“稳定任务走 skill，不稳定判断走 agent/human checkpoint”的产品叙事落成可执行流程。

## 禁止场景

- 自动投递。
- 自动联系招聘方。
- 批量打招呼或批量沟通。
- 绕过验证码、登录限制或风控。
- 编造简历经历、指标、项目成果。
- 保存未经用户确认的原始简历全文或原始私密沟通。

遇到登录失效、验证码、风控或权限问题时，停止并让用户处理。

## 输入

最小输入：

- `keyword`：岗位关键词。
- `city`：城市。
- `limit`：最多读取多少个岗位。
- `resume_text` 或 `candidate_profile`：候选人简历/画像。
- `candidate_constraints`：薪资、城市、行业、岗位方向、远程/通勤等偏好。

可选输入：

- `source`：`sample` 或 `boss-agent-cli`。
- `jobs_file`：已有岗位 JSON，用于离线复现。
- `boss_data_dir`：`boss-agent-cli` 登录态目录，demo 默认 `agent-collaboration-demo/.boss-agent-data`。
- `boss_cdp_url`：Chrome CDP 地址，推荐 `http://localhost:9222`。

## 输出

统一输出为 JSON：

- `normalized_jobs`
- `ranked_jobs`
- `score_breakdown`
- `resume_evidence_map`
- `top_jobs_checkpoint`
- `blocked_actions`
- `human_checkpoints`
- `source_metadata`

## 默认执行方式

优先使用脚本入口：

```bash
python3 agent-collaboration-demo/skills/boss-job-fit/scripts/run_workflow.py \
  --source sample \
  --keyword "AI产品经理" \
  --city "上海" \
  --limit 5 \
  --resume-file /path/to/resume.md \
  --output output/boss_job_fit_result.json
```

接真实 BOSS connector 时：

### 推荐：Chrome CDP 登录

`http://localhost:9222` 是 Chrome 调试接口，不是给用户看的网页。不要在 Codex preview 里打开它。真正登录页面是在 CDP Chrome 窗口中打开的 `https://www.zhipin.com`。

终端 1：启动独立 Chrome CDP 窗口：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/boss-chrome-profile
```

在这个 Chrome 窗口里打开并登录：

```text
https://www.zhipin.com
```

终端 2：保存并验证登录态：

```bash
cd /Users/ritawang/Documents/codex

agent-collaboration-demo/.venv-boss-agent-cli/bin/boss \
  --data-dir agent-collaboration-demo/.boss-agent-data \
  --cdp-url http://localhost:9222 \
  doctor

agent-collaboration-demo/.venv-boss-agent-cli/bin/boss \
  --data-dir agent-collaboration-demo/.boss-agent-data \
  --cdp-url http://localhost:9222 \
  login --cdp

agent-collaboration-demo/.venv-boss-agent-cli/bin/boss \
  --data-dir agent-collaboration-demo/.boss-agent-data \
  --cdp-url http://localhost:9222 \
  status
```

运行完整岗位/JD 获取与打分：

```bash
python3 agent-collaboration-demo/skills/boss-job-fit/scripts/run_workflow.py \
  --source boss-agent-cli \
  --keyword "AI产品经理" \
  --city "上海" \
  --limit 5 \
  --resume-file /Users/ritawang/Documents/codex/resume.md \
  --boss-data-dir agent-collaboration-demo/.boss-agent-data \
  --boss-cdp-url http://localhost:9222 \
  --output agent-collaboration-demo/output/boss_job_fit_result.json
```

执行期间建议保持 CDP Chrome 窗口打开。完成后再关闭。

### 离线 fallback

没有登录态或不需要真实岗位时：

```bash
cd /Users/ritawang/Documents/codex

python3 agent-collaboration-demo/skills/boss-job-fit/scripts/run_workflow.py \
  --source sample \
  --keyword "AI产品经理" \
  --city "上海" \
  --limit 5 \
  --resume-file /path/to/resume.md \
  --output output/boss_job_fit_result.json
```

## 工作流

1. 检查数据源。
   - `sample`：读取 `assets/sample_jobs.json`。
   - `jobs_file`：读取用户提供的 JSON。
   - `boss-agent-cli`：调用本机 `boss` 命令，只读搜索和详情，推荐使用 Chrome CDP 通道。
2. 标准化岗位字段。
3. 读取候选人简历或画像。
4. 根据评分规则计算总分和分项分数。
5. 生成证据映射和缺口。
6. 渲染 human checkpoint。
7. 输出 JSON 结果，供 demo 的 Result Surface 和 Memory Writeback Preview 使用。

## 评分规则

读取 `references/scoring_rubric.md`。

## 策略边界

读取 `references/policy.md`。

## Demo 集成建议

在 `capability_registry.json` 中注册为：

```json
{
  "skill_id": "boss_job_fit_skill",
  "label": "BOSS 岗位获取与匹配打分",
  "runtime_type": "external_cli_orchestrated_skill",
  "path": "auto_jobhunter",
  "inputs": ["keyword", "city", "limit", "resume_text", "candidate_constraints"],
  "outputs": ["normalized_jobs", "ranked_jobs", "score_breakdown", "resume_evidence_map", "top_jobs_checkpoint"],
  "allowed_actions": ["search_jobs", "read_job_detail", "rank_jobs", "map_resume_evidence"],
  "needs_approval": ["login_to_boss", "save_job_workflow_memory"],
  "blocked_actions": ["auto_apply", "contact_recruiter", "batch_greet", "bypass_captcha", "invent_resume_experience"]
}
```
