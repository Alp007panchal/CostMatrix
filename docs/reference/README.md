# Reference files

Real documents from one job, used to design the quotation template and the costing screens.
Customer name appears in them; do not publish this folder outside the team.

| File | What it is | Used for |
|---|---|---|
| `quotation-NPP-192-REV1.docx` | The quotation as written in Word | Source of the PDF template layout (`docs/quotation-template.md`) |
| `quotation-NPP-192-REV1.pdf` | The same quotation as sent to the customer | Visual check of the generated PDF |
| `costing-NPP-192-REV1.xlsm` | The Excel workbook behind that quotation (one sheet per panel or option, "db" sheets per make) | Acceptance figures (§4 of the reference document); `scripts/check_npp192.py` reads its `OPTION1` sheet |
| `current-costing-and-quotation-reference.md` | How costing is done today, the thirteen binding decisions (§5), the NPP-192 acceptance figures (§4) and how the seed is derived (§6) | **The source of truth.** Draft for the owner to correct |

Still wanted:

- The labour hours per kit group and process type (`data/seed/kit-group-labour-template.csv`).
- Corrections to §5 of the reference document, in particular decisions 4, 10, 12 and 13.
- Manufacturer data sheets that go in Annexure IV, if the app should attach them (see `docs/open-questions.md`).
