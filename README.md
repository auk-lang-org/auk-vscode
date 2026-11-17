# Duck for VS Code

Syntax highlighting, editor configuration and language-server support for the Duck language
(`.duck` files).

## What it provides

- Language id `duck` for `*.duck` files; `quack.toml` is opened as TOML.
- A TextMate grammar (`syntaxes/duck.tmLanguage.json`) covering:
  - keywords, effect names after `uses`, builtin types (`int float bool char str Value`)
  - function names in `fn` declarations, capitalized type names, enum variants
  - numbers (`1_000`, `0xff`, `0b1010`, `0o755`, `3.14`, `1e-9`)
  - chars and strings with escapes (`\n`, `\u{1F986}`, ...)
  - string interpolation `{expr}` highlighted as embedded Duck code (nested braces
    and nested strings work), `{{`/`}}` escapes, and format specs (`{x:.2}`, `{n:>5}`)
  - raw `r"..."`, triple-quoted `"""..."""` and `r"""..."""` strings
  - `//`, nested `/* */`, and `///` doc comments (distinct scope)
  - operators (`=> |> ?. .. ..= +% -% *% **`, ...) and `T?` / `T!` type suffixes
  - the hole `??`, scoped `invalid.illegal.hole.duck` so unfilled holes stand out
- Language configuration: comment toggling, bracket matching, auto-closing pairs,
  indentation on `{` / `}`, `///` continuation on Enter, and `// region` folding markers.

## Run and test

A `.duck` editor gets buttons in its title bar (top right): **Run** (▶, also `Ctrl+F5`), **Run
with Arguments…** (asks for them and remembers the last ones per file), **Test** (beaker) and
**Debug** (also `F5`). Run and Test save the file and run `duck run <file>` / `duck test <file>`
in a "Duck" terminal from the file's folder.

## Debugging

`F5` (or **Duck: Debug File**) debugs the active file through `duck dap`: click in the gutter
for breakpoints (a line without code moves to the next one that has some), add function
breakpoints in the Breakpoints view, and choose whether panics stop (**Uncaught panics**, on by
default, or **All panics**, also those inside `catch`). When it stops: the call stack (one thread
per task), locals with their parts (struct fields, enum variants, list elements, map entries)
expandable, hover a name or a path like `p.x` / `xs[2]`, any Duck expression in Watch or the Debug
Console (`xs.map(x => x * 2)`, calls to your functions; `total = 0` sets a `var`), edit a local's
value in the Variables view, conditional breakpoints (`n > 3`), step over / into / out, pause. The
program's output goes to the Debug Console. A `launch.json` entry:

```json
{ "type": "duck", "request": "launch", "name": "Debug", "program": "${file}",
  "cwd": "${fileDirname}", "args": [], "stopOnEntry": false }
```

## Language server

`extension.js` (plain JavaScript, no build step) starts `duck lsp` through
[`vscode-languageclient`](https://www.npmjs.com/package/vscode-languageclient) whenever a
`.duck` file is opened. The server re-checks the buffer on every edit, in the file's project
context (the nearest `quack.toml`, its `src/` modules and the dependencies installed in
`.quack/`), and provides:

- **Diagnostics** with their `E0xxx` codes and notes (shown as related information). Errors in
  other modules of the program are reported on those files.
- **Quick fixes** from the compiler's fix-its: missing `?`, missing `&`, `->` vs `:`, a
  misspelled name or type, a missing `..` in a struct pattern, and so on (`Cmd+.` / `Ctrl+.`).
- **Hover**: the type of the expression or binding under the cursor; for functions their
  signature and `///` docs.
- **Go to definition** for locals, constants, functions (the first clause of a clause group),
  structs, enums, shapes, variants and fields, across modules and dependencies.
- **Format Document** (`duck fmt`) and the **Outline** view (functions, structs, enums, shapes,
  tests, constants).

Settings:

| Setting | Default | |
| --- | --- | --- |
| `duck.path` | `duck` | the `duck` executable (absolute path, or a name on `PATH`) |
| `duck.trace.server` | `off` | log the JSON-RPC traffic to the "Duck Language Server" output |

The command **Duck: Restart Language Server** restarts it (it also restarts when `duck.path`
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
npx @vscode/vsce package          # produces duck-lang-0.1.0.vsix
code --install-extension duck-lang-0.1.0.vsix
```

or symlink the folder and reload VS Code:

```sh
ln -s "$PWD/editors/vscode" ~/.vscode/extensions/duck-lang
```

Build `duck` (`cargo build --release` at the repository root) and put it on `PATH`, or point
`duck.path` at `target/release/duck`.

## Testing

The debug adapter is tested end to end by `cargo test --test debug` (it speaks DAP to
`duck dap`). The language server is tested end to end by `cargo test --test v2_lsp` (it spawns `duck lsp`
and speaks JSON-RPC to it).

The grammar:

```sh
python3 -I test/check.py     # JSON, include targets, regex compilation
```

Open `test/sample.duck` and run **Developer: Inspect Editor Tokens and Scopes**
to check scopes by eye.
