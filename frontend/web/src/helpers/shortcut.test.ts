import { describe, expect, it } from "vitest";
import { Visibility } from "@/types/proto/api/v1/common";
import { Shortcut } from "@/types/proto/api/v1/shortcut_service";
import { countTags, formatCount, groupBySite, matchesQuery, normalizeName, splitLink } from "./shortcut";

const shortcut = (partial: Partial<Shortcut>) => Shortcut.fromPartial({ visibility: Visibility.WORKSPACE, ...partial });

describe("splitLink", () => {
  it("splits a Link into the host and everything after it", () => {
    expect(splitLink("https://grafana.example.com/d/overview?range=7d#panel")).toEqual({
      host: "grafana.example.com",
      path: "/d/overview?range=7d#panel",
      fqdn: "grafana.example.com",
    });
  });

  it("drops a bare root path, which carries no information", () => {
    expect(splitLink("https://example.com/")).toEqual({ host: "example.com", path: "", fqdn: "example.com" });
  });

  it("keeps the port on the host but not on the fully qualified domain", () => {
    expect(splitLink("http://nas.home.arpa:5000/photos")).toEqual({
      host: "nas.home.arpa:5000",
      path: "/photos",
      fqdn: "nas.home.arpa",
    });
  });

  it("falls back to the raw value when the Link does not parse", () => {
    expect(splitLink("not a url")).toEqual({ host: "not a url", path: "", fqdn: "not a url" });
  });
});

describe("normalizeName", () => {
  it("lowercases and joins words with a dash", () => {
    expect(normalizeName("Deploy Runbook")).toBe("deploy-runbook");
  });

  it("keeps the characters a Name is allowed to contain", () => {
    expect(normalizeName("api.v2_beta-1")).toBe("api.v2_beta-1");
  });

  it("strips a leading s/, so pasting a whole Shortcut Name works", () => {
    expect(normalizeName("s/grafana")).toBe("grafana");
  });

  it("collapses runs of illegal characters into a single dash", () => {
    expect(normalizeName("one   !!  two")).toBe("one-two");
  });

  it("never starts with a dash", () => {
    expect(normalizeName("  leading")).toBe("leading");
  });
});

describe("matchesQuery", () => {
  const grafana = shortcut({
    name: "grafana",
    title: "Cluster overview",
    description: "The dashboard we open during an incident",
    link: "https://grafana.example.com/d/overview",
    tags: ["infra", "monitoring"],
  });

  it("matches everything when the query is blank", () => {
    expect(matchesQuery(grafana, "   ")).toBe(true);
  });

  it("matches on the Name, with or without the s/ prefix", () => {
    expect(matchesQuery(grafana, "graf")).toBe(true);
    expect(matchesQuery(grafana, "s/grafana")).toBe(true);
  });

  it("matches on title, description, Link and Tags", () => {
    expect(matchesQuery(grafana, "cluster")).toBe(true);
    expect(matchesQuery(grafana, "incident")).toBe(true);
    expect(matchesQuery(grafana, "example.com")).toBe(true);
    expect(matchesQuery(grafana, "monitor")).toBe(true);
  });

  it("ignores case and surrounding whitespace", () => {
    expect(matchesQuery(grafana, "  CLUSTER ")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(matchesQuery(grafana, "payroll")).toBe(false);
  });
});

describe("countTags", () => {
  it("counts each Tag and orders by count, then alphabetically", () => {
    const shortcuts = [
      shortcut({ name: "a", tags: ["infra", "monitoring"] }),
      shortcut({ name: "b", tags: ["infra"] }),
      shortcut({ name: "c", tags: ["docs"] }),
    ];
    expect(countTags(shortcuts)).toEqual([
      { name: "infra", count: 2 },
      { name: "docs", count: 1 },
      { name: "monitoring", count: 1 },
    ]);
  });

  it("returns nothing when no Shortcut is tagged", () => {
    expect(countTags([shortcut({ name: "a" })])).toEqual([]);
  });
});

describe("groupBySite", () => {
  const shortcuts = [
    shortcut({ name: "grafana", link: "https://grafana.example.com/d/a", viewCount: 10 }),
    shortcut({ name: "grafana-slo", link: "https://grafana.example.com/d/b", viewCount: 5 }),
    shortcut({ name: "nas", link: "http://nas.home.arpa:5000", viewCount: 40 }),
  ];

  it("groups by fully qualified domain and sums the visits", () => {
    const [first, second] = groupBySite(shortcuts);
    expect(first).toMatchObject({ fqdn: "grafana.example.com", count: 2, visits: 15 });
    expect(second).toMatchObject({ fqdn: "nas.home.arpa", count: 1, visits: 40 });
  });

  it("orders by how many Shortcuts point at the site, then by visits", () => {
    expect(groupBySite(shortcuts).map((site) => site.fqdn)).toEqual(["grafana.example.com", "nas.home.arpa"]);
  });

  it("flags a site that only resolves on a local network", () => {
    const sites = groupBySite(shortcuts);
    expect(sites.find((site) => site.fqdn === "nas.home.arpa")?.isLocal).toBe(true);
    expect(sites.find((site) => site.fqdn === "grafana.example.com")?.isLocal).toBe(false);
  });

  it("previews the first three Shortcuts and counts the rest", () => {
    const many = Array.from({ length: 5 }, (_, i) => shortcut({ name: `n${i}`, link: `https://example.com/${i}` }));
    const [site] = groupBySite(many);
    expect(site.shortcuts.map((s) => s.name)).toEqual(["n0", "n1", "n2"]);
    expect(site.more).toBe(2);
  });
});

describe("formatCount", () => {
  it("groups thousands so long visit counts stay scannable", () => {
    expect(formatCount(12345)).toBe("12,345");
    expect(formatCount(0)).toBe("0");
  });
});
