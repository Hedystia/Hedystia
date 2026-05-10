import { database, integer, table, varchar } from "@hedystia/db";
import { existsSync, rmSync } from "fs";
import { describe, it } from "vitest";

const TEST_DB = "/tmp/hedystia_stress_test.db";
const ITERATIONS = 1000;

const users = table("users", {
  id: integer().primaryKey().autoIncrement(),
  name: varchar(255).notNull(),
  email: varchar(255),
  age: integer().default(0),
});

async function runBenchmark(useCache: boolean) {
  if (existsSync(TEST_DB)) {
    rmSync(TEST_DB);
  }

  const db = database({
    schemas: [users],
    database: "sqlite",
    connection: { filename: TEST_DB },
    syncSchemas: true,
    cache: useCache ? { enabled: true, ttl: 60000, maxTtl: 300000, maxEntries: 10000 } : false,
  });

  await db.initialize();

  const insertStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await db.users.insert({ name: `User${i}`, email: `user${i}@test.com`, age: i % 100 });
  }
  const insertTime = performance.now() - insertStart;

  const findAllStart = performance.now();
  for (let i = 0; i < 100; i++) {
    await db.users.find();
  }
  const findAllTime = performance.now() - findAllStart;

  const findWhereStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await db.users.findFirst({ where: { name: `User${i % ITERATIONS}` } });
  }
  const findWhereTime = performance.now() - findWhereStart;

  const findFirstStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await db.users.findFirst({ where: { id: (i % ITERATIONS) + 1 } });
  }
  const findFirstTime = performance.now() - findFirstStart;

  const countStart = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    await db.users.count();
  }
  const countTime = performance.now() - countStart;

  const updateStart = performance.now();
  for (let i = 0; i < 100; i++) {
    await db.users.update({ where: { id: i + 1 }, data: { age: 999 } });
  }
  const updateTime = performance.now() - updateStart;

  await db.close();
  if (existsSync(TEST_DB)) {
    rmSync(TEST_DB);
  }

  return { insertTime, findAllTime, findWhereTime, findFirstTime, countTime, updateTime };
}

describe("Stress Test", () => {
  it("should run stress test benchmark", async () => {
    console.log(`\n🔥 @hedystia/db Stress Test (${ITERATIONS} records)\n`);
    console.log("═".repeat(60));

    console.log("\n📊 Without Cache:\n");
    const noCache = await runBenchmark(false);
    console.log(`  Insert ${ITERATIONS} rows:     ${noCache.insertTime.toFixed(2)} ms`);
    console.log(`  Find all (100x):       ${noCache.findAllTime.toFixed(2)} ms`);
    console.log(`  Find where (${ITERATIONS}x):   ${noCache.findWhereTime.toFixed(2)} ms`);
    console.log(`  Find first (${ITERATIONS}x):   ${noCache.findFirstTime.toFixed(2)} ms`);
    console.log(`  Count (${ITERATIONS}x):        ${noCache.countTime.toFixed(2)} ms`);
    console.log(`  Update (100x):         ${noCache.updateTime.toFixed(2)} ms`);

    console.log("\n📊 With Cache:\n");
    const withCache = await runBenchmark(true);
    console.log(`  Insert ${ITERATIONS} rows:     ${withCache.insertTime.toFixed(2)} ms`);
    console.log(`  Find all (100x):       ${withCache.findAllTime.toFixed(2)} ms`);
    console.log(`  Find where (${ITERATIONS}x):   ${withCache.findWhereTime.toFixed(2)} ms`);
    console.log(`  Find first (${ITERATIONS}x):   ${withCache.findFirstTime.toFixed(2)} ms`);
    console.log(`  Count (${ITERATIONS}x):        ${withCache.countTime.toFixed(2)} ms`);
    console.log(`  Update (100x):         ${withCache.updateTime.toFixed(2)} ms`);

    console.log("\n📈 Cache speedup:\n");
    const speedup = (a: number, b: number) => `${(a / b).toFixed(2)}x`;
    console.log(`  Find all:    ${speedup(noCache.findAllTime, withCache.findAllTime)} faster`);
    console.log(`  Find where:  ${speedup(noCache.findWhereTime, withCache.findWhereTime)} faster`);
    console.log(`  Find first:  ${speedup(noCache.findFirstTime, withCache.findFirstTime)} faster`);
    console.log(`  Count:       ${speedup(noCache.countTime, withCache.countTime)} faster`);

    console.log(`\n${"═".repeat(60)}\n`);
  }, 60000);
});
