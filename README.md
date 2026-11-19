# Auk for VS Code

Language support for [Auk](https://auk-lang.org), a statically typed language that compiles to
native code: errors as you type, quick fixes, hover, go to definition, formatting, one-click run
and test, and a full debugger.

## Getting started

1. Install Auk:

   ```sh
   curl -fsSL https://auk-lang.org/install.sh | sh
   ```

   This puts `auk` and `raft` in `~/.auk/bin`. The extension finds them there even when VS Code
   was started from the Dock and doesn't see your shell's `PATH`.

2. Install this extension and open a `.auk` file.

## Features

### Errors as you type

Every edit is checked by the compiler (`auk lsp`), in the context of its project: the nearest
`raft.toml`, its `src/` modules and the dependencies installed in `.raft/`. Diagnostics carry
their `E0xxx` codes and notes. Errors in other modules show up on those files.

### Quick fixes

The compiler's fix-its are offered as quick fixes (`Cmd+.` / `Ctrl+.`): a missing `?` or `&`,
`->` instead of `:`, a misspelled name or type, a missing `..` in a struct pattern, and more.

### Hover and go to definition

Hover shows the type of any expression or binding, and for functions their signature and `///`
docs. Go to definition works for locals, constants, functions, structs, enums, shapes, variants
and fields, across modules and dependencies.

### Formatting and outline

**Format Document** runs `auk fmt`. The **Outline** view lists functions, structs, enums, shapes,
tests and constants.

### Run and test

A `.auk` editor gets buttons in its title bar:

- **Run** (▶, also `Ctrl+F5`): `auk run <file>` in an "Auk" terminal.
- **Run with Arguments…**: asks for the arguments and remembers the last ones per file.
- **Test** (beaker): `auk test <file>`.
- **Debug** (also `F5`).

### Debugging

`F5` (or **Auk: Debug File**) debugs the active file through `auk dap`:

- Line breakpoints, conditional breakpoints (`n > 3`) and function breakpoints. A breakpoint on
  a line without code moves to the next line that has some.
- Stop on **Uncaught panics** (the default) or **All panics**, including those inside `catch`.
- The call stack, with one thread per task.
- Locals that expand into their parts: struct fields, enum variants, list elements, map entries.
  Edit a local's value in the Variables view.
- Hover a name or a path like `p.x` or `xs[2]`.
- Evaluate any Auk expression in Watch or the Debug Console, such as `xs.map(x => x * 2)` or a
  call to one of your functions. `total = 0` sets a `var`.
- Step over, into and out, and pause. The program's output goes to the Debug Console.

A `launch.json` entry:

```json
{ "type": "auk", "request": "launch", "name": "Debug", "program": "${file}",
  "cwd": "${fileDirname}", "args": [], "stopOnEntry": false }
```

### Highlighting and editing

- Highlighting for the whole language: string interpolation (`{expr}`, with format specs like
  `{x:.2}`), raw and triple-quoted strings, effect names after `uses`, `T?` / `T!` types, and
  unfilled `??` holes, which stand out.
- Comment toggling, bracket matching, auto-closing pairs, indentation on `{` / `}`, `///`
  continued on Enter, and `// region` folding.
- `raft.toml` files open as TOML.
- Two color themes, **Ice Floe** and **Ice Floe Night**, in Auk's colors.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `auk.path` | `auk` | the `auk` executable: an absolute path, or a name on the `PATH` |
| `auk.trace.server` | `off` | log the language server's JSON-RPC traffic to the "Auk Language Server" output |

`auk` on the `PATH` is used first, then `~/.auk/bin/auk`. **Auk: Restart Language Server**
restarts the server; it also restarts when `auk.path` changes.

## Known limits

- Hover and type-based go to definition need the program to type-check. While it doesn't, go to
  definition falls back to looking names up in the module tree.
- Other modules are read from disk, so unsaved edits in another open file aren't seen until
  it's saved.
- The compiled-in core library has no source file to jump to.

## Development

The extension is plain JavaScript with no build step: `extension.js` starts `auk lsp` through
[`vscode-languageclient`](https://www.npmjs.com/package/vscode-languageclient).

```sh
npm install
ln -s "$PWD" ~/.vscode/extensions/auk-lang    # run from this checkout, then reload VS Code
npx @vscode/vsce package                      # or build a .vsix
```

Tests:

- `scripts/e2e.sh [<auk>...]` runs the extension in a real VS Code: symbols, hover, definition,
  diagnostics, formatting, and a debug session to a breakpoint with its stack, variables and
  evaluate.
- `python3 -I test/check.py` checks the grammar (JSON, include targets, regexes). To check
  scopes by eye, open `test/sample.auk` and run **Developer: Inspect Editor Tokens and Scopes**.
- The language server and debug adapter are also tested in the
  [Auk repository](https://github.com/auk-lang-org/auk) (`tests/runner/`, suites `lsp` and
  `debug`).

## License

MIT
