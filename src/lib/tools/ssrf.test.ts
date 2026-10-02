import { describe, it, expect } from "vitest";
import { PassThrough } from "node:stream";
import zlib from "node:zlib";
import { isPublicIp, ipv6ToBytes, canonicalIpv4, validateUrl, safeFetch, readBodyCapped, SsrfError } from "./ssrf";

describe("isPublicIp — IPv4", () => {
  it("accepts public addresses", () => {
    expect(isPublicIp("8.8.8.8")).toBe(true);
    expect(isPublicIp("1.1.1.1")).toBe(true);
    expect(isPublicIp("93.184.216.34")).toBe(true);
  });
  it("blocks private, loopback, link-local, CGNAT and reserved ranges", () => {
    for (const ip of [
      "0.0.0.0", "10.0.0.1", "100.64.0.1", "127.0.0.1", "169.254.169.254",
      "172.16.0.1", "172.31.255.255", "192.168.1.1", "198.18.0.1",
      "224.0.0.1", "240.0.0.1", "255.255.255.255",
    ]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it("rejects malformed", () => {
    expect(isPublicIp("999.1.1.1")).toBe(false);
    expect(isPublicIp("nope")).toBe(false);
  });
});

describe("isPublicIp — IPv6", () => {
  it("accepts a public v6 address", () => {
    expect(isPublicIp("2606:4700:4700::1111")).toBe(true);
  });
  it("blocks loopback, unspecified, link-local, ULA, multicast, doc", () => {
    for (const ip of ["::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1"]) {
      expect(isPublicIp(ip), ip).toBe(false);
    }
  });
  it("blocks IPv4-mapped and NAT64 (can smuggle a v4 target)", () => {
    expect(isPublicIp("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIp("::ffff:8.8.8.8")).toBe(false); // mapped blocked outright
    expect(isPublicIp("64:ff9b::7f00:1")).toBe(false);
  });
  it("ipv6ToBytes expands :: and embedded v4", () => {
    expect(Array.from(ipv6ToBytes("::1")!)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);
    expect(ipv6ToBytes("::ffff:1.2.3.4")!.slice(10)).toEqual(new Uint8Array([0xff, 0xff, 1, 2, 3, 4]));
    expect(ipv6ToBytes("gggg::")).toBeNull();
  });
});

describe("validateUrl", () => {
  it("accepts http/https on default and 80/443 ports", () => {
    expect(validateUrl("https://example.com/path?q=1").hostname).toBe("example.com");
    expect(validateUrl("http://example.com:80").port).toBe(80);
    expect(validateUrl("https://example.com:443").port).toBe(443);
  });
  it("rejects non-http schemes", () => {
    for (const u of ["ftp://example.com", "file:///etc/passwd", "gopher://x", "data:text/html,x"]) {
      expect(() => validateUrl(u), u).toThrow(SsrfError);
    }
  });
  it("rejects non-80/443 ports", () => {
    expect(() => validateUrl("http://example.com:8080")).toThrow(/blocked-port/);
    expect(() => validateUrl("http://example.com:22")).toThrow(/blocked-port/);
  });
  it("rejects blocked IP literals immediately (no DNS)", () => {
    expect(() => validateUrl("http://127.0.0.1")).toThrow(/blocked-host/);
    expect(() => validateUrl("http://169.254.169.254")).toThrow(/blocked-host/);
    expect(() => validateUrl("http://[::1]/")).toThrow(/blocked-host/);
    expect(() => validateUrl("http://[::ffff:127.0.0.1]/")).toThrow(/blocked-host/);
  });
  it("rejects numeric / encoded host forms of 127.0.0.1", () => {
    expect(() => validateUrl("http://2130706433")).toThrow(/blocked-host/);   // decimal int
    expect(() => validateUrl("http://0x7f.1")).toThrow(/blocked-host/);        // hex + short
    expect(() => validateUrl("http://017700000001")).toThrow(/blocked-host/);  // octal int
    expect(() => validateUrl("http://0x7f.0.0.1")).toThrow(/blocked-host/);    // hex dotted
  });
  it("blocks localhost and the .localhost TLD without DNS", () => {
    expect(() => validateUrl("http://localhost")).toThrow(/blocked-host/);
    expect(() => validateUrl("http://foo.localhost")).toThrow(/blocked-host/);
  });
  it("rejects embedded credentials", () => {
    expect(() => validateUrl("http://user:pass@example.com")).toThrow(/invalid-url/);
    expect(() => validateUrl("http://admin@example.com")).toThrow(/invalid-url/);
  });
  it("leaves real hostnames as DNS names (canonicalIpv4 returns null)", () => {
    expect(canonicalIpv4("example.com")).toBeNull();
    expect(canonicalIpv4("foo.localhost")).toBeNull();
    expect(validateUrl("https://example.com").hostname).toBe("example.com");
  });
  it("canonicalIpv4 maps numeric forms to a dotted quad", () => {
    expect(canonicalIpv4("2130706433")).toBe("127.0.0.1");
    expect(canonicalIpv4("0x7f.0.0.1")).toBe("127.0.0.1");
    expect(canonicalIpv4("8.8.8.8")).toBe("8.8.8.8");
  });
  it("rejects garbage", () => {
    expect(() => validateUrl("not a url")).toThrow(/invalid-url/);
  });
});

describe("safeFetch — pre-network guards (no sockets opened)", () => {
  it("rejects a blocked scheme / port / literal before connecting", async () => {
    await expect(safeFetch("file:///etc/passwd", { maxBytes: 1000, accept: "text/html" })).rejects.toThrow(/blocked-scheme/);
    await expect(safeFetch("http://example.com:3306", { maxBytes: 1000, accept: "text/html" })).rejects.toThrow(/blocked-port/);
    await expect(safeFetch("http://127.0.0.1/", { maxBytes: 1000, accept: "text/html" })).rejects.toThrow(/blocked-host/);
    await expect(safeFetch("http://169.254.169.254/latest/meta-data/", { maxBytes: 1000, accept: "text/html" })).rejects.toThrow(/blocked-host/);
  });
});

describe("readBodyCapped — zip-bomb protection", () => {
  const streamOf = (buf: Buffer) => {
    const pt = new PassThrough();
    pt.end(buf);
    return pt;
  };
  it("returns identity bodies under the cap", async () => {
    const body = await readBodyCapped(streamOf(Buffer.from("hello world")), "", 100);
    expect(body.toString()).toBe("hello world");
  });
  it("decompresses gzip and applies the cap to DECOMPRESSED bytes", async () => {
    const payload = Buffer.alloc(50_000, 0x61); // compresses tiny, expands past cap
    const gz = zlib.gzipSync(payload);
    expect(gz.length).toBeLessThan(1000);
    await expect(readBodyCapped(streamOf(gz), "gzip", 10_000)).rejects.toThrow(/too-large/);
  });
  it("decompresses gzip within the cap", async () => {
    const gz = zlib.gzipSync(Buffer.from("small"));
    const out = await readBodyCapped(streamOf(gz), "gzip", 10_000);
    expect(out.toString()).toBe("small");
  });
  it("rejects an unknown content-encoding", async () => {
    await expect(readBodyCapped(streamOf(Buffer.from("x")), "weird", 100)).rejects.toMatchObject({ code: "fetch-failed" });
  });
});
