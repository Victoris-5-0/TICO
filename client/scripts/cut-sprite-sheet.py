"""Cut a sheet of loose objects into one file per object.

    python scripts/cut-sprite-sheet.py <sheet.png> --out public/assets/bakery-v2/frames --prefix crate
    python scripts/cut-sprite-sheet.py <sheet.jpg> --out ... --prefix cross --white-bg --names a b c

The art arrives as a single image with several objects floating on it — a sheet of angry
faces, a delivery rider in eleven poses, four props on a dark ground. The scene draws one
sprite at a time, so each has to become its own file with its own transparency.

## How it finds them

A mask of "not background", grown slightly so the parts of one object join up, then
connected components. Each component is cropped from the *original* mask, so the growing
never fattens the artwork — it only decides what belongs together.

Two kinds of background:

  a PNG that already has alpha    the mask is the alpha channel, and nothing is removed
  a JPG on white                  near-white is dropped, which is lossy at the edges and
                                  the reason `--white-bg` has to be asked for rather than
                                  guessed
  a JPG on a flat colour          the edge colour is sampled and removed with `--matte-bg`;
                                  a short alpha ramp keeps the painted edges soft

## Why not just slice a grid

Because the sheets are not grids. The delivery sheet has four frames on one row and three
on the next, and the objects are different sizes. Slicing evenly would cut riders in half.
`--names` takes the labels in reading order once the objects have been found.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage


def matte_distance(im: Image.Image) -> np.ndarray:
    """Return each pixel's colour distance from a flat matte sampled at the edges."""
    rgb = np.array(im)[:, :, :3].astype(np.int16)
    border = np.concatenate((
        rgb[:20].reshape(-1, 3), rgb[-20:].reshape(-1, 3),
        rgb[:, :20].reshape(-1, 3), rgb[:, -20:].reshape(-1, 3),
    ))
    matte = np.median(border, axis=0)
    return np.max(np.abs(rgb - matte), axis=2)


def build_mask(im: Image.Image, white_bg: bool, matte_bg: bool, alpha_floor: int,
               white_cut: int, matte_cut: int) -> np.ndarray:
    """True where there is artwork."""
    arr = np.array(im)

    if matte_bg:
        return matte_distance(im) > matte_cut

    if not white_bg:
        return arr[:, :, 3] > alpha_floor

    # A JPEG has no alpha, so the background is whatever fills the corners. Near-white is
    # dropped rather than exactly-white because JPEG ringing leaves a halo of 250s.
    rgb = arr[:, :, :3].astype(np.int16)
    return rgb.min(axis=2) < white_cut


