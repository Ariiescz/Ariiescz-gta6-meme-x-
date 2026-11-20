# GTA 6 meme bounty — gta6-meme-x-01

Entry for the make.fun bounty **"Post a GTA 6 meme on X"**. The joke: a
sunset **WANTED** poster for calling in sick on GTA 6 launch day, with a ghost
as the getaway passenger.

## How the meme was made

`meme.html` is a self-contained HTML/SVG scene. The ghost comes from the
make.fun press kit assets. It was rendered to the 1080×1080 `meme.png` with the
headless Chromium shell via the dependency-free CDP helper `shot.cjs`.

## Run the program

The program copies `POST.json` byte-for-byte into `out/POST.json` and prints
nothing on success:

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

Run it twice and compare `out/POST.json` to `POST.json`; the copy is
byte-identical. (Do not use `node --check main.ts`: Node 24 rejects the
TypeScript syntax.)

`POST.json` currently contains a placeholder X URL. Replace it with the real X
post URL after posting.
