#!/usr/bin/env node
import { runCli } from './runner';

void runCli(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});

export { runCli } from './runner';
