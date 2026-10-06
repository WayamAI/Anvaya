import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { DataTable, type Column } from "./data-table";

interface Row {
  id: string;
  vendor: string;
  qty: number;
  status: string;
}

const rows: Row[] = [
  { id: "PO-3", vendor: "Zenith Polymers", qty: 5, status: "Open" },
  { id: "PO-1", vendor: "Aarti Industries", qty: 40, status: "Closed" },
  { id: "PO-2", vendor: "Mold-Tek Containers", qty: 12, status: "Open" },
];

const columns: Column<Row>[] = [
  { key: "id", header: "PO number", value: r => r.id, cell: r => r.id },
  { key: "vendor", header: "Vendor", value: r => r.vendor, cell: r => <strong>{r.vendor}</strong> },
  { key: "qty", header: "Qty", align: "right", numeric: true, value: r => r.qty, cell: r => r.qty },
  // No `value` — inert by design: not sortable, searchable or exported.
  { key: "status", header: "Status", cell: r => <span>{r.status}</span> },
];

/** The body rows, excluding the header row. */
function bodyRows() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function cellText(rowIndex: number, colIndex: number) {
  return within(bodyRows()[rowIndex]).getAllByRole("cell")[colIndex].textContent;
}

function search(value: string) {
  fireEvent.change(screen.getByRole("searchbox"), { target: { value } });
}

describe("DataTable", () => {
  it("renders every row and column by default", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByText("Zenith Polymers")).toBeInTheDocument();
  });

  it("sorts ascending, then descending, then back to natural order", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
    const vendorHeader = screen.getByRole("button", { name: /Vendor/ });

    fireEvent.click(vendorHeader);
    expect(cellText(0, 1)).toBe("Aarti Industries");

    fireEvent.click(vendorHeader);
    expect(cellText(0, 1)).toBe("Zenith Polymers");

    // A third click clears the sort rather than trapping the reader between
    // two sorted states.
    fireEvent.click(vendorHeader);
    expect(cellText(0, 1)).toBe("Zenith Polymers");
    expect(cellText(1, 1)).toBe("Aarti Industries");
  });

  it("sorts numerically, not lexically", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
    fireEvent.click(screen.getByRole("button", { name: /Qty/ }));
    // Lexical order would give 12, 40, 5.
    expect([cellText(0, 2), cellText(1, 2), cellText(2, 2)]).toEqual(["5", "12", "40"]);
  });

  it("leaves a column without a value unsortable", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} />);
    expect(screen.queryByRole("button", { name: /Status/ })).not.toBeInTheDocument();
  });

  it("filters on search across every column that has a value", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} searchable name="Orders" />);

    search("mold");
    expect(bodyRows()).toHaveLength(1);
    expect(screen.getByText("Mold-Tek Containers")).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 rows/)).toBeInTheDocument();
  });

  it("shows a query-aware empty state when nothing matches", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} searchable name="Orders" />);

    search("nothing-matches-this");
    expect(bodyRows()).toHaveLength(0);
    expect(screen.getByText(/No rows match/)).toBeInTheDocument();
  });

  it("pages through rows and returns to page one when the query changes", () => {
    render(
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} pageSize={2} searchable name="Orders" />,
    );

    expect(bodyRows()).toHaveLength(2);
    expect(screen.getByText("1 / 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(bodyRows()).toHaveLength(1);

    // Narrowing the set from page two must not strand the reader on a page
    // that no longer exists.
    search("o");
    expect(bodyRows().length).toBeGreaterThan(0);
  });

  it("hides a column on request but refuses to hide the last one", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} columnToggle />);

    fireEvent.click(screen.getByRole("button", { name: /Columns/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Vendor" }));
    expect(screen.queryByText("Zenith Polymers")).not.toBeInTheDocument();

    for (const name of ["PO number", "Qty", "Status"]) {
      fireEvent.click(screen.getByRole("checkbox", { name }));
    }
    // Three of four switched off; the fourth must refuse.
    expect(within(screen.getByRole("table")).getAllByRole("columnheader")).toHaveLength(1);
  });

  it("marks the selected row and calls back on click", () => {
    const onRowClick = vi.fn();
    render(
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        onRowClick={onRowClick}
        isRowSelected={r => r.id === "PO-2"}
      />,
    );

    expect(bodyRows()[2]).toHaveAttribute("aria-selected", "true");
    expect(bodyRows()[0]).toHaveAttribute("aria-selected", "false");

    fireEvent.click(bodyRows()[0]);
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it("renders skeleton rows instead of data while loading", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={r => r.id} loading />);
    expect(screen.queryByText("Zenith Polymers")).not.toBeInTheDocument();
    expect(bodyRows().length).toBeGreaterThan(0);
  });

  it("exports the filtered rows as CSV, with only the valued columns", async () => {
    let exported: Blob | null = null;

    // jsdom implements neither of these, so there is nothing to spy on until
    // they exist. Define, then spy, then restore what was there before.
    const hadCreate = "createObjectURL" in URL;
    const hadRevoke = "revokeObjectURL" in URL;
    if (!hadCreate) (URL as unknown as Record<string, unknown>).createObjectURL = () => "";
    if (!hadRevoke) (URL as unknown as Record<string, unknown>).revokeObjectURL = () => {};

    const createSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob: Blob | MediaSource) => {
        exported = blob as Blob;
        return "blob:mock";
      });
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <DataTable columns={columns} rows={rows} rowKey={r => r.id} exportable searchable name="Orders" />,
    );

    search("mold");
    fireEvent.click(screen.getByRole("button", { name: /Export/ }));

    expect(createSpy).toHaveBeenCalledOnce();
    expect(revokeSpy).toHaveBeenCalledOnce();
    expect(clickSpy).toHaveBeenCalledOnce();

    // jsdom's Blob has no `.text()`; FileReader is the supported path.
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(exported!);
    });
    const [header, ...body] = csv.trim().split("\n");

    // `status` has no value accessor, so it is absent from the file.
    expect(header).toBe("PO number,Vendor,Qty");
    // Export follows what is on screen, not the whole set.
    expect(body).toEqual(["PO-2,Mold-Tek Containers,12"]);

    createSpy.mockRestore();
    revokeSpy.mockRestore();
    clickSpy.mockRestore();
    if (!hadCreate) delete (URL as unknown as Record<string, unknown>).createObjectURL;
    if (!hadRevoke) delete (URL as unknown as Record<string, unknown>).revokeObjectURL;
  });
});

describe("DataTable with server-side search", () => {
  it("hands the search to the caller instead of filtering the loaded rows", () => {
    const onSearchChange = vi.fn();
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} searchable searchValue="" onSearchChange={onSearchChange} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zenith" } });
    expect(onSearchChange).toHaveBeenLastCalledWith("zenith");
  });

  it("shows every row it is given, since the server already filtered them", () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} searchable searchValue="zenith" onSearchChange={() => {}} />);
    expect(screen.getByRole("searchbox")).toHaveValue("zenith");
    expect(screen.getByText("Aarti Industries")).toBeInTheDocument();
    expect(screen.getByText("Mold-Tek Containers")).toBeInTheDocument();
  });
});
