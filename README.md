# Auk for VS Code

Syntax highlighting, editor configuration and language-server support for the Auk language
(`.auk` files).

## What it provides

- Language id `auk` for `*.auk` files; `raft.toml` is opened as TOML.
- A TextMate grammar (`syntaxes/auk.tmLanguage.json`) covering:
  - keywords, effect names after `uses`, builtin types (`int float bool char str Value`)
  - function names in `fn` declarations, capitalized type names, enum variants
  - numbers (`1_000`, `0xff`, `0b1010`, `0o755`, `3.14`, `1e-9`)
  - chars and strings with escapes (`\n`, `\u{1F986}`, ...)
  - string interpolation `{expr}` highlighted as embedded Auk code (nested braces
    and nested strings work), `{{`/`}}` escapes, and format specs (`{x:.2}`, `{n:>5}`)
  - raw `r"..."`, triple-quoted `"""..."""` and `r"""..."""` strings
  - `//`, nested `/* */`, and `///` doc comments (distinct scope)
  - operators (`=> |> ?. .. ..= +% -% *% **`, ...) and `T?` / `T!` type suffixes
  - the hole `??`, scoped `invalid.illegal.hole.auk` so unfilled holes stand out
- Language configuration: comment toggling, bracket matching, auto-closing pairs,
  indentation on `{` / `}`, `///` continuation on Enter, and `// region` folding markers.

## Run and test

A `.auk` editor gets buttons in its title bar (top right): **Run** (▶, also `Ctrl+F5`), **Run
with Arguments…** (asks for them and remembers the last ones per file), **Test** (beaker) and
**Debug** (also `F5`). Run and Test save the file and run `auk run <file>` / `auk test <file>`
in an "Auk" terminal from the file's folder.

## Debugging

`F5` (or **Auk: Debug File**) debugs the active file through `auk dap`: click in the gutter
for breakpoints (a line without code moves to the next one that has some), add function
breakpoints in the Breakpoints view, and choose whether panics stop (**Uncaught panics**, on by
default, or **All panics**, also those inside `catch`). When it stops: the call stack (one thread
per task), locals with their parts (struct fields, enum variants, list elements, map entries)
expandable, hover a name or a path like `p.x` / `xs[2]`, any Auk expression in Watch or the Debug
Console (`xs.map(x => x * 2)`, calls to your functions; `total = 0` sets a `var`), edit a local's
value in the Variables view, conditional breakpoints (`n > 3`), step over / into / out, pause. The
program's output goes to the Debug Console. A `launch.json` entry:

```json
{ "type": "auk", "request": "launch", "name": "Debug", "program": "${file}",
  "cwd": "${fileDirname}", "args": [], "stopOnEntry": false }
```

## Language server

`extension.js` (plain JavaScript, no build step) starts `auk lsp` through
[`vscode-languageclient`](https://www.npmjs.com/package/vscode-languageclient) whenever a
`.auk` file is opened. The server re-checks the buffer on every edit, in the file's project
context (the nearest `raft.toml`, its `src/` modules and the dependencies installed in
`.raft/`), and provides:

- **Diagnostics** with their `E0xxx` codes and notes (shown as related information). Errors in
  other modules of the program are reported on those files.
- **Quick fixes** from the compiler's fix-its: missing `?`, missing `&`, `->` vs `:`, a
  misspelled name or type, a missing `..` in a struct pattern, and so on (`Cmd+.` / `Ctrl+.`).
- **Hover**: the type of the expression or binding under the cursor; for functions their
  signature and `///` docs.
- **Go to definition** for locals, constants, functions (the first clause of a clause group),
  structs, enums, shapes, variants and fields, across modules and dependencies.
- **Format Document** (`auk fmt`) and the **Outline** view (functions, structs, enums, shapes,
  tests, constants).

Settings:

| Setting | Default | |
| --- | --- | --- |
| `auk.path` | `auk` | the `auk` executable (absolute path, or a name on `PATH`) |
| `auk.trace.server` | `off` | log the JSON-RPC traffic to the "Auk Language Server" output |

The command **Auk: Restart Language Server** restarts it (it also restarts when `auk.path`
changes).

Known limits: hover and type-based definitions need the program to type-check (while it
doesn't, go to definition falls back to looking names up in the module tree); other modules are
read from disk, so unsaved edits in another open file are not seen until it is saved; the
compiled-in core prelude has no file to jump to.

## Install locally

Install the client library first (the only dependency):

```sh
cd editors/vscode
npm install
```

then either package it:

```sh
npx @vscode/vsce package          # produces auk-lang-0.1.0.vsix
code --install-extension auk-lang-0.1.0.vsix
```

or symlink the folder and reload VS Code:

```sh
ln -s "$PWD/editors/vscode" ~/.vscode/extensions/auk-lang
```

Build and install `auk` (`./build.sh --install` at the repository root: `~/.auk/bin/auk`). The
extension finds it there even when VS Code's PATH doesn't include `~/.auk/bin` (started from the
Dock, VS Code doesn't read your shell profile); `auk` on the PATH comes first, and `auk.path`
picks any other binary (e.g. `target/bin/auk`).

## Testing

The extension itself runs end to end in a real VS Code with `scripts/vscode_e2e.sh` (symbols,
hover, definition, diagnostics, formatting, and a debug session to a breakpoint, its stack,
variables and evaluate). The debug adapter and the language server are also tested by the
integration tests (`tests/runner/`, suites `debug` and `lsp`: they speak DAP and JSON-RPC to
`auk dap` and `auk lsp`).

The grammar:

```sh
python3 -I test/check.py     # JSON, include targets, regex compilation
```

Open `test/sample.auk` and run **Developer: Inspect Editor Tokens and Scopes**
to check scopes by eye.
