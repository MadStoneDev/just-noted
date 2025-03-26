const xml2js = require("xml2js");
const dotenv = require("dotenv");
const https = require("https");
const http = require("http");

dotenv.config({ path: ".env.local" });

// Configuration
const sitemapUrl = `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml`;
const host = process.env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, ""); // Remove protocol
const key = process.env.INDEXNOW_API;
const keyLocation = `${key}.txt`;

const modifiedSinceDate = new Date(process.argv[2] || "1970-01-01");

if (isNaN(modifiedSinceDate.getTime())) {
  console.error("Invalid date provided. Please use format YYYY-MM-DD");
  process.exit(1);
}

function fetchSitemap(url) {
  return new Promise((resolve, reject) => {
    // Determine if we need http or https
    const protocol = url.startsWith("https:") ? https : http;

    protocol
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve(data);
        });
      })
      .on("error", (err) => {
        reject(err);
      });
  });
}

function parseSitemap(xmlData) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xmlData, (err, result) => {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

function filterUrlsByDate(sitemap, date) {
  if (!sitemap.urlset || !sitemap.urlset.url) {
    console.error("Invalid sitemap structure");
    return [];
  }

  const urls = sitemap.urlset.url;
  return urls
    .filter((url) => url.lastmod && new Date(url.lastmod[0]) > date)
    .map((url) => url.loc[0]);
}

async function submitToIndexNow(urls) {
  if (urls.length === 0) {
    console.log("No URLs to submit");
    return;
  }

  const payload = {
    host: host,
    key: key,
    urlList: urls,
    keyLocation: `https://${host}/${keyLocation}`,
  };

  const options = {
    hostname: "api.indexnow.org",
    port: 443,
    path: "/indexnow",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        console.log(`IndexNow Response: ${res.statusCode}`);
        console.log(data);
        resolve({ statusCode: res.statusCode, data });
      });
    });

    req.on("error", (error) => {
      console.error("Error submitting to IndexNow:", error);
      reject(error);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

async function main() {
  try {
    console.log(`Fetching sitemap from ${sitemapUrl}`);
    const xmlData = await fetchSitemap(sitemapUrl);
    console.log("Parsing sitemap...");
    const sitemap = await parseSitemap(xmlData);
    console.log(
      `Filtering URLs modified since ${modifiedSinceDate.toISOString()}`,
    );
    const filteredUrls = filterUrlsByDate(sitemap, modifiedSinceDate);

    console.log(`Found ${filteredUrls.length} URLs to submit:`);
    console.log(filteredUrls);

    if (filteredUrls.length > 0) {
      console.log("Submitting URLs to IndexNow...");
      await submitToIndexNow(filteredUrls);
    }
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

main();
