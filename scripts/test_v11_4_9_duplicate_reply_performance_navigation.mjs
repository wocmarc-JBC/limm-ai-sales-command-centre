import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const shell = await readFile("components/ShellChrome.tsx", "utf8");
const matches = shell.match(/href:\s*"\/reply-performance"/g) ?? [];
assert.equal(matches.length, 1);
console.log("PASS: Reply Performance appears exactly once in primary navigation.");
