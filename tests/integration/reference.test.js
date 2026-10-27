const request = require("supertest");
const createApp = require("../../server-src/app");
const { connectTestDB, disconnectTestDB, clearTestDB } = require("../setup/db");

const app = createApp();

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

describe("GET /api/reference/countries", () => {
  it("is public and returns a real country list", async () => {
    const res = await request(app).get("/api/reference/countries");

    expect(res.status).toBe(200);
    expect(res.body.data.some((c) => c.isoCode === "US")).toBe(true);
  });
});

describe("GET /api/reference/countries/:countryCode/states", () => {
  it("returns states for a real country", async () => {
    const res = await request(app).get("/api/reference/countries/US/states");

    expect(res.status).toBe(200);
    expect(res.body.data.some((s) => s.isoCode === "TX" && s.name === "Texas")).toBe(
      true,
    );
  });

  it("404s for an unknown country code", async () => {
    const res = await request(app).get("/api/reference/countries/ZZ/states");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/reference/countries/:countryCode/cities", () => {
  it("returns cities for a country", async () => {
    const res = await request(app).get("/api/reference/countries/US/cities");

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  it("narrows by state when provided", async () => {
    const res = await request(app).get(
      "/api/reference/countries/US/cities?state=TX",
    );

    expect(res.status).toBe(200);
    expect(res.body.data.some((c) => c.name === "Austin")).toBe(true);
  });

  it("404s for an unknown country code", async () => {
    const res = await request(app).get("/api/reference/countries/ZZ/cities");
    expect(res.status).toBe(404);
  });
});
