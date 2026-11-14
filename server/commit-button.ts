import { execFile } from "node:child_process";
import { MAX_BUTTONS } from "../shared/buttons";

// Optional add-on, not part of the classifier, on when the commitButton setting is
// (shared/settings.ts): adds a "Commit" button when the agent's working tree has uncommitted
// changes and the message mentions them. A message that says changes are uncommitted can word it
// many ways ("uncommitted", "I didn't commit the file yet"), so the test is only that "commit"
// appears anywhere in it, and in no label the classifier already gave. The classifier prompt is
// left alone.

const LABEL = "Commit";
const GIT_TIMEOUT_MS = 5_000;

export async function addCommitButton(labels: string[], message: string, cwd: string): Promise<string[]> {
  if (!/commit/i.test(message)) return labels;
  if (labels.some((label) => /commit/i.test(label))) return labels;
  if (labels.length >= MAX_BUTTONS) return labels;
  if (!(await hasUncommittedChanges(cwd))) return labels;
  return [...labels, LABEL];
}

// Staged, unstaged or untracked changes in the repository containing cwd. False when cwd is not
// in a repository or git fails.
function hasUncommittedChanges(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("git", ["status", "--porcelain"], { cwd, timeout: GIT_TIMEOUT_MS }, (error, stdout) => {
      resolve(!error && stdout.trim().length > 0);
    });
  });
}
