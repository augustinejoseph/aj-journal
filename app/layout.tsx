import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Still — Private diary",
  description: "A little room for your thoughts.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
