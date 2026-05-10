import {
  array,
  bigint,
  blob,
  boolean,
  ColumnBuilder,
  char,
  datetime,
  decimal,
  float,
  integer,
  json,
  name,
  table,
  text,
  timestamp,
  varchar,
} from "@hedystia/db";
import { describe, expect, it } from "vitest";

describe("Schema - Column builders", () => {
  it("should create an integer column", () => {
    const col = integer();
    expect(col).toBeInstanceOf(ColumnBuilder);
    const meta = col.__build("id");
    expect(meta.type).toBe("integer");
    expect(meta.name).toBe("id");
  });

  it("should create a varchar column with length", () => {
    const col = varchar(100);
    const meta = col.__build("name");
    expect(meta.type).toBe("varchar");
    expect(meta.length).toBe(100);
  });

  it("should create a varchar column with default length", () => {
    const col = varchar();
    const meta = col.__build("name");
    expect(meta.length).toBe(255);
  });

  it("should create a char column", () => {
    const col = char(10);
    const meta = col.__build("code");
    expect(meta.type).toBe("char");
    expect(meta.length).toBe(10);
  });

  it("should create a text column", () => {
    const col = text();
    const meta = col.__build("bio");
    expect(meta.type).toBe("text");
  });

  it("should create a boolean column", () => {
    const col = boolean();
    const meta = col.__build("active");
    expect(meta.type).toBe("boolean");
  });

  it("should create a json column", () => {
    const col = json();
    const meta = col.__build("data");
    expect(meta.type).toBe("json");
  });

  it("should create a datetime column", () => {
    const col = datetime();
    const meta = col.__build("createdAt");
    expect(meta.type).toBe("datetime");
  });

  it("should create a timestamp column", () => {
    const col = timestamp();
    const meta = col.__build("updatedAt");
    expect(meta.type).toBe("timestamp");
  });

  it("should create a decimal column with precision and scale", () => {
    const col = decimal(8, 4);
    const meta = col.__build("price");
    expect(meta.type).toBe("decimal");
    expect(meta.precision).toBe(8);
    expect(meta.scale).toBe(4);
  });

  it("should create a float column", () => {
    const col = float();
    const meta = col.__build("score");
    expect(meta.type).toBe("float");
  });

  it("should create a bigint column", () => {
    const col = bigint();
    const meta = col.__build("bigId");
    expect(meta.type).toBe("bigint");
  });

  it("should create a blob column", () => {
    const col = blob();
    const meta = col.__build("data");
    expect(meta.type).toBe("blob");
  });

  it("should create an array column", () => {
    const col = array();
    expect(col).toBeInstanceOf(ColumnBuilder);
    const meta = col.__build("tags");
    expect(meta.type).toBe("array");
  });
});

describe("Schema - Column modifiers", () => {
  it("should mark a column as primary key", () => {
    const meta = integer().primaryKey().__build("id");
    expect(meta.primaryKey).toBe(true);
    expect(meta.notNull).toBe(true);
    expect(meta.unique).toBe(true);
  });

  it("should mark a column as auto increment", () => {
    const meta = integer().primaryKey().autoIncrement().__build("id");
    expect(meta.autoIncrement).toBe(true);
  });

  it("should mark a column as not null", () => {
    const meta = varchar(255).notNull().__build("name");
    expect(meta.notNull).toBe(true);
  });

  it("should mark a column as nullable", () => {
    const meta = varchar(255).nullable().__build("bio");
    expect(meta.notNull).toBe(false);
  });

  it("should set a default value", () => {
    const meta = integer().default(0).__build("count");
    expect(meta.defaultValue).toBe(0);
  });

  it("should mark a column as unique", () => {
    const meta = varchar(255).unique().__build("email");
    expect(meta.unique).toBe(true);
  });

  it("should chain multiple modifiers", () => {
    const meta = varchar(100).notNull().unique().default("unknown").__build("username");
    expect(meta.notNull).toBe(true);
    expect(meta.unique).toBe(true);
    expect(meta.defaultValue).toBe("unknown");
    expect(meta.length).toBe(100);
  });
});

