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

        # TDD Guard CLI package
        tdd-guard-cli = pkgs.buildNpmPackage {
          pname = "tdd-guard";
          version = "1.0.1";
          src = ./.;
          
          npmDepsHash = "sha256-V6bcvTymrWcmAs+VMmX46MDnBUYGnzsIUi26pdeVOrg=";
          
          # Allow cache to be writable
          makeCacheWritable = true;
          
          # Skip problematic postinstall scripts
          npmInstallFlags = [ "--ignore-scripts" ];
          
          # We don't need to build since we have pre-built dist/
          dontNpmBuild = true;
          
          
          installPhase = ''
            runHook preInstall
            
            # Copy everything to output
            mkdir -p $out/lib/node_modules/tdd-guard
            cp -r . $out/lib/node_modules/tdd-guard
            
            # Remove broken symlinks
            find $out/lib/node_modules/tdd-guard -type l -exec test ! -e {} \; -print | xargs rm -f
            
            # Ensure dist directory exists (should already from source)
            if [ ! -d "$out/lib/node_modules/tdd-guard/dist" ]; then
              echo "Building dist directory..."
              cd $out/lib/node_modules/tdd-guard
              npx tsc --build tsconfig.build.json
            fi
            
            # Create bin wrapper
            mkdir -p $out/bin
            cat > $out/bin/tdd-guard << EOF
            #!/usr/bin/env bash
            exec ${pkgs.nodejs_22}/bin/node $out/lib/node_modules/tdd-guard/dist/cli/tdd-guard.js "\$@"
            EOF
            chmod +x $out/bin/tdd-guard
            
            runHook postInstall
          '';
          
          meta = with pkgs.lib; {
            description = "Automated Test-Driven Development enforcement for Claude Code";
            homepage = "https://github.com/nizos/tdd-guard";
            license = licenses.mit;
            maintainers = [ ];
          };
        };

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
            # TDD Guard packages
            tdd-guard-cli
            tdd-guard-nix
            
            # Node.js ecosystem
            nodejs_22
            npm-check-updates

            # Nix tooling
            nix-unit
            nil # Nix LSP
            nixpkgs-fmt
            statix # Nix linter
            nixd # for nixf-tidy

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
          default = tdd-guard-cli;
          tdd-guard = tdd-guard-cli;
          tdd-guard-cli = tdd-guard-cli;
          tdd-guard-nix = tdd-guard-nix;
        };

        # Apps - easy way to run the tools
        apps = {
          default = flake-utils.lib.mkApp {
            drv = tdd-guard-cli;
          };
          tdd-guard = flake-utils.lib.mkApp {
            drv = tdd-guard-cli;
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
            mkdir -p $out
            cd $out

            # Test that our test artifacts can be evaluated by nix-unit
            echo "Testing passing artifacts..."
            nix-unit ${./.}/reporters/test/artifacts/nix/passing/tests.nix > passing.out 2>&1 || true

            echo "Testing failing artifacts..."
            nix-unit ${./.}/reporters/test/artifacts/nix/failing/tests.nix > failing.out 2>&1 || true

            echo "Testing import error artifacts..."
            nix-unit ${./.}/reporters/test/artifacts/nix/import/tests.nix > import.out 2>&1 || true

            echo "All artifact tests completed successfully"
          '';
        };

        # Formatter
        formatter = pkgs.nixpkgs-fmt;
      });
}