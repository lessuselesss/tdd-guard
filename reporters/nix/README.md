# TDD Guard Nix Reporter

A test reporter for [nix-unit](https://github.com/nix-community/nix-unit) that captures Nix test results for TDD Guard validation.

## Overview

This reporter integrates with TDD Guard to enforce Test-Driven Development practices in Nix projects by:

- Capturing nix-unit test results
- Transforming them to TDD Guard's standardized format
- Enabling AI-powered TDD validation for Nix code

## Installation

### Method 1: Via Project Root Flake (Recommended)

If the project has a root `flake.nix`, simply use the development shell:

```bash
cd /path/to/tdd-guard/project
nix develop
# tdd-guard-nix is now available in PATH
```

### Method 2: Local Development

```bash
# Clone and build locally
git clone https://github.com/your-org/tdd-guard.git
cd tdd-guard/reporters/nix

# Build the package
nix build

# Add to PATH or use directly
./result/bin/tdd-guard-nix --help

# Or add to your shell profile
export PATH="$PWD/result/bin:$PATH"
```

### Method 3: Via Nix Profile (System-wide)

```bash
# Install from local repository
cd tdd-guard/reporters/nix
nix profile install .

# Or install directly from GitHub (once published)
# nix profile install github:your-org/tdd-guard#tdd-guard-nix
```

### Method 4: Integration in Your Project

Add to your project's `flake.nix`:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    tdd-guard.url = "github:your-org/tdd-guard";
  };

  outputs = { self, nixpkgs, tdd-guard }: {
    devShells.default = nixpkgs.legacyPackages.x86_64-linux.mkShell {
      buildInputs = [
        # Include the Nix reporter
        tdd-guard.packages.x86_64-linux.tdd-guard-nix

        # Include other TDD Guard components if needed
        tdd-guard.packages.x86_64-linux.default  # Main CLI
      ];
    };
  };
}
```

## Prerequisites

- [nix-unit](https://github.com/nix-community/nix-unit) - The Nix testing framework
- `jq` - For JSON processing (included automatically)
- TDD Guard CLI - The main TDD Guard package

## Usage

### Basic Usage

```bash
# Run tests and capture results
tdd-guard-nix --project-root /path/to/project

# Specify custom test file
tdd-guard-nix --project-root /path/to/project --test-file my-tests.nix
```

### Passthrough Mode

Use passthrough mode when you want to pipe nix-unit output:

```bash
# Manual passthrough
nix-unit tests.nix | tdd-guard-nix --project-root /path/to/project --passthrough

# Auto-passthrough (enabled by default when stdin is piped)
nix-unit tests.nix | tdd-guard-nix --project-root /path/to/project
```

### Integration with TDD Guard

Add the reporter to your `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit|TodoWrite",
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

## Test File Format