describe("Schema - Column name alias", () => {
  it("should set a column alias with .name()", () => {
    const col = varchar(255).name("guild_id");
    const meta = col.__build("guildId");
    expect(meta.name).toBe("guild_id");
    expect(meta.columnAlias).toBe("guild_id");
  });

  it("should use the key when no alias is set", () => {
    const col = varchar(255);
    const meta = col.__build("guildId");
    expect(meta.name).toBe("guildId");
    expect(meta.columnAlias).toBeUndefined();
  });

  it("should work with name() starter function", () => {
    const col = name("guild_id").varchar(255);
    const meta = col.__build("guildId");
    expect(meta.name).toBe("guild_id");
    expect(meta.columnAlias).toBe("guild_id");
    expect(meta.type).toBe("varchar");
    expect(meta.length).toBe(255);
  });

  it("should support name() starter with all column types", () => {
    expect(name("col").integer().__build("x").type).toBe("integer");
    expect(name("col").bigint().__build("x").type).toBe("bigint");
    expect(name("col").varchar(100).__build("x").type).toBe("varchar");
    expect(name("col").char(5).__build("x").type).toBe("char");
    expect(name("col").text().__build("x").type).toBe("text");
    expect(name("col").boolean().__build("x").type).toBe("boolean");
    expect(name("col").json().__build("x").type).toBe("json");
    expect(name("col").datetime().__build("x").type).toBe("datetime");
    expect(name("col").timestamp().__build("x").type).toBe("timestamp");
    expect(name("col").decimal(8, 4).__build("x").type).toBe("decimal");
    expect(name("col").float().__build("x").type).toBe("float");
    expect(name("col").blob().__build("x").type).toBe("blob");
    expect(name("col").array().__build("x").type).toBe("array");
  });

  it("should build table columnMap correctly", () => {
    const guilds = table("guilds", {
      id: integer().primaryKey().autoIncrement(),
      guildId: varchar(255).name("guild_id").notNull(),
      guildName: varchar(255).name("guild_name"),
      normalCol: text(),
    });

    expect(guilds.__columnMap).toEqual({
      id: "id",
      guildId: "guild_id",
      guildName: "guild_name",
      normalCol: "normalCol",
    });

    const guildIdCol = guilds.__columns.find((c) => c.name === "guild_id");
    expect(guildIdCol).toBeDefined();
    expect(guildIdCol!.type).toBe("varchar");
    expect(guildIdCol!.notNull).toBe(true);
  });
});

describe("Schema - Custom type", () => {
  it("should allow .type() to narrow the type", () => {
    const col = varchar(25).type<"en_US" | "es_ES">();
    expect(col).toBeInstanceOf(ColumnBuilder);
    const meta = col.__build("locale");
    expect(meta.type).toBe("varchar");
    expect(meta.length).toBe(25);
  });

  it("should chain .type() with other modifiers", () => {
    const col = varchar(25)
      .type<"en_US" | "es_ES">()
      .notNull()
      .default("en_US" as any);
    const meta = col.__build("locale");
    expect(meta.notNull).toBe(true);
    expect(meta.defaultValue).toBe("en_US");
  });
});

describe("Schema - Table definition", () => {
  it("should create a table definition", () => {
    const users = table("users", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(255).notNull(),
      email: varchar(255).unique(),
    });

    expect(users.__table).toBe(true);
    expect(users.__name).toBe("users");
    expect(users.__columns.length).toBe(3);
  });

  it("should have correct column metadata", () => {
    const users = table("users", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(100).notNull(),
    });

    const idCol = users.__columns.find((c) => c.name === "id")!;
    expect(idCol.primaryKey).toBe(true);
    expect(idCol.autoIncrement).toBe(true);
    expect(idCol.type).toBe("integer");
    expect(idCol.name).toBe("id");

    const nameCol = users.__columns.find((c) => c.name === "name")!;
    expect(nameCol.notNull).toBe(true);
    expect(nameCol.type).toBe("varchar");
    expect(nameCol.length).toBe(100);
    expect(nameCol.name).toBe("name");
  });

  it("should support references between tables", () => {
    const users = table("users", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(255).notNull(),
    });

    const posts = table("posts", {
      id: integer().primaryKey().autoIncrement(),
      userId: integer().references(() => users.id, { onDelete: "CASCADE" }),
      title: varchar(255).notNull(),
    });

    expect(posts.__deferredRefs.length).toBe(1);
    expect(posts.__deferredRefs[0]?.columnName).toBe("userId");
    expect(posts.__deferredRefs[0]?.onDelete).toBe("CASCADE");
  });

  it("should support direct references (without arrow function)", () => {
    const users = table("users", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(255).notNull(),
    });

    const posts = table("posts", {
      id: integer().primaryKey().autoIncrement(),
      userId: integer().references(users.id, { onDelete: "CASCADE" }),
      title: varchar(255).notNull(),
    });

    expect(posts.__deferredRefs.length).toBe(1);
    expect(posts.__deferredRefs[0]?.columnName).toBe("userId");
    expect(posts.__deferredRefs[0]?.onDelete).toBe("CASCADE");
  });
});

describe("Schema - Table cache config", () => {
  it("should set cache config on table definition", () => {
    const users = table(
      "users",
      {
        id: integer().primaryKey().autoIncrement(),
        name: varchar(255).notNull(),
      },
      { cache: { enabled: true, ttl: 5000 } },
    );

    expect(users.__cache).toBeDefined();
    expect(users.__cache!.enabled).toBe(true);
    expect(users.__cache!.ttl).toBe(5000);
  });

  it("should have undefined cache when not configured", () => {
    const users = table("users", {
      id: integer().primaryKey().autoIncrement(),
      name: varchar(255).notNull(),
    });

    expect(users.__cache).toBeUndefined();
  });
});
