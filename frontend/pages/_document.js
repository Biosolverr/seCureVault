import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* Base / dApp verification */}
        <meta name="cb-app-id" content="securevault" />

        {/* (опционально, но полезно) */}
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
