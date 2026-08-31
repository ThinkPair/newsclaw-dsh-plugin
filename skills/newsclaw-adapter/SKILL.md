---
name: newsclaw-adapter
description: Use the 31 local NewsClaw Agent Bridge tools for personalized news, profile state, dialogue, saved lists, bounded Tavily research, and deterministic public webpage/PDF change monitoring. Do not use them for trading, broad web crawling, or unrequested external actions.
---

# 新闻爪 Agent Bridge

Use this skill only for the user's local NewsClaw backend. It is a personalized
news assistant for investment context and content creation, not a trading
system.

## Start here

1. Call `newsclaw_get_capabilities` after a backend or plugin upgrade.
2. Call `newsclaw_get_runtime_status` and
   `newsclaw_get_source_availability` before claiming a refresh succeeded.
3. Call `newsclaw_get_profile` before explaining why an article fits the user.
4. Use `newsclaw_recommend`, `newsclaw_reshuffle`, or
   `newsclaw_append_recommendations` to read the shared recommendation pool.

## The 31 tools

- Contract and pool: `newsclaw_get_capabilities`, `newsclaw_recommend`,
  `newsclaw_reshuffle`, `newsclaw_append_recommendations`
- Learning: `newsclaw_submit_feedback`
- Surprise recommendation: `newsclaw_get_spotlight`,
  `newsclaw_respond_spotlight`
- Runtime: `newsclaw_get_runtime_status`, `newsclaw_get_activity_feed`,
  `newsclaw_get_source_availability`
- Dialogue: `newsclaw_chat`, `newsclaw_get_chat_history`
- Interest probes: `newsclaw_next_probe`,
  `newsclaw_respond_interest_probe`
- Avoidance probes: `newsclaw_next_avoidance_probe`,
  `newsclaw_respond_avoidance_probe`
- Five-layer profile: `newsclaw_get_profile`,
  `newsclaw_get_profile_edit_state`, `newsclaw_edit_profile`
- Local library: `newsclaw_save_local`, `newsclaw_remove_saved`,
  `newsclaw_list_saved`
- Bounded Tavily research: `newsclaw_search_web`,
  `newsclaw_extract_evidence`
- Public document monitoring: `newsclaw_list_web_monitors`,
  `newsclaw_add_web_monitor`, `newsclaw_check_web_monitor`,
  `newsclaw_set_web_monitor_state`, `newsclaw_get_web_monitor_history`,
  `newsclaw_list_monitor_notifications`,
  `newsclaw_act_on_monitor_notification`

## Working rules

1. Parse tool JSON. If the response is an error, surface it and stop.
2. Never expose a token, API key, cookie, credential or unmasked config value.
3. Treat `body_level=title` as title-level information. Never imply that the
   full article was read when only a title or excerpt is available.
4. Recommendation explanations may include why it fits, a possible impact
   chain and follow-up observation points. Do not output buy/sell instructions,
   position sizing, broker actions or guaranteed-return language.
5. NewsClaw does not validate market numbers. Attribute claims to the article
   and preserve the original URL and publication time.
6. Feedback, probe, spotlight and `newsclaw_edit_profile` writes need a stable
   `requestId`; durable `newsclaw_chat` needs a stable `turnId`. Reuse it only
   for retries of the exact same action/turn; never reuse it for different
   content or messages. If a profile edit outcome is uncertain, first read
   `newsclaw_get_profile_edit_state`, then use the same `requestId` to retry
   only the exact same payload; the binding is process-local and survives that
   uncertain failure, but not a DSH process restart.
7. User edits made through `newsclaw_edit_profile` override AI inference.
8. `newsclaw_save_local` is local-only. Never sync to media accounts or other
   external services.
9. A single broken media source means degraded service, not a successful full
   refresh. Report the source name and current health state.
10. Add a webpage/PDF monitor only when the user identifies a public URL to
    watch. Never infer permission to monitor other pages, a whole domain, a
    private address, or an authenticated page.
11. A first monitor fetch is a baseline, not a change. Treat only a backend
    `meaningful` result as changed; `noise_only`, `unchanged`, and failures are
    different states. Never turn the user's label/focus note into a fact.
12. Monitor add/check and notification actions require stable `requestId`
    values. Reuse one only for an exact retry. Pause/remove preserve history;
    do not claim evidence was deleted.

## Suggested daily loop

1. Runtime and source health
2. Profile and pending interest/avoidance probes
3. Recommendation page or reshuffle
4. Explicit feedback, spotlight response or local save only after the user's
   action or request
5. Activity feed to explain what the system learned
6. Monitor inbox/history only when the user asks about watched document changes
