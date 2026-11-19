{
  description = "Quiet Depths browser submarine game";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
    each = nixpkgs.lib.genAttrs systems;
  in {
    packages = each (system: let pkgs = nixpkgs.legacyPackages.${system}; in {
      default = pkgs.stdenvNoCC.mkDerivation {
        pname = "quiet-depths"; version = "0.4.0"; src = self;
        nativeBuildInputs = [ pkgs.nodejs ];
        buildPhase = "node --test tests/*.test.mjs && node scripts/build.mjs";
        installPhase = "mkdir -p $out; cp -r dist/. $out/";
      };
    });
    devShells = each (system: { default = nixpkgs.legacyPackages.${system}.mkShell { packages = [ nixpkgs.legacyPackages.${system}.nodejs ]; }; });
  };
}
