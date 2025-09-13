# NixOS Installation Guide

This guide covers how to set up TDD Guard on NixOS and other Nix-based systems.

## Quick Start

### Using Development Shell

The easiest way to get started is using the development shell:

```bash
# Clone the repository
git clone https://github.com/lessuselesss/tdd-guard.git
cd tdd-guard

# Enter development shell with all tools
nix develop

# Install dependencies and build
npm install
npm run build

# Initialize TDD Guard in your project
cd /path/to/your/project
tdd-guard init
```

### Using Nix Flakes

Add TDD Guard to your project's `flake.nix`:

```nix
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    tdd-guard.url = "github:lessuselesss/tdd-guard";
  };

  outputs = { self, nixpkgs, tdd-guard }:
    let
      system = "x86_64-linux"; # adjust for your system
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          # TDD Guard packages
          tdd-guard.packages.${system}.tdd-guard-nix

          # For Nix projects
          pkgs.nix-unit
          pkgs.statix
          pkgs.nixd # for nixf-tidy

          # Node.js for running tdd-guard CLI
          pkgs.nodejs_22
        ];

        shellHook = ''
          # Auto-configure TDD Guard
          export TEST_COMMAND="tdd-guard-nix --project-root $PWD"
          export LINTER_TYPE="statix"

          # Install tdd-guard locally if not present
          if ! command -v tdd-guard &> /dev/null; then
            echo "Installing tdd-guard..."
            npm install -g tdd-guard
          fi

          # Initialize hooks if not present
          if [ ! -f .claude/claude_code_hooks.json ]; then
            tdd-guard init
          fi

          echo "✓ TDD Guard ready for Nix development"
        '';
      };
    };
}
```

## Nix-Specific Setup

### Test Runner (nix-unit)

The Nix reporter uses `nix-unit` for testing:

```bash
# Install the Nix reporter
nix build github:lessuselesss/tdd-guard#tdd-guard-nix

# Or run directly
nix run github:lessuselesss/tdd-guard#tdd-guard-nix -- --help
```

Configure in your `.env`:

```bash
TEST_COMMAND="tdd-guard-nix --project-root $(pwd)"
```

### Linters

#### Statix (Anti-patterns)

```bash
# Enable statix linting
export LINTER_TYPE=statix

# Optional: Create statix.toml for configuration
cat > statix.toml << 'EOF'
disabled = []
ignore = ["vendor/*.nix", ".direnv/**"]
EOF
```

#### nixf-tidy (Semantic Analysis)

```bash
# Enable nixf-tidy for semantic analysis
export LINTER_TYPE=nixf-tidy
```

## Complete Example

Create a new Nix project with TDD Guard:

```bash
# Create project directory
mkdir my-nix-project && cd my-nix-project

# Create flake.nix with TDD Guard
cat > flake.nix << 'EOF'
{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    tdd-guard.url = "github:lessuselesss/tdd-guard";
  };

  outputs = { self, nixpkgs, tdd-guard }:
    let
      system = "x86_64-linux";
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          tdd-guard.packages.${system}.tdd-guard-nix
          pkgs.nix-unit
          pkgs.statix
          pkgs.nodejs_22
        ];

        shellHook = ''
          export TEST_COMMAND="tdd-guard-nix --project-root $PWD"
          export LINTER_TYPE="statix"

          # Install and initialize TDD Guard
          npm install -g tdd-guard 2>/dev/null || true
          [ ! -f .claude/claude_code_hooks.json ] && tdd-guard init

          echo "✓ TDD Guard configured for Nix development"
        '';
      };
    };
}
EOF

# Create initial test file
cat > tests.nix << 'EOF'
{
  testExample = {
    expr = "hello";
    expected = "hello";
  };
}
EOF

# Enter development environment
nix develop

# Start Claude Code and begin TDD!
```

## Troubleshooting

### npm commands not working

On NixOS, npm is not available globally. Use one of these approaches:

1. **Use nix develop**: Provides npm in an isolated shell
2. **Use nix-shell**: `nix-shell -p nodejs_22`
3. **Install to profile**: `nix profile install nixpkgs#nodejs_22`

### Build failures

If the Nix build fails:

1. Ensure you have the latest flake inputs: `nix flake update`
2. Check that all files are committed (flakes require clean git tree)
3. Try building with more verbosity: `nix build -L .#tdd-guard-nix`

### Reporter not found

If `tdd-guard-nix` is not found:

1. Build it explicitly: `nix build .#tdd-guard-nix`
2. Add to PATH: `export PATH="$PWD/result/bin:$PATH"`
3. Or use full path: `./result/bin/tdd-guard-nix`

## Alternative Installation Methods

### Using Home Manager

Add to your Home Manager configuration:

```nix
{ pkgs, ... }: {
  home.packages = [
    (pkgs.callPackage "${tdd-guard}/reporters/nix" {})
  ];

  home.sessionVariables = {
    TEST_COMMAND = "tdd-guard-nix --project-root $HOME/projects";
    LINTER_TYPE = "statix";
  };
}
```

### System-wide Installation

Add to `/etc/nixos/configuration.nix`:

```nix
{ pkgs, ... }: {
  environment.systemPackages = with pkgs; [
    nodejs_22
    nix-unit
    statix
    nixd
  ];
}
```

Then install TDD Guard via npm in your user environment.

## See Also

- [Main Installation Guide](../README.md#installation)
- [Nix Reporter Documentation](../reporters/nix/README.md)
- [Linting Configuration](linting.md)
- [Configuration Options](configuration.md)
