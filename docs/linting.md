# Linting and Refactoring Support

TDD Guard can optionally check code quality during the refactoring phase (when tests are green) using linters like ESLint or Statix.
When issues are detected, the coding agent will be prompted to fix them.

## Why Use Refactoring Support?

During the TDD green phase, the coding agent may:

- Clean up implementation code
- Extract methods or constants
- Improve naming
- Remove duplication

The refactoring support helps by:

- Running your configured linter automatically after file modifications
- Detecting code quality issues
- Prompting the coding agent to fix any issues found

## Setup

### For JavaScript/TypeScript Projects (ESLint)

1. **Install ESLint** in your project:

   ```bash
   npm install --save-dev eslint@latest
   ```

2. **Enable ESLint** by setting the environment variable:

   ```bash
   LINTER_TYPE=eslint
   ```

### For Nix Projects (Statix)

1. **Install Statix** using Nix:

   ```bash
   # Install globally
   nix profile install nixpkgs#statix
   
   # Or run directly
   nix run nixpkgs#statix -- --help
   
   # Or add to your project's flake.nix
   buildInputs = [ pkgs.statix ];
   ```

2. **Enable Statix** by setting the environment variable:

   ```bash
   LINTER_TYPE=statix
   ```

3. **Optional: Configure Statix** by creating a `statix.toml` file in your project root:

   ```toml
   # Customize which lints to enable/disable
   disabled = []
   
   # Files to ignore
   ignore = [
     "generated.nix",
     "vendor/*.nix"
   ]
   ```

### Hook Configuration

   You can configure this hook either through the interactive `/hooks` command or by manually editing your settings file. See [Settings File Locations](configuration.md#settings-file-locations) to choose the appropriate location. Use the same location as your PreToolUse hook.

   ### Interactive Setup (Recommended)
   1. Type `/hooks` in Claude Code
   2. Select `PostToolUse - After tool execution`
   3. Choose `+ Add new matcher...`
   4. Enter: `Write|Edit|MultiEdit`
   5. Select `+ Add new hook...`
   6. Enter command: `tdd-guard`
   7. Choose where to save

   ### Manual Configuration

   Add to your chosen settings file:

   ```json
   {
     "hooks": {
       "PostToolUse": [
         {
           "matcher": "Write|Edit|MultiEdit",
           "hooks": [
             {
               "type": "command",
               "command": "tdd-guard"
             }
           ]
         }
       ]
     }
   }
   ```

## How It Works

When enabled:

1. After any file modification (Edit, MultiEdit, Write)
2. TDD Guard runs your configured linter on modified files
3. If issues are found, the coding agent receives a notification
4. The agent will then fix the identified issues

Without setting `LINTER_TYPE`, TDD Guard skips all linting operations.

## Linter Configuration

### ESLint Configuration

**Tip**: Configure ESLint with complexity rules (e.g., `complexity`, `max-depth`) and the SonarJS plugin to encourage meaningful refactoring.
These rules help identify code that could benefit from simplification during the green phase.

For effective refactoring support, consider adding these rules to your `.eslintrc.js`:

```javascript
module.exports = {
  rules: {
    complexity: ['warn', 10],
    'max-depth': ['warn', 4],
    'max-lines-per-function': ['warn', 50],
    'max-nested-callbacks': ['warn', 3],
    'max-params': ['warn', 4],
  },
}
```

### Statix Configuration

Statix comes with sensible defaults, but you can customize it with a `statix.toml` configuration file:

```toml
# Enable all lints by default, disable specific ones if needed
disabled = [
  # "empty_let_in",        # Allow empty let...in expressions
  # "manual_inherit",      # Allow manual inherit statements
]

# Files or patterns to ignore during linting
ignore = [
  "shell.nix",           # Generated files
  "vendor/*.nix",        # Third-party code
  ".direnv/**",          # Build artifacts
]
```

**Available Statix Rules:**
- `bool_comparison` - Detects unnecessary boolean comparisons
- `empty_let_in` - Finds empty let...in expressions
- `manual_inherit` - Suggests automatic inheritance
- `legacy_let_syntax` - Modernizes let syntax
- `eta_reduction` - Suggests eta reduction opportunities
- `useless_parens` - Removes unnecessary parentheses
- `empty_pattern` - Detects empty patterns
- `unquoted_uri` - Suggests proper URI quoting
- And more...

## Troubleshooting

### ESLint Not Running

1. Verify ESLint is installed: `npm list eslint`
2. Check that `LINTER_TYPE=eslint` is set in your `.env` file
3. Ensure the PostToolUse hook is configured
4. Restart your Claude session after making changes

### Statix Not Running

1. Verify Statix is installed: `statix --version`
2. Check that `LINTER_TYPE=statix` is set in your `.env` file
3. Ensure you have nix-unit available for JSON output (if required)
4. Verify your `.nix` files are syntactically correct
5. Restart your Claude session after making changes

### General Linting Issues

- **No linter output**: Ensure files you're editing match the linter's file patterns
- **Permission errors**: Make sure the linter binary is executable
- **Configuration errors**: Check your linter config file syntax
- **Path issues**: Verify the linter is available in your `$PATH`
