"""Helpers for openpyxl workbooks: a styled table in one call, sensible column widths, number formats."""
from openpyxl.chart import BarChart, LineChart, PieChart, Reference
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.table import Table, TableStyleInfo

HEADER_FILL = PatternFill("solid", fgColor="2E6BE6")
HEADER_FONT = Font(bold=True, color="FFFFFF")
THIN = Side(style="thin", color="E4E7EB")

FORMATS = {
    "integer": "#,##0",
    "number": "#,##0.00",
    "percent": "0.0%",
    "currency": "#,##0.00 [$€-x-euro2]",
    "usd": "$#,##0.00",
    "rub": '#,##0.00 "₽"',
    "date": "yyyy-mm-dd",
}


def write_table(ws, header, rows, start_row=1, start_col=1, formats=None, name=None, style="TableStyleMedium2"):
    """Writes a header and rows, styles the header, freezes it and adds an Excel table with filters.

    formats maps a column name from the header to a key of FORMATS or to a raw Excel format string.
    Returns the table's range, e.g. "A1:D13"."""
    for j, title in enumerate(header):
        cell = ws.cell(row=start_row, column=start_col + j, value=title)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
    for i, row in enumerate(rows, start=1):
        for j, value in enumerate(row):
            cell = ws.cell(row=start_row + i, column=start_col + j, value=value)
            cell.border = Border(top=THIN, bottom=THIN)
    for j, title in enumerate(header):
        fmt = (formats or {}).get(title)
        if fmt:
            for i in range(1, len(rows) + 1):
                ws.cell(row=start_row + i, column=start_col + j).number_format = FORMATS.get(fmt, fmt)

    end_row = start_row + max(len(rows), 1)
    end_col = start_col + len(header) - 1
    ref = f"{get_column_letter(start_col)}{start_row}:{get_column_letter(end_col)}{end_row}"
    if rows:
        table = Table(displayName=name or f"Table{len(ws.tables) + 1}_{ws.title.replace(' ', '')}"[:250], ref=ref)
        table.tableStyleInfo = TableStyleInfo(name=style, showRowStripes=True)
        ws.add_table(table)
    if start_row == 1:
        ws.freeze_panes = ws.cell(row=2, column=start_col)
    return ref


def autosize(ws, min_width=8, max_width=60):
    """Sets each column's width from its longest value."""
    widths = {}
    for row in ws.iter_rows():
        for cell in row:
            if cell.value is None:
                continue
            text = str(cell.value)
            length = max(len(line) for line in text.splitlines()) if text else 0
            widths[cell.column_letter] = max(widths.get(cell.column_letter, 0), length)
    for letter, width in widths.items():
        ws.column_dimensions[letter].width = max(min_width, min(max_width, width + 2))


def add_chart(ws, kind, data_ref, categories_ref, anchor, title=None, y_title=None, x_title=None):
    """Adds a bar, line or pie chart. data_ref and categories_ref are ranges such as "B1:C13" and "A2:A13";
    data_ref includes the header row, which names the series."""
    charts = {"bar": BarChart, "line": LineChart, "pie": PieChart}
    if kind not in charts:
        raise ValueError(f"add_chart: kind must be one of {', '.join(charts)}")
    chart = charts[kind]()
    if title:
        chart.title = title
    if kind != "pie":
        chart.y_axis.title = y_title
        chart.x_axis.title = x_title
    chart.height, chart.width = 8, 16
    chart.add_data(Reference(ws, range_string=f"'{ws.title}'!{data_ref}"), titles_from_data=True)
    chart.set_categories(Reference(ws, range_string=f"'{ws.title}'!{categories_ref}"))
    ws.add_chart(chart, anchor)
    return chart
