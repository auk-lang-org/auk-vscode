// Starts `auk lsp` (the Auk language server) for .auk files. Plain JS, no build step.
'use strict';

const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');

let client;

function serverOptions() {
  const command = vscode.workspace.getConfiguration('auk').get('path') || 'auk';
  const run = { command, args: ['lsp'], transport: TransportKind.stdio };
  return { run, debug: run };
}

async function start(context) {
  client = new LanguageClient('auk', 'Auk Language Server', serverOptions(), {
    documentSelector: [{ scheme: 'file', language: 'auk' }],
    outputChannelName: 'Auk Language Server',
  });
  try {
    await client.start();
  } catch (err) {
    const path = vscode.workspace.getConfiguration('auk').get('path') || 'auk';
    vscode.window.showErrorMessage(
      `Could not start \`${path} lsp\`: ${err && err.message ? err.message : err}. ` +
        'Install auk or set "auk.path" to the auk executable.'
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

// Quote one argument for the integrated terminal's shell (POSIX shells; PowerShell on Windows).
function quote(s) {
  if (/^[\w@%+=:,./-]+$/.test(s)) return s;
  return process.platform === 'win32' ? `'${s.replace(/'/g, "''")}'` : `'${s.replace(/'/g, `'\\''`)}'`;
}

// Split what the user typed into arguments: whitespace separates, "..." and '...' group.
function splitArgs(line) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

let terminal;

// Save the active .auk file, then run `auk <sub> <file> [args...]` in a reused "Auk"
// terminal whose working directory is the file's folder (so relative paths like
// `expenses.txt` resolve next to the program).
async function runInTerminal(sub, args) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'auk') {
    vscode.window.showWarningMessage('Open a .auk file to run it.');
    return;
  }
  const doc = editor.document;
  if (doc.isUntitled) {
    vscode.window.showWarningMessage('Save the file before running it.');
    return;
  }
  if (doc.isDirty && !(await doc.save())) return;
  const file = doc.uri.fsPath;
  const dir = require('path').dirname(file);
  if (!terminal || terminal.exitStatus !== undefined) {
    terminal = vscode.window.createTerminal({ name: 'Auk', cwd: dir });
  }
  terminal.show(true);
  const auk = vscode.workspace.getConfiguration('auk').get('path') || 'auk';
  const cmd = [auk, sub, file, ...args].map(quote).join(' ');
  terminal.sendText(`cd ${quote(dir)} && ${cmd}`);
}

// The debugger: `auk dap` speaks the Debug Adapter Protocol on stdin/stdout.
const debugAdapter = {
  createDebugAdapterDescriptor() {
    const auk = vscode.workspace.getConfiguration('auk').get('path') || 'auk';
    return new vscode.DebugAdapterExecutable(auk, ['dap']);
  },
};

// F5 with no launch.json: debug the active .auk file.
const debugConfigs = {
  resolveDebugConfiguration(folder, config) {
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'auk') return config;
      return fileConfig(editor.document.uri.fsPath);
    }
    if (!config.program) {
      return vscode.window.showErrorMessage('Auk: the launch configuration needs a "program" (a .auk file).').then(() => undefined);
    }
    return config;
  },
};

function fileConfig(file) {
  return { type: 'auk', request: 'launch', name: 'Debug Auk file', program: file, cwd: require('path').dirname(file) };
}

async function debugFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'auk') {
    vscode.window.showWarningMessage('Open a .auk file to debug it.');
    return;
  }
  const doc = editor.document;
  if (doc.isUntitled) {
    vscode.window.showWarningMessage('Save the file before debugging it.');
    return;
  }
  if (doc.isDirty && !(await doc.save())) return;
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  await vscode.debug.startDebugging(folder, fileConfig(doc.uri.fsPath));
}

function activate(context) {
  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('auk', debugAdapter),
    vscode.debug.registerDebugConfigurationProvider('auk', debugConfigs),
    vscode.commands.registerCommand('auk.debug', debugFile),
    vscode.commands.registerCommand('auk.run', () => runInTerminal('run', [])),
    vscode.commands.registerCommand('auk.test', () => runInTerminal('test', [])),
    vscode.commands.registerCommand('auk.runWithArgs', async () => {
      const key = 'auk.lastArgs:' + (vscode.window.activeTextEditor?.document.uri.toString() ?? '');
      const value = await vscode.window.showInputBox({
        prompt: 'Arguments for the program (space-separated; quote ones with spaces)',
        value: context.workspaceState.get(key, ''),
      });
      if (value === undefined) return;
      await context.workspaceState.update(key, value);
      await runInTerminal('run', splitArgs(value));
    }),
    vscode.window.onDidCloseTerminal((t) => {
      if (t === terminal) terminal = undefined;
    }),
    vscode.commands.registerCommand('auk.restartServer', async () => {
      await stop();
      await start(context);
    }),
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('auk.path')) {
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
