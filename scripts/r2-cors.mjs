import "./load-config.mjs";

const origins = [
  ...new Set(
    ["http://localhost:3000", process.env.PRODUCTION_URL]
      .filter(Boolean)
      .map((value) => {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) {
          throw new Error("CORS origins must use HTTP or HTTPS.");
        }
        return url.origin;
      }),
  ),
];

console.log(
  JSON.stringify(
    [
      {
        AllowedOrigins: origins,
        AllowedMethods: ["GET", "HEAD", "PUT"],
        AllowedHeaders: ["Content-Type"],
        ExposeHeaders: ["ETag"],
        MaxAgeSeconds: 1800,
      },
    ],
    null,
    2,
  ),
);
