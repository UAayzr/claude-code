// 接口化精简版:删除了 8 个 few-shot 示例与 <reasoning> 教学块(原 9.3K),
// 保留「何时用/何时不用」决策规则与 content/activeForm 接口事实。
export const PROMPT = `Use this tool to create and manage a structured task list for your current coding session. This helps you track progress, organize complex tasks, and keep the user informed of overall progress.

## When to Use This Tool
Use this tool proactively in these scenarios:

1. Complex or multi-step tasks - When a task requires 3 or more distinct steps, or careful planning
2. User explicitly requests a todo list, or provides multiple tasks (numbered or comma-separated)
3. Immediately after receiving new instructions - Capture user requirements as todos and mark them in_progress BEFORE beginning work
4. After completing a task - Mark it completed immediately and add any follow-up tasks discovered during implementation

## When NOT to Use This Tool

Skip this tool when there is only a single, straightforward or trivial task, or when the task is purely conversational or informational — tracking it provides no organizational benefit. In that case you are better off just doing the task directly.

## Task States and Management

1. **States**: pending (not started) / in_progress (currently working — Exactly ONE at a time) / completed (finished)
2. **Task descriptions must have two forms** (both required):
   - content: The imperative form ("Run tests")
   - activeForm: The present continuous form ("Running tests")
3. **Update in real time**: mark tasks complete IMMEDIATELY after finishing (don't batch completions); remove tasks that are no longer relevant; complete current tasks before starting new ones
4. **Completion honesty**: ONLY mark a task as completed when you have FULLY accomplished it — never when tests are failing, the implementation is partial, or you encountered unresolved errors. When blocked, keep the task as in_progress and create a new task describing what needs to be resolved
5. **Breakdown**: create specific, actionable items and break complex tasks into smaller, manageable steps
`

export const DESCRIPTION =
  'Update the todo list for the current session. To be used proactively and often to track progress and pending tasks. Make sure that at least one task is in_progress at all times. Always provide both content (imperative) and activeForm (present continuous) for each task.'
