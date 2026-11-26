{
  description = "Quiet Depths browser submarine game";
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.performance-profile.url = "github:pmarreck/performance_profiling/ecf713b81a74a51f76719bf9debc44fe23a0b331";
  outputs = { self, nixpkgs, performance-profile }: let
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
      elmInputs = pkgs.elmPackages.fetchElmDeps {
        elmPackages = elmDependencies;
        elmVersion = elmConfig.elm-version;
        registryDat = nixpkgs.outPath + "/pkgs/development/compilers/elm/registry.dat";
      };
      patrolCatalog = pkgs.runCommand "quiet-depths-patrol-catalog.ts" {
        nativeBuildInputs = [ pkgs.elmPackages.elm pkgs.nodejs ];
      } ''
        ${elmInputs}
        mkdir elm
        cp ${./elm.json} elm.json
        cp ${./elm/PatrolMission.elm} elm/PatrolMission.elm
        cp ${./elm/ExportPatrolMissions.elm} elm/ExportPatrolMissions.elm
        elm make elm/ExportPatrolMissions.elm --optimize --output=export-missions.js
        node ${./scripts/export-patrol-missions.mjs} export-missions.js > "$out"
      '';
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
        strictDeps = true;
        nativeBuildInputs = [ pkgs.nodejs pkgs.elmPackages.elm pkgs.typescript ];
        preBuild = elmInputs;
        buildPhase = ''
          runHook preBuild
          diff -u typescript/mission-catalog.ts ${patrolCatalog} || {
            echo "Refresh typescript/mission-catalog.ts from nix build .#patrol-catalog" >&2
            exit 1
          }
          tsc --project tsconfig.json --noEmit false --outDir "$TMPDIR/typed-game"
          tsc --project tsconfig.worker.json --noEmit false --outDir "$TMPDIR/typed-worker"
          cp "$TMPDIR/typed-game/"*.js src/
          elm make elm/MissionPicker.elm elm/SonarTabs.elm elm/EngineTelegraph.elm --optimize --output=mission-picker.js
          runHook postBuild
        '';
        doCheck = true;
        nativeCheckInputs = [ pkgs.gitMinimal ];
        checkPhase = ''
          runHook preCheck
          patchShebangs --build build test run
          (
            export HOME="$TMPDIR/test-home" XDG_RUNTIME_DIR="$TMPDIR/test-runtime"
            export XDG_CONFIG_HOME="$HOME/config" XDG_DATA_HOME="$HOME/data"
            export XDG_CACHE_HOME="$HOME/cache" XDG_STATE_HOME="$HOME/state"
            mkdir -p -m 700 "$HOME" "$XDG_RUNTIME_DIR"
            node --test tests/*.test.mjs
          )
          runHook postCheck
        '';
        installPhase = ''
          runHook preInstall
          node scripts/build.mjs "$out" ${nixpkgs.lib.escapeShellArg (builtins.toJSON buildProvenance)}
          install -m 0644 LICENSE "$out/LICENSE"
          cp mission-picker.js "$out/mission-picker.js"
          ${installElmLicenses}
          node scripts/build-offline.mjs "$out" "$TMPDIR/typed-worker/service-worker.js"
          runHook postInstall
        '';
        doInstallCheck = true;
        installCheckPhase = ''
          runHook preInstallCheck
          node tests/site-artifact.mjs "$out"
          runHook postInstallCheck
        '';
      };
    in {
      default = pkgs.lib.makeOverridable build { };
      patrol-catalog = patrolCatalog;
    });
    checks = each (system: { site = self.packages.${system}.default; });
    devShells = each (system: let pkgs = nixpkgs.legacyPackages.${system}; in {
      default = pkgs.mkShell { packages = [ pkgs.nodejs pkgs.elmPackages.elm pkgs.typescript ]; };
      profiling = pkgs.mkShell { packages = [ pkgs.nodejs performance-profile.packages.${system}.default ]; };
    });
  };
}
