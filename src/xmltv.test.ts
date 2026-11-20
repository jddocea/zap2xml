import { describe, expect, it } from "vitest";
import type { GridApiResponse } from "./tvlistings.js";
import {
  buildChannelsXml,
  buildProgramsXml,
  buildXmltv,
  escapeXml,
  formatDate,
} from "./xmltv.js";

const mockData: GridApiResponse = {
  channels: [
    {
      callSign: "KOMODT",
      affiliateName: "AMERICAN BROADCASTING COMPANY",
      affiliateCallSign: null,
      channelId: "19629",
      channelNo: "4.1",
      events: [
        {
          callSign: "KOMODT",
          duration: "60",
          startTime: "2025-07-18T19:00:00Z",
          endTime: "2025-07-18T20:00:00Z",
          thumbnail: "p30687311_b_v13_aa",
          channelNo: "4.1",
          filter: ["filter-news"],
          seriesId: "SH05918266",
          rating: "TV-PG",
          flag: ["New"],
          tags: ["Stereo", "CC"],
          program: {
            title: "GMA3",
            id: "EP059182660025",
            tmsId: "EP059182660025",
            shortDesc:
              "BIA performs; comic Zarna Garg; lifestyle contributor Lori Bergamotto; ABC News chief medical correspondent Dr. Tara Narula.",
            season: "5",
            releaseYear: null,
            episode: "217",
            episodeTitle: "Special Episode",
            seriesId: "SH05918266",
            isGeneric: "0",
          },
        },
      ],
      id: "196290",
      stationGenres: [false],
      stationFilters: ["filter-news", "filter-talk"],
      thumbnail:
        "//zap2it.tmsimg.com/h3/NowShowing/19629/s28708_ll_h15_ac.png?w=55",
    },
  ],
};

describe("buildXmltv", () => {
  it("should generate valid XML structure", () => {
    const result = buildXmltv(mockData);
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain(
      '<tv generator-info-name="jef/zap2xml" generator-info-url="https://github.com/jef/zap2xml">',
    );
    expect(result).toContain("</tv>");
  });

  it("should include channel information", () => {
    const result = buildXmltv(mockData);
    expect(result).toContain('<channel id="19629">');
    expect(result).toContain("<display-name>KOMODT</display-name>");
    expect(result).toContain(
      "<display-name>AMERICAN BROADCASTING COMPANY</display-name>",
    );
    expect(result).toContain("<display-name>4.1</display-name>");
  });

  it("should include programme information", () => {
    const result = buildXmltv(mockData);
    expect(result).toContain(
      '<programme start="20250718190000 +0000" stop="20250718200000 +0000" channel="19629">',
    );
    expect(result).toContain("<title>GMA3</title>");
    expect(result).toContain("<sub-title>Special Episode</sub-title>");
    expect(result).toContain(
      "<desc>BIA performs; comic Zarna Garg; lifestyle contributor Lori Bergamotto; ABC News chief medical correspondent Dr. Tara Narula.</desc>",
    );
  });

  it("should include rating information", () => {
    const result = buildXmltv(mockData);
    expect(result).toContain(
      '<rating system="VCHIP"><value>TV-PG</value></rating>',
    );
  });

  it("should include categories from flags and tags", () => {
    const result = buildXmltv(mockData);
    expect(result).toContain("<new />");
    expect(result).toContain('<audio type="stereo" />');
    expect(result).toContain('<subtitles type="teletext" />');
  });

  it("should include episode information", () => {
    const result = buildXmltv(mockData);
    expect(result).toContain(
      '<episode-num system="onscreen">S05E217</episode-num>',
    );
    expect(result).toContain(
      '<episode-num system="common">S05E217</episode-num>',
    );
    // xmltv_ns is zero-based: season 5, episode 217 -> "4.216."
    expect(result).toContain(
      '<episode-num system="xmltv_ns">4.216.</episode-num>',
    );
  });

  it("should handle empty data gracefully", () => {
    const emptyData: GridApiResponse = { channels: [] };
    const result = buildXmltv(emptyData);
    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain(
      '<tv generator-info-name="jef/zap2xml" generator-info-url="https://github.com/jef/zap2xml">',
    );
    expect(result).toContain("</tv>");
    expect(result).not.toContain("<channel");
    expect(result).not.toContain("<programme");
  });

  it("should handle missing optional fields", () => {
    const minimalData: GridApiResponse = {
      channels: [
        {
          callSign: "TEST",
          affiliateName: "",
          affiliateCallSign: null,
          channelId: "123",
          channelNo: "",
          events: [
            {
              callSign: "TEST",
              duration: "30",
              startTime: "2025-07-18T19:00:00Z",
              endTime: "2025-07-18T19:30:00Z",
              thumbnail: "",
              channelNo: "",
              filter: [],
              seriesId: "",
              rating: "",
              flag: [],
              tags: [],
              program: {
                title: "Test Show",
                id: "TEST123",
                tmsId: "TEST123",
                shortDesc: "",
                season: "",
                releaseYear: null,
                episode: "",
                episodeTitle: null,
                seriesId: "",
                isGeneric: "0",
              },
            },
          ],
          id: "123",
          stationGenres: [],
          stationFilters: [],
          thumbnail: "",
        },
      ],
    };
    const result = buildXmltv(minimalData);
    expect(result).toContain('<channel id="123">');
    expect(result).toContain("<display-name>TEST</display-name>");
    expect(result).toContain(
      '<programme start="20250718190000 +0000" stop="20250718193000 +0000" channel="123">',
    );
    expect(result).toContain("<title>Test Show</title>");
    expect(result).not.toContain("<sub-title>");
    expect(result).not.toContain("<desc>");
    expect(result).not.toContain("<rating>");
    expect(result).not.toContain("<category>");
    expect(result).not.toContain("<episode-num");
    expect(result).not.toContain("<icon");
  });
});