This reporter works with [nix-unit](https://github.com/nix-community/nix-unit) test files. Create a `tests.nix` file:

```nix
{
  testBasicMath = {
    expr = 1 + 1;
    expected = 2;
  };

  testStringConcatenation = {
    expr = "hello" + "world";
    expected = "helloworld";
  };

  testListOperations = {
    expr = builtins.length [1 2 3];
    expected = 3;
  };
}
```

## Command Line Options

```
tdd-guard-nix - Nix test reporter for TDD Guard validation

USAGE:
    tdd-guard-nix --project-root <PATH> [OPTIONS]

OPTIONS:
    --project-root <PATH>    Absolute path to project root directory (required)
    --passthrough           Read test output from stdin instead of running nix-unit
    --test-file <FILE>      Path to Nix test file (default: tests.nix or test.nix)
    --timeout <SECONDS>     Maximum execution time (default: 300, max: 3600)
    --max-output <LINES>    Maximum output lines to prevent memory issues (default: 10000)
    --help                  Show this help message

EXAMPLES:
    # Basic usage
    tdd-guard-nix --project-root $(pwd)

    # Custom test file with timeout
    tdd-guard-nix --project-root /path/to/project --test-file my-tests.nix --timeout 60

    # Passthrough mode with output limit
    nix-unit tests.nix | tdd-guard-nix --project-root $(pwd) --passthrough --max-output 5000
```

## Output Format

The reporter outputs to `.claude/tdd-guard/data/test.json` in TDD Guard's standardized format:

```json
{
  "testModules": [
    {
      "moduleId": "tests",
      "tests": [
        {
          "name": "testBasicMath",
          "fullName": "tests.testBasicMath",
          "state": "passed"
        },
        {
          "name": "testFailingCase",
          "fullName": "tests.testFailingCase",
          "state": "failed",
          "errors": [
            {
              "message": "expected 3 but got 2"
            }
          ]
        }
      ]
    }
  ],
  "reason": "failed"
}
```

## Error Handling

The reporter handles various Nix error scenarios:

### Evaluation Errors

When Nix evaluation fails, a compilation module is created:

```json
{
  "testModules": [
    {
      "moduleId": "compilation",
      "tests": [
        {
          "name": "evaluation",
          "fullName": "compilation.evaluation",
          "state": "failed",
          "errors": [
            {
              "message": "error: undefined variable 'nonExistentFunction'"
            }
          ]
        }
      ]
    }
  ],
  "reason": "failed"
}
```

### Test File Not Found

If no test file is found, the reporter searches for:

1. `tests.nix`
2. `test.nix`
3. `test/tests.nix`
4. `nix/tests.nix`

Use `--test-file` to specify a custom path.

## Development

### Running Tests

```bash
# Run shellcheck
nix flake check

# Manual testing
./src/tdd-guard-nix.sh --help
```

### Project Structure

```
reporters/nix/
├── flake.nix                  # Nix package definition
├── src/
│   └── tdd-guard-nix.sh      # Main shell script
├── README.md                  # This file
└── tests/                     # Test artifacts (integration tests)
```

## Troubleshooting

### Common Issues

1. **"Command not found: nix-unit"**

   ```bash
   # Install nix-unit globally
   nix profile install nixpkgs#nix-unit

   # Or add to your project's flake.nix development shell
   buildInputs = [ pkgs.nix-unit ];

   # Verify installation
   nix-unit --help
   ```

2. **"No Nix test file found in current directory"**

   ```bash
   # Create a basic test file
   cat > tests.nix << 'EOF'
   {
     testBasicMath = {
       expr = 1 + 1;
       expected = 2;
     };
   }
   EOF

   # Or specify custom location
   tdd-guard-nix --project-root $(pwd) --test-file path/to/my-tests.nix
   ```

3. **"Project root must be an absolute path"**

   ```bash
   # ✅ Correct - use absolute path
   tdd-guard-nix --project-root $(pwd)
   tdd-guard-nix --project-root /home/user/project

   # ❌ Wrong - relative paths not allowed
   tdd-guard-nix --project-root ./project
   tdd-guard-nix --project-root ../project
   ```

4. **"Execution timed out after N seconds"**

   ```bash
   # Increase timeout for complex evaluations
   tdd-guard-nix --project-root $(pwd) --timeout 600

   # Check for infinite recursion in your Nix expressions
   nix-unit tests.nix  # Run directly to debug

   # Common causes:
   # - Infinite recursion: let x = x + 1; in x
   # - Large dataset processing without proper laziness
   # - Complex derivation builds during evaluation
   ```

5. **"Output truncated - too many lines"**

   ```bash
   # Increase output limit
   tdd-guard-nix --project-root $(pwd) --max-output 50000

   # Or investigate why so much output is generated
   nix-unit tests.nix 2>&1 | wc -l
   ```

6. **Tests not being captured by TDD Guard**
   - Verify `.claude/settings.json` hook configuration:
     ```json
     {
       "hooks": {
         "PreToolUse": [
           {
             "matcher": "Write|Edit|MultiEdit",
             "hooks": [{ "type": "command", "command": "tdd-guard" }]
           }
         ]
       }
     }
     ```
   - Check that TDD Guard CLI is installed: `which tdd-guard`
   - Ensure nix reporter is in PATH: `which tdd-guard-nix`
   - Verify project root has `.claude/tdd-guard/data/` directory

### Debug Mode

For debugging, run nix-unit directly to see raw output:

```bash
nix-unit tests.nix
```

Then compare with reporter output:

```bash
tdd-guard-nix --project-root $(pwd) --test-file tests.nix
cat .claude/tdd-guard/data/test.json | jq
```

## Performance and Security

### Resource Limits

The reporter includes built-in protections against resource exhaustion:

- **Execution timeout**: Default 5 minutes, configurable with `--timeout`
- **Output limits**: Default 10,000 lines, configurable with `--max-output`
- **Memory protection**: Prevents unbounded memory usage from large outputs
- **Cross-platform timeout**: Works on Linux, macOS, and other Unix systems

### Security Features

- **Input validation**: All command-line arguments are validated
- **Path security**: Only absolute paths accepted for project root
- **Resource bounds**: Prevents infinite loops and memory exhaustion
- **Error isolation**: Failures are contained and don't crash the reporter

### Performance Tips

1. **Optimize test expressions**: Avoid expensive computations in tests
2. **Use appropriate timeouts**: Set longer timeouts for complex evaluations
3. **Monitor output size**: Large outputs may indicate inefficient test design
4. **Profile with nix-unit**: Use `nix-unit` directly to debug slow tests

```bash
# Profile test execution time
time nix-unit tests.nix

# Check memory usage during tests
/usr/bin/time -v nix-unit tests.nix
```

## Contributing

1. Make changes to `src/tdd-guard-nix.sh`
2. Test with `nix flake check`
3. Update integration tests if needed
4. Submit a pull request

## License

MIT - See the main TDD Guard repository for full license details.
