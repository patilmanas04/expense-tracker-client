import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon for iPhone (iOS applies its own rounded mask). */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #AB86FF 0%, #7243EC 100%)",
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", left: 53, top: 45, width: 25, height: 90, borderRadius: 13, background: "#fff" }} />
        <div style={{ position: "absolute", left: 53, top: 45, width: 73, height: 25, borderRadius: 13, background: "#fff" }} />
        <div
          style={{ position: "absolute", left: 53, top: 82, width: 51, height: 22, borderRadius: 11, background: "rgba(255,255,255,0.75)" }}
        />
      </div>
    ),
    size,
  );
}
