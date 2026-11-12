# paseo-buttons

A [Paseo](https://github.com/getpaseo/paseo) plugin that puts reply buttons under an agent's final message when the message proposes a next step. "Want me to commit and push this, or show you the diff first?" gets the buttons **Commit and push** and **Show the diff**; tapping one sends its label as your next message. Agents aren't told about the buttons and write as they always do.

## How it works

When an agent's turn completes, the plugin's server side sends the end of the final message to a classifier: a one-shot `claude -p` call on Claude Haiku 4.5, with its own system prompt, no tools and no user settings. The classifier decides whether the writer proposes something it will do once the reader agrees, and returns a short label for each option that is a specific action. If there are any, the plugin appends a row of up to four buttons after the message. The row greys out when the next turn starts, whether from a tap or a typed message.

- About 3 seconds from the end of a turn to the buttons.
- Rows live in the daemon's memory, so they disappear when the daemon restarts.
- Only the last 1,500 characters of the message are read, with code blocks and block quotes replaced by placeholders, so that offers quoted from elsewhere aren't taken as the agent's own.
- Voice mode: when the final message is a short stub (under 40 characters) right after a `speak` call that failed, the text the agent tried to speak is classified instead, since that is what the chat shows.
- Each result is logged to the daemon log as `paseo-buttons: <agent id> [labels]` or `no offer` (`paseo plugin logs paseo-buttons`).

## Requirements and cost

- Paseo 0.14.0 or later, with plugins enabled.
- Claude Code installed and signed in on the machine where the Paseo daemon runs, with `claude` on the PATH of a login shell (`bash -lc claude`).
- One Haiku call per completed agent turn, on the machine's Claude Code login, so it counts against that subscription's usage. The plugin removes `ANTHROPIC_API_KEY` from the call's environment, so it never bills an API key.

## Install

```sh
paseo daemon config set pluginsEnabled true   # once, if plugins are off
paseo plugin install https://github.com/dgreensp/paseo-buttons
```

Or clone the repository and install from the directory: `paseo plugin install ./paseo-buttons`.

## Settings

Under **Settings → Plugins → paseo-buttons → Buttons** in the Paseo app, per host:

- **Commit button** (off by default): adds a **Commit** button when the message mentions committing in any form ("uncommitted" counts) and the agent's working directory is in a git repository with uncommitted changes, unless the classifier already offered a commit. It is a heuristic, not part of the classifier, and can appear when the agent didn't actually propose to commit.

Paseo keeps the values under `~/.paseo/plugin-settings/`.

## Development

TypeScript: Paseo loads only `.ts` and `.tsx` plugin entries.

```sh
npm install
npm run typecheck
npm run test:input        # what the classifier is given, from a timeline
npm run test:classifier   # every case in test/classifier-cases.json, one real Haiku call each
```

The classifier tests run all cases in parallel, on your Claude Code login, in about 10 seconds. Haiku's answers vary from run to run, so run the suite three times before trusting a change to the prompt. `AGENTS.md` has the design notes: what was tried and rejected, and what the prompt's wording is protecting against.

After a change, `paseo plugin reload paseo-buttons` picks it up on a daemon that installed the plugin from a directory.

## License

MIT
