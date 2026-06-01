#!/usr/bin/env node

import { handleMcpMessage } from "./protocol.js";

function write(message) {
  if (message) {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;

  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);

    if (!line) {
      continue;
    }

    try {
      write(await handleMcpMessage(JSON.parse(line)));
    } catch (error) {
      write({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: error.message
        }
      });
    }
  }
});

