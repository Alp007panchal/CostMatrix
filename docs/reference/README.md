# Reference files

Real documents from one job, used to design the quotation template and the costing screens.
Customer name appears in them; do not publish this folder outside the team.

| File | What it is | Used for |
|---|---|---|
| `quotation-NPP-192-REV1.docx` | The quotation as written in Word | Source of the PDF template layout (`docs/quotation-template.md`) |
| `quotation-NPP-192-REV1.pdf` | The same quotation as sent to the customer | Visual check of the generated PDF |
| `costing-NPP-192-REV1.xlsm` | The Excel workbook behind that quotation (one sheet per panel or option, "db" sheets per make) | Test data for slice 1; import format for slice 6 |

Still wanted:

- The master component list as Excel, if it exists separately from the "db" sheets. Name it `component-list.xlsx`.
- Manufacturer data sheets that go in Annexure IV, if the app should attach them (see `docs/open-questions.md`).
