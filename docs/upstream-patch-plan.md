# Upstream Patch Plan for `openai/codex`

## Goal

Make compaction failure recoverable inside Codex itself, instead of relying on external log watching.

## Proposed Interfaces

Add configuration:

```toml
[compaction]
fallback_models = ["gpt-5.4"]
auto_fork_on_failure = true
recovery_prompt_file = "/path/to/recovery-prompt.md"
```

Add an internal strategy enum:

```rust
enum CompactionRecoveryStrategy {
    RetryWithFallbackModel { model: String },
    ForkWithRecoveryPrompt,
    StartNewThreadWithRecoveryPrompt,
    ReportOnly,
}
```

Expose a structured event:

```json
{
  "type": "compaction.failed",
  "thread_id": "...",
  "model": "gpt-5.5",
  "reason": "model_compact_unsupported",
  "recommended_strategy": "retry_with_fallback_model"
}
```

## Implementation Sketch

- Classify `run_compact_task_inner_impl` errors into stable categories.
- If the error is model/endpoint incompatibility, retry compact with the first configured fallback model.
- If retry succeeds, restore the original model for the next user-visible turn.
- If retry fails and `auto_fork_on_failure` is true, create a forked thread with a recovery prompt and the latest durable summary.
- Surface the event in CLI/TUI/Desktop so the user sees what happened.
- Add telemetry fields for trigger, strategy, model, fallback model, and final status.

## Tests

- Model unsupported -> fallback compact succeeds -> original model restored.
- Compact fails repeatedly -> fork recovery is offered or launched.
- Recovery prompt is injected once and does not duplicate compacted history.
- Existing manual `/compact`, `/new`, `resume`, and `fork` flows remain unchanged.
