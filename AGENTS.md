# Working on paseo-buttons

`README.md` says what the plugin does and how it is built and tested; read it first.

## Rules

- Run `npm run typecheck` after every change.
- Classifier changes (`server/classify.ts`): run `npm run test:classifier` three times before trusting a change; its results vary from run to run. Add a case to `test/classifier-cases.json` for every wrong or missing button seen in use. Keep the prompt's examples on topics unlike the test cases, so the suite checks the rule rather than rehearsing its answers.
- The Commit button (`server/commit-button.ts`) is an optional heuristic behind a setting. Don't fold it into the classifier prompt.

## Rejected designs

Do not retry these without a new reason:

- A tool the agent calls to offer buttons: Claude Code will not end a turn on a tool call without more text, so agents reshaped their messages around the call (asking twice, "Waiting for your choice.").
- A marker the agent writes at the end of its message: agents forget it on ordinary turns. HTML comments show as text (Paseo's chat Markdown runs with `html: false`); a link reference definition flickers while streaming; an empty link `[](<...>)` stays invisible even while streaming, the one marker form that works.
- Pre-starting `claude -p` to hide its start-up: no gain; it starts up only after reading its input.
- Only the last paragraph as input: fixes messages that narrate another agent's offer, but misses an offer followed by a closing remark or a list. Running two classifications and preferring one was rejected too: neither has a better claim to be right.
- Plain-text output instead of `--json-schema`: one round trip and 0.6 s faster, but it labelled less accurately.

## Classifier prompt lessons

- "Find the offer" made the model pick sentences that described someone else's offer; the prompt tests grammar instead (first person, not done yet, waiting on the reader).
- Mentioning agents, chats or buttons let the model confuse the writer with an agent the message talks about; the prompt speaks only of a text, its writer and its reader.
- Unframed input read as addressed to the classifier; the message goes inside `<input>` tags, and the prompt says "you" there means the reader.
- Per-option specific-action flags, filtered in code, stopped "Hold off" and "Move on" buttons.
- A prompt line saying "each action gets its own button" brought "Move on" buttons back.
- Options that build on each other ("commit and push, and should I deploy?") came back as the steps split up ("Commit and push", "Deploy"); a rule that each option is everything the writer would do, plus an example, fixed it: 3 of 3 runs right, up from 1 of 3.
- Labels: the prompt asks for at most 40 characters; the code cuts only labels over 80, since the label is also the message a tap sends. A button shows its label on one line, ellipsized when the row is too narrow; a hard cut at 40 produced truncated messages.
