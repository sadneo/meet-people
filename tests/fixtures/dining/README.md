Public source fixtures captured November 3, 2026. Nutrislice fixtures retain a
subset of locations, items, and fields to keep the tests small; field values and
the seven returned calendar dates are preserved.

- Locations: https://stonybrook.api.nutrislice.com/menu/api/schools/?format=json
- Week: https://stonybrook.api.nutrislice.com/menu/api/weeks/school/6333/menu-type/2368/2026/11/3/?format=json
- Hospital: the Google Docs text export linked from https://www.stonybrookmedicine.edu/diningservices/locations
  (document `1lbEJQmIhNFN_-FJBMO57j0S3GPbU_6UhYzIf3dGa23g`, November 2–6).

`hospital-menu.txt` preserves the published text. These are parsing fixtures;
tests do not contact the upstream websites.
