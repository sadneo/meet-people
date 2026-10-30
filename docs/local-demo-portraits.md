# Stock portraits for fictional local accounts

Twenty stock portraits were downloaded from Pexels on 29 October 2026 after
checking the [Pexels license](https://www.pexels.com/license/). These are models
in stock photographs, **not Pebble members**. Names, biographies, Dating details,
interests and schedules remain fictional; no identity attributes are inferred
from the images and no endorsement is implied.

The processed photos contain a `DEMO · STOCK PHOTO` label. This import is limited
to marked local demo accounts. Do not treat it as production member data or as
confirmation of model releases for public promotional/sensitive uses; review
those rights before distribution.

## Source credits

Each link identifies the original stock photograph and its photographer.

| Demo slot | Original photo |
| --- | --- |
| 001 | https://www.pexels.com/photo/220453/ |
| 002 | https://www.pexels.com/photo/415829/ |
| 003 | https://www.pexels.com/photo/614810/ |
| 004 | https://www.pexels.com/photo/91227/ |
| 005 | https://www.pexels.com/photo/774909/ |
| 006 | https://www.pexels.com/photo/1239291/ |
| 007 | https://www.pexels.com/photo/733872/ |
| 008 | https://www.pexels.com/photo/2379004/ |
| 009 | https://www.pexels.com/photo/1516680/ |
| 010 | https://www.pexels.com/photo/1130626/ |
| 011 | https://www.pexels.com/photo/1681010/ |
| 012 | https://www.pexels.com/photo/1181686/ |
| 013 | https://www.pexels.com/photo/1587009/ |
| 014 | https://www.pexels.com/photo/1222271/ |
| 015 | https://www.pexels.com/photo/1040880/ |
| 016 | https://www.pexels.com/photo/1858175/ |
| 017 | https://www.pexels.com/photo/2182970/ |
| 018 | https://www.pexels.com/photo/1987301/ |
| 019 | https://www.pexels.com/photo/3778603/ |
| 020 | https://www.pexels.com/photo/762020/ |

## Local tools and cleanup

Original downloads and the detailed source manifest are cached outside the
repository at `/tmp/opencode/pebble-stock-portraits/`. No third-party image is
hotlinked into a member profile. After import, authenticated private photo
storage supplies the images through the existing authorization rules.

```sh
pnpm demo:portraits --dry-run
pnpm demo:portraits
pnpm demo:portraits --restore-initials
```

The importer validates local Docker project identity and all account ownership
markers. It replaces only the exact seeded initials image (or an absent initial
photo), preserving any different owner-edited image and removal tombstone.
Reruns are no-ops for already imported images. Restoration changes only images
that still exactly match this import, and does not overwrite subsequent edits.
All writes use revisioned photo RPCs in one guarded transaction. It does not
change matching settings, profile text, relationships or messages.

The temporary download receiver was stopped after import. Original downloads
may be removed separately after review; the private database copies persist.
