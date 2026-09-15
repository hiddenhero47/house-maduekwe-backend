const {
  buildDayBuckets,
  buildWeekBuckets,
  buildMonthBuckets,
  buildDateRangeFilter,
} = require("../../server-src/helpers/statsHelper");

// Fixed reference point so bucket math is deterministic regardless of when
// the test suite runs: Wednesday, 2026-01-14 12:00 UTC.
const NOW = new Date("2026-01-14T12:00:00.000Z");

describe("statsHelper bucket builders", () => {
  describe("buildDayBuckets", () => {
    it("returns `count` buckets ending on today (UTC)", () => {
      const buckets = buildDayBuckets(7, NOW);

      expect(buckets).toHaveLength(7);
      expect(buckets[buckets.length - 1].label).toBe("2026-01-14");
      expect(buckets[0].label).toBe("2026-01-08");
    });

    it("each bucket spans exactly one UTC day", () => {
      const [bucket] = buildDayBuckets(1, NOW);

      expect(bucket.end.getTime() - bucket.start.getTime()).toBe(24 * 60 * 60 * 1000);
    });

    it("buckets are contiguous (no gaps/overlaps)", () => {
      const buckets = buildDayBuckets(5, NOW);

      for (let i = 1; i < buckets.length; i++) {
        expect(buckets[i].start.getTime()).toBe(buckets[i - 1].end.getTime());
      }
    });
  });

  describe("buildWeekBuckets", () => {
    it("returns `count` buckets, each labeled by the Monday of that week", () => {
      const buckets = buildWeekBuckets(5, NOW);

      expect(buckets).toHaveLength(5);
      // 2026-01-14 is a Wednesday; that week's Monday is 2026-01-12
      expect(buckets[buckets.length - 1].label).toBe("2026-01-12");
    });

    it("each bucket spans exactly 7 days", () => {
      const [bucket] = buildWeekBuckets(1, NOW);

      expect(bucket.end.getTime() - bucket.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    });
  });

  describe("buildMonthBuckets", () => {
    it("returns `count` buckets ending on the current UTC month", () => {
      const buckets = buildMonthBuckets(12, NOW);

      expect(buckets).toHaveLength(12);
      expect(buckets[buckets.length - 1].label).toBe("2026-01");
      expect(buckets[0].label).toBe("2025-02");
    });

    it("correctly spans a December -> January year boundary", () => {
      const buckets = buildMonthBuckets(2, NOW);

      expect(buckets.map((b) => b.label)).toEqual(["2025-12", "2026-01"]);
    });
  });
});

describe("statsHelper.buildDateRangeFilter", () => {
  it("returns an empty filter when no dates are given", () => {
    expect(buildDateRangeFilter({})).toEqual({});
  });

  it("builds a $gte/$lte range from startDate/endDate", () => {
    const filter = buildDateRangeFilter({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });

    expect(filter.createdAt.$gte).toBeInstanceOf(Date);
    expect(filter.createdAt.$lte).toBeInstanceOf(Date);
    // endDate should be pushed to the end of that day
    expect(filter.createdAt.$lte.getHours()).toBe(23);
  });

  it("ignores invalid date strings rather than throwing", () => {
    expect(buildDateRangeFilter({ startDate: "not-a-date" })).toEqual({});
  });
});
