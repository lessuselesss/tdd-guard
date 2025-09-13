{
  description = "TDD Guard - Automated Test-Driven Development enforcement for Claude Code";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};

        # TDD Guard Nix reporter package
        tdd-guard-nix = pkgs.writeShellApplication {
          name = "tdd-guard-nix";
          runtimeInputs = with pkgs; [ nix-unit jq coreutils ];
          text = builtins.readFile ./reporters/nix/src/tdd-guard-nix.sh;
        };

      in
      {
        # Development shell with all required tools
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js ecosystem
            nodejs_22
            npm-check-updates

            # Nix tooling
            nix-unit
            nil # Nix LSP
            nixpkgs-fmt
            statix # Nix linter

            # Development tools
            jq
            shellcheck

            # Language toolchains for testing other reporters
            go_1_24
            rustc
            cargo
            python3
            php81
            phpPackages.composer

            # Testing and CI tools
            git
            gh # GitHub CLI
          ];

          shellHook = ''
            echo "🔧 TDD Guard Development Environment"
            echo "📦 Node.js: $(node --version)"
            echo "🦀 Rust: $(rustc --version | cut -d' ' -f2)"
            echo "🐹 Go: $(go version | cut -d' ' -f3)"
            echo "🐍 Python: $(python3 --version | cut -d' ' -f2)"
            echo "🐘 PHP: $(php --version | head -n1 | cut -d' ' -f2)"
            echo "❄️  Nix: $(nix --version | cut -d' ' -f3)"
            echo "🧪 nix-unit: $(nix-unit --version 2>/dev/null || echo "available")"
            echo ""
            echo "Quick commands:"
            echo "  npm install          # Install dependencies"
            echo "  npm run test         # Run all tests"
            echo "  npm run test:reporters # Test all reporters including Nix"
            echo "  nix build .#tdd-guard-nix # Build Nix reporter"
            echo ""
          '';
        };

        # Packages
        packages = {
          default = tdd-guard-nix;
          tdd-guard-nix = tdd-guard-nix;
        };

        # Apps - easy way to run the reporter
        apps = {
          default = flake-utils.lib.mkApp {
            drv = tdd-guard-nix;
          };
          tdd-guard-nix = flake-utils.lib.mkApp {
            drv = tdd-guard-nix;
          };
        };

        # Checks for CI
        checks = {
          # Test that the Nix reporter builds
          tdd-guard-nix-builds = tdd-guard-nix;

          # Shellcheck the reporter script
          shellcheck-nix-reporter = pkgs.runCommand "shellcheck-nix-reporter" {
            buildInputs = [ pkgs.shellcheck ];
          } ''
            shellcheck ${./reporters/nix/src/tdd-guard-nix.sh}
            touch $out
          '';

          # Format check for Nix files
          nixpkgs-fmt-check = pkgs.runCommand "nixpkgs-fmt-check" {
            buildInputs = [ pkgs.nixpkgs-fmt ];
          } ''
            nixpkgs-fmt --check ${./.}
            touch $out
          '';

          # Test Nix artifacts can be evaluated
          nix-artifacts-eval = pkgs.runCommand "nix-artifacts-eval" {
            buildInputs = [ pkgs.nix-unit ];
          } ''
            cd ${./.}

            # Test that our test artifacts can be evaluated by nix-unit
            echo "Testing passing artifacts..."
            nix-unit reporters/test/artifacts/nix/passing/tests.nix > passing.out 2>&1 || true

            echo "Testing failing artifacts..."
            nix-unit reporters/test/artifacts/nix/failing/tests.nix > failing.out 2>&1 || true

            echo "Testing import error artifacts..."
            nix-unit reporters/test/artifacts/nix/import/tests.nix > import.out 2>&1 || true

            # Save outputs for inspection
            mkdir -p $out
            cp *.out $out/
          '';
        };

        # Formatter
        formatter = pkgs.nixpkgs-fmt;
      });
}