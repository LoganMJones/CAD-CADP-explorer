# CAD–CADP bifurcation explorer

Static GitHub Pages app comparing **predator-absent (CAD)** and **predator-present (CADP)** cyclic adaptive-dynamics bifurcation diagrams.

## View locally

```bash
cd CAD-CADP-explorer
python3 -m http.server 8080
# open http://localhost:8080
```

Requires `data/cad.json.gz` and `data/cadp.json.gz` (see below).

## Regenerate data

From the sibling [CAD-CADP](https://github.com/LoganMJones/CAD-CADP) repo:

```bash
# denser CAD continuations (CADP stored runs already use ds_max=0.01)
julia --project=. prototypes/densify_cad_ds001.jl

# export JSON.gz into this repo's data/
julia --project=. prototypes/export_web_explorer.jl ../CAD-CADP-explorer/data
```

## GitHub Pages

```bash
# from this directory (after creating the empty GitHub repo)
gh repo create LoganMJones/CAD-CADP-explorer --public --source=. --remote=origin --push
# then: Settings → Pages → Deploy from branch main → / (root)
```

Note: `data/*.json.gz` is ~50–75 MB each. Prefer [Git LFS](https://git-lfs.com) before pushing:

```bash
git lfs install
git lfs track "data/*.json.gz"
git add .gitattributes data/*.json.gz
git commit -m "Track data with Git LFS"
```