def components(mask: np.ndarray, join: int, min_area: int) -> list[tuple[slice, slice, np.ndarray]]:
    """Each object as (rows, cols, its own mask), in reading order.

    `join` grows the mask before labelling so a figure's separate dark regions — a head
    above a gap, a bag beside a hand — count as one object. The boxes are measured on the
    grown mask, so a box can overlap a neighbour: on the delivery sheet the riders stand
    close enough that one bike's box clipped the next bike's crate. The third element is
    that object's own pixels within the box, which is what removes the neighbour.
    """
    grown = ndimage.binary_dilation(mask, iterations=join) if join else mask
    labels, count = ndimage.label(grown, structure=np.ones((3, 3), dtype=int))
    if not count:
        return []

    found = []
    for i, box in enumerate(ndimage.find_objects(labels), start=1):
        if box is None:
            continue
        ys, xs = box
        mine = (labels[ys, xs] == i) & mask[ys, xs]
        if mine.sum() >= min_area:
            found.append((ys, xs, mine))

    # Reading order: down into rows, then across. Sorting on `y` alone puts a tall object
    # before a short one that sits beside it, which scrambles the names.
    heights = [ys.stop - ys.start for ys, _, _ in found]
    band = max(heights) // 2 if heights else 1
    found.sort(key=lambda f: ((f[0].start // band), f[1].start))
    return found


def cut(path: pathlib.Path, out: pathlib.Path, prefix: str, *, white_bg: bool,
        matte_bg: bool, join: int, min_area: int, pad: int, alpha_floor: int,
        white_cut: int, matte_cut: int,
        names: list[str] | None, fmt: str, quality: int) -> list[tuple[str, tuple[int, int]]]:
    im = Image.open(path).convert("RGBA")
    arr = np.array(im)
    mask = build_mask(im, white_bg, matte_bg, alpha_floor, white_cut, matte_cut)

    if matte_bg:
        # Flat coloured JPEG mattes need a soft alpha edge. JPEG ringing and the painted
        # contact shadows sit close to the matte colour, so a hard binary cut leaves a
        # visible rectangle around every vehicle.
        distance = matte_distance(im)
        alpha = np.clip((distance - max(0, matte_cut - 8)) * (255 / 18), 0, 255)
        arr[:, :, 3] = alpha.astype(np.uint8)
    elif white_bg:
        # Everything the mask rejected becomes transparent, not white — a white halo on a
        # sprite is visible against the bakery's cream background.
        arr[:, :, 3] = np.where(mask, 255, 0)
    else:
        # These sheets were matted off a dark ground and the near-transparent edge pixels
        # kept the matte's colour — a red fringe, clearly visible once the sprite sits on
        # the bakery's cream. The mask already ignores those pixels; this makes the output
        # agree with the mask instead of carrying them along at alpha 3.
        arr[:, :, 3] = np.where(mask, arr[:, :, 3], 0)

    out.mkdir(parents=True, exist_ok=True)
    written = []

    for i, (ys, xs, mine) in enumerate(components(mask, join, min_area)):
        cut_out = arr[ys, xs].copy()
        cut_out[:, :, 3] = np.where(mine, cut_out[:, :, 3], 0)

        piece = Image.fromarray(cut_out)
        piece = piece.crop(piece.getbbox())
        if pad:
            padded = Image.new("RGBA", (piece.width + pad * 2, piece.height + pad * 2), (0, 0, 0, 0))
            padded.paste(piece, (pad, pad))
            piece = padded

        name = names[i] if names and i < len(names) else f"{prefix}-{i + 1:02d}"
        target = out / f"{name}.{fmt}"
        if fmt == "webp":
            # The rest of `bakery-v2` is webp, and these are painterly rather than flat, so
            # lossy compresses them to a fifth of the PNG with no visible difference. The
            # alpha channel is kept exact — a soft edge on a sprite is what stops it looking
            # pasted onto the scene.
            piece.save(target, "WEBP", quality=quality, method=6, exact=True)
        else:
            piece.save(target)
        written.append((target.name, piece.size))

    return written


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("sheet")
    ap.add_argument("--out", required=True)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--white-bg", action="store_true", help="JPEG on white rather than real alpha")
    ap.add_argument("--matte-bg", action="store_true", help="JPEG on a flat coloured matte sampled from its edges")
    ap.add_argument("--join", type=int, default=6, help="how far apart parts of one object may sit")
    ap.add_argument("--min-area", type=int, default=900, help="ignore specks smaller than this")
    ap.add_argument("--pad", type=int, default=2)
    ap.add_argument("--alpha-floor", type=int, default=12)
    ap.add_argument("--white-cut", type=int, default=238)
    ap.add_argument("--matte-cut", type=int, default=12, help="minimum RGB distance from a flat matte")
    ap.add_argument("--names", nargs="*", help="names in reading order; extras fall back to prefix-NN")
    ap.add_argument("--format", dest="fmt", choices=("webp", "png"), default="webp")
    ap.add_argument("--quality", type=int, default=90, help="webp only")
    args = ap.parse_args()

    sheet = pathlib.Path(args.sheet).expanduser()
    if not sheet.exists():
        print(f"no such sheet: {sheet}", file=sys.stderr)
        return 1

    written = cut(
        sheet, pathlib.Path(args.out), args.prefix,
        white_bg=args.white_bg, matte_bg=args.matte_bg, join=args.join, min_area=args.min_area,
        pad=args.pad, alpha_floor=args.alpha_floor, white_cut=args.white_cut,
        matte_cut=args.matte_cut,
        names=args.names, fmt=args.fmt, quality=args.quality,
    )

    print(f"{sheet.name} -> {len(written)} pieces")
    for name, size in written:
        print(f"   {name:34} {size[0]:>5} x {size[1]}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
