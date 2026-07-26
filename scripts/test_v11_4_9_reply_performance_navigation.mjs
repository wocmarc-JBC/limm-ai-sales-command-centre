import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const shell = await readFile("components/ShellChrome.tsx", "utf8");
assert.match(shell, /title:\s*"Money"[\s\S]*href:\s*"\/reply-performance"[\s\S]*label:\s*"Reply Performance"/);
assert.match(shell, /baseCommandPaletteItems[\s\S]*appNavGroups\.flatMap/);
assert.doesNotMatch(shell, /sendReply|\/api\/inbox\/send/);
console.log("PASS: Reply Performance is visible under Money and inherited by command palette without send capability.");
