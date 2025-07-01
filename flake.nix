{
  description = "Remark plugin for PlantUML with local image storage";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        nodejs = pkgs.nodejs_18;
        npm = pkgs.nodePackages.npm;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            nodejs
            npm
            pkgs.git
          ];

          shellHook = ''
            echo "Node.js development environment loaded"
            echo "Node.js version: $(node --version)"
            echo "npm version: $(npm --version)"
          '';
        };

        packages.default = pkgs.stdenv.mkDerivation {
          pname = "remark-plantuml-local";
          version = "1.0.0";
          src = ./.;

          buildInputs = [ nodejs npm ];

          buildPhase = ''
            npm ci
            npm test
          '';

          installPhase = ''
            mkdir -p $out/lib/node_modules/remark-plantuml-local
            cp -r . $out/lib/node_modules/remark-plantuml-local/
          '';

          meta = with pkgs.lib; {
            description = "Remark plugin for PlantUML with local image storage";
            homepage = "https://github.com/crooy/remark-plantuml-local";
            license = licenses.mit;
            platforms = platforms.all;
          };
        };
      }
    );
}