describe("escapeXml", () => {
  it("should escape XML special characters", () => {
    expect(escapeXml("&")).toBe("&amp;");
    expect(escapeXml("<")).toBe("&lt;");
    expect(escapeXml(">")).toBe("&gt;");
    expect(escapeXml('"')).toBe("&quot;");
    expect(escapeXml("'")).toBe("&apos;");
  });

  it("should handle text with multiple special characters", () => {
    expect(escapeXml("A & B < C > D \"E\" 'F'")).toBe(
      "A &amp; B &lt; C &gt; D &quot;E&quot; &apos;F&apos;",
    );
  });

  it("should handle normal text without special characters", () => {
    expect(escapeXml("Normal text")).toBe("Normal text");
  });

  it("should handle empty string", () => {
    expect(escapeXml("")).toBe("");
  });
});

describe("formatDate", () => {
  it("should format ISO date string correctly", () => {
    expect(formatDate("2025-07-18T19:00:00Z")).toBe("20250718190000 +0000");
    expect(formatDate("2025-12-31T23:59:59Z")).toBe("20251231235959 +0000");
  });

  it("should handle different times", () => {
    expect(formatDate("2025-01-01T00:00:00Z")).toBe("20250101000000 +0000");
    expect(formatDate("2025-06-15T12:30:45Z")).toBe("20250615123045 +0000");
  });

  it("should handle edge cases", () => {
    expect(formatDate("2025-02-28T23:59:59Z")).toBe("20250228235959 +0000");
    expect(formatDate("2025-03-01T00:00:00Z")).toBe("20250301000000 +0000");
  });
});

describe("buildChannelsXml", () => {
  it("should build channel XML correctly", () => {
    const result = buildChannelsXml(mockData);
    expect(result).toContain('<channel id="19629">');
    expect(result).toContain("<display-name>KOMODT</display-name>");
    expect(result).toContain(
      "<display-name>AMERICAN BROADCASTING COMPANY</display-name>",
    );
    expect(result).toContain("<display-name>4.1</display-name>");
    expect(result).toContain(
      '<icon src="https://zap2it.tmsimg.com/h3/NowShowing/19629/s28708_ll_h15_ac.png?w=55" />',
    );
  });

  it("should handle channels without optional fields", () => {
    const minimalChannel: GridApiResponse = {
      channels: [
        {
          callSign: "TEST",
          affiliateName: "",
          affiliateCallSign: null,
          channelId: "123",
          channelNo: "",
          events: [],
          id: "123",
          stationGenres: [],
          stationFilters: [],
          thumbnail: "",
        },
      ],
    };
    const result = buildChannelsXml(minimalChannel);
    expect(result).toContain('<channel id="123">');
    expect(result).toContain("<display-name>TEST</display-name>");
    expect(result).not.toContain("<icon");
  });
});

