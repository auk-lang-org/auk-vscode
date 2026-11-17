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

// Save the active .duck file, then run `duck <sub> <file> [args...]` in a reused "Duck"
// terminal whose working directory is the file's folder (so relative paths like
// `expenses.txt` resolve next to the program).
async function runInTerminal(sub, args) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'duck') {
    vscode.window.showWarningMessage('Open a .duck file to run it.');
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
    terminal = vscode.window.createTerminal({ name: 'Duck', cwd: dir });
  }
  terminal.show(true);
  const duck = vscode.workspace.getConfiguration('duck').get('path') || 'duck';
  const cmd = [duck, sub, file, ...args].map(quote).join(' ');
  terminal.sendText(`cd ${quote(dir)} && ${cmd}`);
}

// The debugger: `duck dap` speaks the Debug Adapter Protocol on stdin/stdout.
const debugAdapter = {
  createDebugAdapterDescriptor() {
    const duck = vscode.workspace.getConfiguration('duck').get('path') || 'duck';
    return new vscode.DebugAdapterExecutable(duck, ['dap']);
  },
};

// F5 with no launch.json: debug the active .duck file.
const debugConfigs = {
  resolveDebugConfiguration(folder, config) {
    if (!config.type && !config.request && !config.name) {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'duck') return config;
      return fileConfig(editor.document.uri.fsPath);
    }
    if (!config.program) {
      return vscode.window.showErrorMessage('Duck: the launch configuration needs a "program" (a .duck file).').then(() => undefined);
    }
    return config;
  },
};

function fileConfig(file) {
  return { type: 'duck', request: 'launch', name: 'Debug Duck file', program: file, cwd: require('path').dirname(file) };
}

async function debugFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== 'duck') {
    vscode.window.showWarningMessage('Open a .duck file to debug it.');
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
    vscode.debug.registerDebugAdapterDescriptorFactory('duck', debugAdapter),
    vscode.debug.registerDebugConfigurationProvider('duck', debugConfigs),
    vscode.commands.registerCommand('duck.debug', debugFile),
    vscode.commands.registerCommand('duck.run', () => runInTerminal('run', [])),
    vscode.commands.registerCommand('duck.test', () => runInTerminal('test', [])),
    vscode.commands.registerCommand('duck.runWithArgs', async () => {
      const key = 'duck.lastArgs:' + (vscode.window.activeTextEditor?.document.uri.toString() ?? '');
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
