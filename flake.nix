{
  description = "Quiet Depths browser submarine game";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
    each = nixpkgs.lib.genAttrs systems;
    releaseVersion = (builtins.fromJSON (builtins.readFile ./package.json)).version;
  in {
    packages = each (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      build = { firstParentBase ? null, baseCommitCount ? null }: let
        hasRevision = self ? rev && firstParentBase != null && baseCommitCount != null;
        buildProvenance = {
          inherit releaseVersion firstParentBase baseCommitCount;
          status = if hasRevision then "verified" else if self ? dirtyRev then "dirty" else "unavailable";
          commit = self.rev or null;
          revision = if hasRevision then "r${toString baseCommitCount}-${builtins.substring 0 6 self.rev}" else null;
        };
      in pkgs.stdenvNoCC.mkDerivation {
        pname = "quiet-depths";
        version = releaseVersion;
        src = self;
        nativeBuildInputs = [ pkgs.nodejs ];
        buildPhase = ''
          runHook preBuild
          node --test tests/*.test.mjs
          runHook postBuild
        '';
        installPhase = ''
          runHook preInstall
          node scripts/build.mjs "$out"
          printf '%s\n' ${nixpkgs.lib.escapeShellArg (builtins.toJSON buildProvenance)} > "$out/build-provenance.json"
          runHook postInstall
        '';
      };
    in {
      default = pkgs.lib.makeOverridable build { };
    });
    devShells = each (system: { default = nixpkgs.legacyPackages.${system}.mkShell { packages = [ nixpkgs.legacyPackages.${system}.nodejs ]; }; });
  };
}