describe("buildProgramsXml", () => {
  it("should build programme XML correctly", () => {
    const result = buildProgramsXml(mockData);
    expect(result).toContain(
      '<programme start="20250718190000 +0000" stop="20250718200000 +0000" channel="19629">',
    );
    expect(result).toContain("<title>GMA3</title>");
    expect(result).toContain("<sub-title>Special Episode</sub-title>");
    expect(result).toContain(
      "<desc>BIA performs; comic Zarna Garg; lifestyle contributor Lori Bergamotto; ABC News chief medical correspondent Dr. Tara Narula.</desc>",
    );
    expect(result).toContain(
      '<rating system="VCHIP"><value>TV-PG</value></rating>',
    );
    expect(result).toContain("<new />");
    expect(result).toContain('<audio type="stereo" />');
    expect(result).toContain('<subtitles type="teletext" />');
    expect(result).toContain(
      '<episode-num system="onscreen">S05E217</episode-num>',
    );
    expect(result).toContain(
      '<episode-num system="common">S05E217</episode-num>',
    );
    // xmltv_ns is zero-based: season 5, episode 217 -> "4.216."
    expect(result).toContain(
      '<episode-num system="xmltv_ns">4.216.</episode-num>',
    );
    expect(result).toContain(
      '<icon src="https://zpmc.tmsimg.com/assets/p30687311_b_v13_aa.jpg" />',
    );
  });

  it("should handle programmes without optional fields", () => {
    const minimalProgramme: GridApiResponse = {
      channels: [
        {
          callSign: "TEST",
          affiliateName: "",
          affiliateCallSign: null,
          channelId: "123",
          channelNo: "",
          events: [
            {
              callSign: "TEST",
              duration: "30",
              startTime: "2025-07-18T19:00:00Z",
              endTime: "2025-07-18T19:30:00Z",
              thumbnail: "",
              channelNo: "",
              filter: [],
              seriesId: "",
              rating: "",
              flag: [],
              tags: [],
              program: {
                title: "Test Show",
                id: "TEST123",
                tmsId: "TEST123",
                shortDesc: "",
                season: "",
                releaseYear: null,
                episode: "",
                episodeTitle: null,
                seriesId: "",
                isGeneric: "0",
              },
            },
          ],
          id: "123",
          stationGenres: [],
          stationFilters: [],
          thumbnail: "",
        },
      ],
    };
    const result = buildProgramsXml(minimalProgramme);
    expect(result).toContain(
      '<programme start="20250718190000 +0000" stop="20250718193000 +0000" channel="123">',
    );
    expect(result).toContain("<title>Test Show</title>");
    expect(result).not.toContain("<sub-title>");
    expect(result).not.toContain("<desc>");
    expect(result).not.toContain("<rating>");
    expect(result).not.toContain("<category>");
    expect(result).not.toContain("<episode-num");
    expect(result).not.toContain("<icon");
  });

  describe("previously-shown", () => {
    const withFlags = (flag: string[] | undefined): GridApiResponse => ({
      channels: [
        {
          ...mockData.channels[0],
          events: [{ ...mockData.channels[0].events[0], flag: flag as string[] }],
        },
      ],
    });

    it.each([
      ["no flags", []],
      ["missing flags", undefined],
      ["Premiere without New", ["Premiere"]],
      ["Finale without New", ["Finale"]],
    ])("marks a rerun with %s as previously shown", (_label, flag) => {
      expect(buildProgramsXml(withFlags(flag))).toContain(
        "<previously-shown />",
      );
    });

    it.each([
      ["New", ["New"]],
      ["Live", ["Live"]],
      ["New Premiere", ["New", "Premiere"]],
    ])("does not mark %s as previously shown", (_label, flag) => {
      expect(buildProgramsXml(withFlags(flag))).not.toContain(
        "<previously-shown />",
      );
    });
  });

  describe("xmltv_ns episode numbering", () => {
    const withEpisode = (season: string, episode: string): GridApiResponse => ({
      channels: [
        {
          ...mockData.channels[0],
          events: [
            {
              ...mockData.channels[0].events[0],
              program: { ...mockData.channels[0].events[0].program, season, episode },
            },
          ],
        },
      ],
    });

    it.each([
      ["S1E1", "1", "1", "0.0."],
      ["S5E217", "5", "217", "4.216."],
      ["S12E3", "12", "3", "11.2."],
    ])("writes %s as zero-based", (_label, season, episode, expected) => {
      expect(buildProgramsXml(withEpisode(season, episode))).toContain(
        `<episode-num system="xmltv_ns">${expected}</episode-num>`,
      );
    });

    it.each([
      ["season 0", "0", "4"],
      ["non-numeric episode", "2", "3a"],
    ])("skips xmltv_ns for %s", (_label, season, episode) => {
      const result = buildProgramsXml(withEpisode(season, episode));
      expect(result).not.toContain('system="xmltv_ns"');
      expect(result).toContain('system="onscreen"');
    });
  });

  describe("rating system", () => {
    const withRating = (rating: string): GridApiResponse => ({
      channels: [
        {
          ...mockData.channels[0],
          events: [{ ...mockData.channels[0].events[0], rating }],
        },
      ],
    });

    it.each([
      ["TV-PG", "VCHIP"],
      ["TV-MA", "VCHIP"],
      ["PG-13", "MPAA"],
      ["R", "MPAA"],
    ])("labels %s as %s", (rating, system) => {
      expect(buildProgramsXml(withRating(rating))).toContain(
        `<rating system="${system}"><value>${rating}</value></rating>`,
      );
    });
  });
});
