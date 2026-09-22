/** The column type the created/updated timestamps get, which differs per database flavour. */
const timestampOptions = (dbType: string) => {
  let options: Record<string, unknown> = {};
  jest.isolateModules(() => {
    jest.doMock("../../config/env", () => ({ DB_TYPE: dbType, DB_SKIP_MIGRATIONS: false }));
    options = require("../db").TIMESTAMP_COLUMN_OPTIONS;
  });
  return options;
};

describe("TIMESTAMP_COLUMN_OPTIONS", () => {
  afterEach(() => jest.dontMock("../../config/env"));

  it("keeps the offset with the value where the database has a type for it", () => {
    expect(timestampOptions("postgres")).toEqual({ type: "timestamptz" });
    expect(timestampOptions("mssql")).toEqual({ type: "datetimeoffset" });
  });

  it("leaves the driver default where it does not", () => {
    // sqlite already stores UTC from both sides, MySQL is pinned to UTC on the connection
    expect(timestampOptions("sqlite")).toEqual({});
    expect(timestampOptions("mysql")).toEqual({});
  });
});
