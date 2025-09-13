{
  description = "TDD Guard Nix test reporter";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        packages.default = pkgs.writeShellApplication {
          name = "tdd-guard-nix";
          runtimeInputs = with pkgs; [ nix-unit jq coreutils ];
          text = builtins.readFile ./src/tdd-guard-nix.sh;
        };

        packages.tdd-guard-nix = self.packages.${system}.default;

        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nix-unit
            jq
            shellcheck
          ];
        };

        checks.default = pkgs.runCommand "check-tdd-guard-nix" {
          buildInputs = with pkgs; [ shellcheck ];
        } ''
          cd ${self}
          shellcheck src/tdd-guard-nix.sh
          touch $out
        '';
      });
}