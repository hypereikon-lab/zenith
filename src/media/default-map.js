import { TAU } from "../projection.js";

export function createDefaultMap(size) {
  const buffer = document.createElement("canvas");
  buffer.width = size;
  buffer.height = size;
  const ctx = buffer.getContext("2d");
  const center = size * 0.5;
  const radius = size * 0.5;

  const gradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
  gradient.addColorStop(0, "#fff5b6");
  gradient.addColorStop(0.32, "#74ced8");
  gradient.addColorStop(0.68, "#2d72a3");
  gradient.addColorStop(1, "#111821");
  ctx.fillStyle = "#050609";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(center, center, radius - 2, 0, TAU);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, radius - 2, 0, TAU);
  ctx.clip();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.72)";
  for (let deg = 15; deg < 90; deg += 15) {
    ctx.beginPath();
    ctx.arc(center, center, (deg / 90) * radius, 0, TAU);
    ctx.stroke();
  }
  for (let deg = 0; deg < 360; deg += 15) {
    const a = (deg / 180) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(center + Math.sin(a) * radius, center - Math.cos(a) * radius);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(4,9,13,0.42)";
  ctx.font = `${Math.floor(size * 0.032)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let deg = 0; deg < 360; deg += 45) {
    const a = (deg / 180) * Math.PI;
    const r = radius * 0.82;
    ctx.fillText(`${deg} deg`, center + Math.sin(a) * r, center - Math.cos(a) * r);
  }

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(center, center, 12, 0, TAU);
  ctx.fill();
  ctx.restore();
  return buffer;
}
