---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

**Always use the AskUserQuestion tool to ask every question** — never ask questions as plain text in your response. Ask one question per AskUserQuestion call so each answer can steer the next branch of the decision tree. For each question:

- Put your recommended answer first and append " (Recommended)" to its label.
- Give the other plausible options so I can push back.
- I can always pick "Other" to answer freely, so you don't need to add an escape-hatch option yourself.

If a question can be answered by exploring the codebase, explore the codebase instead of asking.

For a new or changed rule, the branches that usually matter here: what exactly it reports, what legitimate code it must leave alone, what the message tells the reader to do, which presets turn it on, and whether it holds on both ESLint 9 and 10.
