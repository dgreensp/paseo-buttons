# paseo-buttons

A [Paseo](https://github.com/getpaseo/paseo) plugin that puts reply buttons under an agent's final message when the message proposes a next step. "Want me to commit and push this, or open a pull request instead?" gets the buttons **Commit and push** and **Open a pull request**; tapping one sends its label as your next message.

---

<img width="677" height="189" alt="image" src="https://github.com/user-attachments/assets/f7353369-8c43-4ee2-8e29-5c7c42a327cd" />

---

Agents aren't told about the buttons and write as they always do.

## How it works

When an agent's turn completes, the plugin sends the end of the final message to a classifier: a one-shot `claude -p` call on Claude Haiku 4.5, with its own system prompt, no tools and no user settings. (The call uses the account Claude Code is signed in with on the daemon's machine. With a Claude Pro or Max subscription, it counts toward the subscription's usage limits and isn't billed separately; see [Requirements and cost](#requirements-and-cost).) The classifier decides whether the writer proposes something it will do once the reader agrees, and returns a short label for each option that is a specific action. If there are any, the plugin appends a row of up to four buttons after the message.

The buttons appear about 3 seconds after the turn ends, the time the classifier call takes, which feels fine in use, since you are reading the message in the meantime. Tapping one sends its label as your next message. When the next turn starts, whether from a tap or a typed message, the row greys out and its buttons can no longer be pressed. The row is part of the conversation as Paseo's daemon holds it in memory, which clients load it from, so it is still there when a client disconnects and reconnects or reloads. On a restart, though, the daemon rebuilds the conversation from the agent's own history, which never contained the buttons, so they disappear.

The classifier reads only the last 1,500 characters of the message, with code blocks and block quotes replaced by placeholders, so that an offer quoted from elsewhere isn't taken for the agent's own.

There's a special case for voice mode. In the personal setup of the author (David), an agent whose `speak` call ends its turn is instructed to write only a stub after it: "(Spoken.)" when the call worked, or "(See above.)" when it failed because the client has left voice mode, since the text given to the `speak` call is visible in the transcript either way. After a failed call, when the turn ends with a very short written message (under 40 characters), the plugin classifies the text of the `speak` call instead. After a call that worked, the plugin classifies the stub as it is, so in this setup spoken turns get no buttons, which the author prefers. Without such instructions, an agent writes a real message after speaking, and that message is classified as usual.

Each result is logged as `paseo-buttons: <agent id> [labels]` or `no offer`; see `paseo plugin logs paseo-buttons`.

## Classification details

The goal of the classification is to identify "offers" the agent is making, whether or not they are phrased as a question, and whether or not they come at the end of the text.

For example, "Want me to deploy the server?" is an offer, and so is "I can deploy the server now if you want," even if it's followed by another sentence after it, such as, "It should take about two minutes," and another paragraph tacked on after that, like, "I didn't commit the other file you changed." In either case, a button should appear saying just, "Deploy the server."

You might wonder why use a separate LLM classifier to produce the buttons; why not just prompt the main agent to, for example, annotate all its offers somehow, or put the buttons at the end? The answer is that agents aren't good at following these kinds of instructions reliably, every single turn. They are bound to forget or get it wrong while juggling everything else they are juggling.

So how do we instruct an LLM to analyze some text and pull out the "Deploy the server" offer? It can be a little tricky.

An LLM asked to "find the offer," even if given a detailed description of what constitutes an offer, and that it has to be the agent itself making the offer, not just talking about an offer, is still very tempted to say there's an offer in a sentence like: "The agent made one offer: to deploy the server." Even worse, an LLM whose job is just to classify, if it knows that this classification is going to be used to produce buttons, will be swayed by input text like, "Therefore there should be one button in the output." You can imagine what it was like to develop this plugin while the plugin was active!

So the classifier is never told about agents, chats or buttons. Its prompt describes the input only as a text, from its writer to its reader, given inside `<input>` tags, and says that "you" in the text means the reader. Nothing tells it what its answer will be used for, so "there should be one button" is just something the writer said.

And instead of asking for offers, the prompt asks a question about grammar: does the writer propose something the writer will do next, once the reader agrees? A sentence that does must pass three tests:

- **First person:** the writer would be the one to act ("Want me to…", "I can…").
- **Not done yet:** it is future or conditional, not a report of something done.
- **Waiting on the reader:** it asks for or invites the reader's go-ahead.

"The agent made one offer: to deploy the server" fails the first test, since the writer isn't the one who would deploy. "Next I'll run the tests" passes the first two and fails the third: it announces what the writer will do anyway, so there is nothing to press.

This approach successfully extracted offers, but sometimes the offers were vague or non-actions. For example, "The server is ready to deploy. Shall I go ahead, or hold off?" might produce two buttons: "Go ahead," and "Hold off"! We don't ever want to show a "Hold off" button, that would be silly. And while "Go ahead" might be unambiguous in some cases, we want the button text to be specific, in this case, "Deploy the server."

In the course of getting the classifying agent to follow these instructions reliably, we came up with a couple of useful techniques:

- Instead of asking the classifying agent to omit offers that didn't meet certain criteria, which can be hard for it to do, ask it to output a boolean flag, then filter the list afterwards.
- Ask the agent to include an explanation string in its output. Besides being useful for debugging, requiring the agent to give an explanation actually has the potential to affect the performance.

In our case:

- Each option comes with a flag saying whether it is a specific action, one the writer could start on as soon as the reader chose it, naming what it would do and to what, and the code keeps only the flagged ones.
- We require the agent to output an "explanation" JSON property first, saying in one or two sentences which sentence passes the tests and why the likeliest others fail; then the "proposal" it identified, copied word for word; then the options.

The answer is structured JSON (`--json-schema`). A plain-text answer saved a round trip, about 0.6 seconds, but labelled less accurately.

Another interesting case is an offer of one step, followed by a further step that depends on it: "Want me to commit and push, and should I deploy?" The reader can say yes to the commit and push and stop there, or say yes to both, but not to the deploy alone, since deploying needs the commit and push first. The classifier used to split this into two buttons anyway, "Commit and push" and "Deploy", and tapping "Deploy" would ask for something the agent never offered. So the prompt says that each option is everything the writer would do if the reader chose it, and the buttons become "Commit and push" and "Commit, push and deploy". That rule, with an example of it in the prompt, took this case from one right run in three to three in three.

A few smaller rules round it out. A yes-or-no offer, like "Want me to deploy the server?", gets one button, for the yes; saying no isn't an action. Questions that ask the reader for something, like "Which wording do you prefer?" or "Does that match what you remember?", get no buttons at all, since the writer isn't offering to do anything. Labels are short commands, at most 40 characters, reusing the offer's wording when it works, and there are at most four of them.

The cases the classifier is tested against, with the buttons each should get, are in [`test/classifier-cases.json`](test/classifier-cases.json); some illustrate these rules, and others are messages that once got the wrong buttons. The examples in the prompt itself are on different topics from the test cases, so that passing the tests shows the rules work, not that the model remembered the examples. The prompt is in [`server/classify.ts`](server/classify.ts), and `AGENTS.md` lists what else was tried and rejected.

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

In the Paseo app, under **Settings → Plugins**, choose **Options** from the **⋯** menu on the paseo-buttons row. Settings are per host:

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
