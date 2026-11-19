// End-to-end check of the extension inside a real VS Code (extension host), against the `auk`
// named by the workspace's `auk.path` setting: the language server (symbols, hover,
// diagnostics, formatting) and the debugger (breakpoint, stack, evaluate, continue, output).
// Run by scripts/e2e.sh, which makes the workspace and launches VS Code with
// --extensionTestsPath pointing here. Writes a JSON report to $AUK_E2E_OUT; fails (rejects) on
// the first check that doesn't hold.
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, f, ms = 30000) {
  const t0 = Date.now();
  for (;;) {
    const v = await f();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`);
    await sleep(100);
  }
}

function check(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const report = { checks: [] };
  const ok = (name, detail) => report.checks.push({ name, ok: true, detail });
  const out = process.env.AUK_E2E_OUT;
  try {
    await body(ok);
    report.ok = true;
  } catch (e) {
    report.ok = false;
    report.error = String(e && e.stack || e);
    throw e;
  } finally {
    if (out) fs.writeFileSync(out, JSON.stringify(report, null, 2));
  }
}

async function body(ok) {
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const prog = vscode.Uri.file(path.join(root, 'prog.auk'));
  const bad = vscode.Uri.file(path.join(root, 'bad.auk'));
  const messy = vscode.Uri.file(path.join(root, 'messy.auk'));

  // ---- language server ----
  const doc = await vscode.workspace.openTextDocument(prog);
  await vscode.window.showTextDocument(doc);
  const syms = await until('document symbols', async () => {
    const s = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', prog);
    return s && s.length ? s : null;
  });
  const names = syms.map((s) => s.name).sort();
  check(names.includes('add') && names.includes('main'), `symbols: ${names}`);
  ok('lsp symbols', names);

  const addLine = doc.getText().split('\n').findIndex((l) => l.includes('add(x, 2)'));
  const col = doc.lineAt(addLine).text.indexOf('add(x, 2)') + 1;
  const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', prog, new vscode.Position(addLine, col));
  const hoverText = (hovers || []).flatMap((h) => h.contents.map((c) => c.value || String(c))).join('\n');
  check(hoverText.includes('fn add'), `hover: ${hoverText}`);
  ok('lsp hover', hoverText);

  const defs = await vscode.commands.executeCommand('vscode.executeDefinitionProvider', prog, new vscode.Position(addLine, col));
  check(defs && defs.length && (defs[0].range || defs[0].targetRange).start.line === 0, `definition: ${JSON.stringify(defs)}`);
  ok('lsp definition', 'line 1');

  const badDoc = await vscode.workspace.openTextDocument(bad);
  await vscode.window.showTextDocument(badDoc);
  const diags = await until('diagnostics', async () => {
    const d = vscode.languages.getDiagnostics(bad);
    return d.length ? d : null;
  });
  const codes = diags.map((d) => (typeof d.code === 'object' ? d.code.value : d.code));
  check(codes.some((c) => /^E0\d\d\d$/.test(String(c))), `diagnostic codes: ${codes}`);
  ok('lsp diagnostics', diags.map((d) => `${d.code && (d.code.value || d.code)} ${d.message}`));

  const messyDoc = await vscode.workspace.openTextDocument(messy);
  const edits = await vscode.commands.executeCommand('vscode.executeFormatDocumentProvider', messy, { tabSize: 2, insertSpaces: true });
  check(edits && edits.length, 'formatting returned no edits');
  const we = new vscode.WorkspaceEdit();
  we.set(messy, edits);
  await vscode.workspace.applyEdit(we);
  check(messyDoc.getText() === 'fn f(a: int): int { a + 1 }\n', `formatted: ${JSON.stringify(messyDoc.getText())}`);
  ok('lsp formatting', messyDoc.getText());

  // ---- debugger ----
  await vscode.window.showTextDocument(doc);
  const seen = [];
  let output = '';
  const tracker = vscode.debug.registerDebugAdapterTrackerFactory('auk', {
    createDebugAdapterTracker() {
      return {
        onDidSendMessage(m) {
          seen.push(m);
          if (m.type === 'event' && m.event === 'output' && m.body.category !== 'telemetry') output += m.body.output;
        },
      };
    },
  });
  const bpLine = doc.getText().split('\n').findIndex((l) => l.includes('let y = add(x, 2)'));
  vscode.debug.addBreakpoints([new vscode.SourceBreakpoint(new vscode.Location(prog, new vscode.Position(bpLine, 0)))]);
  let ended = false;
  const endSub = vscode.debug.onDidTerminateDebugSession(() => { ended = true; });
  // the extension's own command, as the editor's debug button runs it
  await vscode.commands.executeCommand('auk.debug');
  const session = await until('a debug session', async () => vscode.debug.activeDebugSession);
  const stopped = await until('a stop at the breakpoint', async () => seen.find((m) => m.type === 'event' && m.event === 'stopped'));
  check(stopped.body.reason === 'breakpoint', `stop reason: ${stopped.body.reason}`);
  const threadId = stopped.body.threadId;
  const st = await session.customRequest('stackTrace', { threadId });
  const top = st.stackFrames[0];
  check(top.name.includes('main') && top.line === bpLine + 1, `top frame: ${top.name} line ${top.line}`);
  ok('dap stop', `${top.name} line ${top.line}`);
  const scopes = await session.customRequest('scopes', { frameId: top.id });
  const vars = await session.customRequest('variables', { variablesReference: scopes.scopes[0].variablesReference });
  const x = vars.variables.find((v) => v.name === 'x');
  check(x && x.value === '40', `variable x: ${JSON.stringify(vars.variables)}`);
  ok('dap variables', vars.variables.map((v) => `${v.name}=${v.value}`));
  const ev = await session.customRequest('evaluate', { expression: 'add(x, 1) * 2', frameId: top.id, context: 'repl' });
  check(ev.result === '82', `evaluate: ${ev.result}`);
  ok('dap evaluate', ev.result);
  await session.customRequest('continue', { threadId });
  await until('the session to end', async () => ended);
  check(output.includes('y = 42'), `program output: ${JSON.stringify(output)}`);
  ok('dap output', output);
  tracker.dispose();
  endSub.dispose();
}

module.exports = { run };
