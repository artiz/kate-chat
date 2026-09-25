---
name: Excel spreadsheet
description: Workbooks (.xlsx) with formatted tables, formulas, several sheets and charts, built with openpyxl.
runtime: python
packages:
  - openpyxl
---

Use this skill when the user wants a spreadsheet, a table to download, an Excel file or a budget, plan or report they will edit. Write Python with openpyxl; the helper module `xlsx_helpers` styles tables and sizes columns.

To change a workbook that is already in this chat (attached or made earlier), keeping its formatting, use the `office-edit` skill instead: this one makes new workbooks.

```python skill=xlsx file=sales-2026.xlsx
from openpyxl import Workbook
from xlsx_helpers import write_table, autosize, add_chart

wb = Workbook()
ws = wb.active
ws.title = "Sales"

rows = [
    ["January", 120000, 95000],
    ["February", 134000, 101000],
    ["March", 151000, 108000],
]
write_table(ws, ["Month", "Revenue", "Costs", "Margin"], [
    [month, revenue, costs, f"=(B{i}-C{i})/B{i}"] for i, (month, revenue, costs) in enumerate(rows, start=2)
], formats={"Revenue": "currency", "Costs": "currency", "Margin": "percent"})

total = len(rows) + 2
ws[f"A{total}"] = "Total"
ws[f"B{total}"] = f"=SUM(B2:B{total - 1})"
ws[f"C{total}"] = f"=SUM(C2:C{total - 1})"
for col in "BC":
    ws[f"{col}{total}"].number_format = "#,##0.00 [$€-x-euro2]"

add_chart(ws, "bar", "B1:C4", "A2:A4", "F2", title="Revenue and costs")
autosize(ws)
wb.save("/output/sales-2026.xlsx")
```

What the helper provides:

- `write_table(ws, header, rows, start_row=1, start_col=1, formats=None, name=None)`: writes the header in the accent colour, the rows, an Excel table with filters and stripes, and freezes the header when the table starts on row 1. `formats` maps a header name to `integer`, `number`, `percent`, `currency` (€), `usd`, `rub`, `date` or a raw Excel format string. Returns the range, e.g. `"A1:D4"`.
- `autosize(ws)`: column widths from the longest value; call it after writing everything.
- `add_chart(ws, kind, data_ref, categories_ref, anchor, title=None, y_title=None, x_title=None)`: `kind` is `"bar"`, `"line"` or `"pie"`; `data_ref` includes the header row that names the series.

openpyxl essentials:

- Put numbers in cells as numbers, not strings, so formulas and charts work; format them with `cell.number_format`.
- Formulas are strings starting with `=`, in English with commas: `"=SUM(B2:B13)"`, `"=IF(C2>0,B2/C2,0)"`. They are calculated when the file is opened, so do not also write the result as a value.
- Dates: write `datetime.date` values and set a date format.
- More sheets: `wb.create_sheet("Summary")`; refer across sheets with `"='Sales'!B5"`.
- Save to `/output/<file>.xlsx`. There is no network and no other file system to read from; put the data in the program.
