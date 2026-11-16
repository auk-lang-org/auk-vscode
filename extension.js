// Starts `duck lsp` (the Duck language server) for .duck files. Plain JS, no build step.
'use strict';

const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;

function serverOptions() {
  const command = vscode.workspace.getConfiguration('duck').get('path') || 'duck';
  const run = { command, args: ['lsp'], transport: TransportKind.stdio };
  return { run, debug: run };
}

async function start(context) {
  client = new LanguageClient('duck', 'Duck Language Server', serverOptions(), {
    documentSelector: [{ scheme: 'file', language: 'duck' }],
    outputChannelName: 'Duck Language Server',
  });
  try {
    await client.start();
  } catch (err) {
    const path = vscode.workspace.getConfiguration('duck').get('path') || 'duck';
    vscode.window.showErrorMessage(
      `Could not start \`${path} lsp\`: ${err && err.message ? err.message : err}. ` +
        'Install duck or set "duck.path" to the duck executable.'
    );
  }
}

async function stop() {
  if (client) {
    const c = client;
    client = undefined;
    await c.stop().catch(() => {});
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('duck.restartServer', async () => {
      await stop();
      await start(context);
    }),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('duck.path')) {
        await stop();
        await start(context);
      }
    })
  );
  return start(context);
}

function deactivate() {
  return stop();
}

module.exports = { activate, deactivate };
