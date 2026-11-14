# paseo-buttons

A [Paseo](https://github.com/getpaseo/paseo) plugin that puts reply buttons under an agent's final message when the message proposes a next step. "Want me to commit and push this, or open a pull request intead?" gets the buttons **Commit and push** and **Open a pull request**; tapping one sends its label as your next message.

<img width="677" height="189" alt="image" src="https://github.com/user-attachments/assets/f7353369-8c43-4ee2-8e29-5c7c42a327cd" />

Agents aren't told about the buttons and write as they always do.

## How it works

When an agent's turn completes, the plugin sends the end of the final message to a classifier: a one-shot `claude -p` call on Claude Haiku 4.5, with its own system prompt, no tools and no user settings. (The call uses the account Claude Code is signed in with on the daemon's machine. With a Claude Pro or Max subscription, it counts toward the subscription's usage limits and isn't billed separately; see [Requirements and cost](#requirements-and-cost).) The classifier decides whether the writer proposes something it will do once the reader agrees, and returns a short label for each option that is a specific action. If there are any, the plugin appends a row of up to four buttons after the message.

In practice the buttons appear about 3 seconds after the turn ends, the time the classifier call takes. That feels fine in use, since you are reading the message in the meantime.

The classifier reads only the last 1,500 characters of the message, with code blocks and block quotes replaced by placeholders, so that an offer quoted from elsewhere isn't taken for the agent's own. One exception is for voice mode: when the final message is a short stub (under 40 characters) right after a `speak` call that failed, the classifier reads the text the agent tried to speak, since that is what the chat shows.

The row of buttons is added to the conversation in Paseo's daemon, which clients load it from, so it is still there when a client disconnects and reconnects or reloads. The daemon keeps its copy of the conversation in memory, though, and on a restart rebuilds it from the agent's own history, which never contained the buttons, so they disappear. Only the newest row matters: when the next turn starts, whether from a tap or a typed message, the row greys out and its buttons can no longer be pressed.

Each result is logged as `paseo-buttons: <agent id> [labels]` or `no offer`; see `paseo plugin logs paseo-buttons`.

## Requirements and cost

- Paseo 0.14.0 or later, with plugins enabled.
- Claude Code installed and signed in on the machine where the Paseo daemon runs, with `claude` on the PATH of a login shell (`bash -lc claude`).
- One Haiku call per completed agent turn, on the account Claude Code is signed in with on that machine: with a Claude subscription it counts toward the subscription's usage limits; with a Claude Console account it is billed to that account. The plugin removes `ANTHROPIC_API_KEY` from the call's environment, so an API key set there is never used in place of the sign-in.

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
