{
  description = "Quiet Depths browser submarine game";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  outputs = { self, nixpkgs }: let
    systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ];
    each = nixpkgs.lib.genAttrs systems;
    releaseVersion = (builtins.fromJSON (builtins.readFile ./package.json)).version;
    elmConfig = builtins.fromJSON (builtins.readFile ./elm.json);
    elmHashes = {
      "elm/browser" = "0nagb9ajacxbbg985r4k9h0jadqpp0gp84nm94kcgbr5sf8i9x13";
      "elm/core" = "19w0iisdd66ywjayyga4kv2p1v9rxzqjaxhckp8ni6n8i0fb2dvf";
      "elm/html" = "1n3gpzmpqqdsldys4ipgyl1zacn0kbpc3g4v3hdpiyfjlgh8bf3k";
      "elm/json" = "0kjwrz195z84kwywaxhhlnpl3p251qlbm5iz6byd6jky2crmyqyh";
      "elm/time" = "0vch7i86vn0x8b850w1p69vplll1bnbkp8s383z7pinyg94cm2z1";
      "elm/url" = "0av8x5syid40sgpl5vd7pry2rq0q4pga28b4yykn9gd9v12rs3l4";
      "elm/virtual-dom" = "0q1v5gi4g336bzz1lgwpn5b1639lrn63d8y6k6pimcyismp2i1yg";
    };
    elmDependencyVersions = elmConfig.dependencies.direct // elmConfig.dependencies.indirect;
    elmDependencies = builtins.mapAttrs (name: version: {
      inherit version;
      sha256 = elmHashes.${name};
    }) elmDependencyVersions;
    installElmLicenses = nixpkgs.lib.concatStringsSep "\n" (nixpkgs.lib.mapAttrsToList (name: version: ''
      install -D "$ELM_HOME/${elmConfig.elm-version}/packages/${name}/${version}/LICENSE" "$out/licenses/${name}.txt"
    '') elmDependencyVersions);
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
        nativeBuildInputs = [ pkgs.nodejs pkgs.elmPackages.elm ];
        preBuild = pkgs.elmPackages.fetchElmDeps {
          elmPackages = elmDependencies;
          elmVersion = elmConfig.elm-version;
          registryDat = nixpkgs.outPath + "/pkgs/development/compilers/elm/registry.dat";
        };
        buildPhase = ''
          runHook preBuild
          elm make elm/MissionPicker.elm --optimize --output=mission-picker.js
          node --test tests/*.test.mjs
          runHook postBuild
        '';
        installPhase = ''
          runHook preInstall
          node scripts/build.mjs "$out"
          install -m 0644 LICENSE "$out/LICENSE"
          cp mission-picker.js "$out/mission-picker.js"
          ${installElmLicenses}
          printf '%s\n' ${nixpkgs.lib.escapeShellArg (builtins.toJSON buildProvenance)} > "$out/build-provenance.json"
          runHook postInstall
        '';
      };
    in {
      default = pkgs.lib.makeOverridable build { };
    });
    devShells = each (system: let pkgs = nixpkgs.legacyPackages.${system}; in {
      default = pkgs.mkShell { packages = [ pkgs.nodejs pkgs.elmPackages.elm ]; };
    });
  };
}
