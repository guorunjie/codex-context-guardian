# Bottom-Level Evaluation: Model Switching vs Fresh Conversation Recovery

## Short Answer

Switching models is useful, but only as a narrow fallback. The project should focus on recovery bundles plus a fresh conversation after repeated compaction failures.

## Why Model Switching Sometimes Works

Context compaction is not the same as an ordinary model reply. In Codex it is a special recovery/summarization path that depends on:

- the current model;
- whether the provider supports remote compaction;
- the compact endpoint behavior;
- the serialized conversation history;
- tool traces and prior compacted summaries;
- the client's session state.

If the failure is model/endpoint compatibility, switching from a newer model to a fallback model can help because the fallback may support the compact path more reliably. In that case the best use of the fallback model is to produce a durable handoff summary, then switch back to the primary model.

## Why Model Switching Is Not the Main Solution

If the failure is caused by oversized history, malformed tool traces, repeated compacted summaries, transport retries, or a bad state transition, changing the model does not remove the bad input. The compact task still receives the same unhealthy context.

That means repeated retries can become a loop:

1. same thread state;
2. same large or awkward history;
3. same compact trigger;
4. same failure class.

At that point, the safer move is to stop compacting the old thread.

## Recommended Strategy

Use model switching once when the logs indicate model compact incompatibility. After repeated failure, create a recovery bundle and start a fresh conversation.

The fresh-conversation path is stronger because it converts implicit thread state into explicit project state:

- project file manifest;
- selected source and docs;
- git status and diff;
- latest snapshot;
- failure reason;
- current task and next action.

The new session can read the bundle and continue from a clean context window without inheriting the broken compaction state.

## Project Implication

Codex Context Guardian treats model switching as a tactical step and recovery bundles as the strategic path:

- first failure with model compatibility signal: fallback-model handoff;
- ordinary compaction failure: fork once if the old thread is still readable;
- repeated failure: package project state and launch a fresh session.
