#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont


Vec3 = tuple[float, float, float]


THETA_MAX = math.radians(135.0)
DEFAULT_SOURCE = Path("/Users/constanzaloboscatalan/Downloads/ChatGPT Image 9 jun 2026, 14_36_24.png")
FALLBACK_SOURCE = Path(
    "public/default-plates/hypereikon_httpss.mj.runH1b_6iuqGYI_httpss.mj.rungE7F-sXgL5s_ht_b8d28ad8-33c1-4c3e-8099-385dddae3428.png"
)
DEFAULT_CONFIG = Path("docs/default-depth-motion-config.json")
DEFAULT_PLATE_DIR = Path("public/default-plates")
EMPTY_GREEN = (0, 255, 0)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def normalize(direction: Vec3) -> Vec3:
    length = math.sqrt(direction[0] * direction[0] + direction[1] * direction[1] + direction[2] * direction[2])
    if length <= 1e-9:
        return (0.0, -1.0, 0.0)
    return (direction[0] / length, direction[1] / length, direction[2] / length)


def direction_to_cave270_uv(direction: Vec3) -> tuple[float, float] | None:
    x, y, z = normalize(direction)
    center_dot = clamp(-y, -1.0, 1.0)
    theta = math.acos(center_dot)
    if theta > THETA_MAX + 1e-6:
        return None
    if theta <= 1e-6:
        return (0.5, 0.5)
    radial = clamp(theta / THETA_MAX, 0.0, 1.0)
    tangent_len = math.sqrt(max(1e-12, 1.0 - center_dot * center_dot))
    local_x = x / tangent_len
    local_y = z / tangent_len
    return (0.5 + local_x * 0.5 * radial, 0.5 - local_y * 0.5 * radial)


def sample_bilinear(source: Image.Image, u: float, v: float) -> tuple[int, int, int]:
    if u < 0.0 or u > 1.0 or v < 0.0 or v > 1.0:
        return (0, 0, 0)
    x = u * (source.width - 1)
    y = v * (source.height - 1)
    x0 = int(math.floor(x))
    y0 = int(math.floor(y))
    x1 = min(source.width - 1, x0 + 1)
    y1 = min(source.height - 1, y0 + 1)
    fx = x - x0
    fy = y - y0
    pixels = source.load()
    c00 = pixels[x0, y0]
    c10 = pixels[x1, y0]
    c01 = pixels[x0, y1]
    c11 = pixels[x1, y1]
    out = []
    for index in range(3):
        top = c00[index] * (1 - fx) + c10[index] * fx
        bottom = c01[index] * (1 - fx) + c11[index] * fx
        out.append(round(top * (1 - fy) + bottom * fy))
    return (out[0], out[1], out[2])


def direction_from_angle_elevation(angle: float, elevation: float) -> Vec3:
    cos_elevation = math.cos(elevation)
    return normalize((math.sin(angle) * cos_elevation, math.sin(elevation), math.cos(angle) * cos_elevation))


def perimeter_mural_direction(x: float, y: float) -> Vec3:
    angle = (x - 0.5) * math.tau
    # More vertical resolution is reserved for walls than for the floor field.
    if y < 0.42:
        t = y / 0.42
        elevation = math.radians(45.0) * (1 - t)
    elif y < 0.68:
        t = (y - 0.42) / 0.26
        elevation = math.radians(-35.26438968) * t
    else:
        t = (y - 0.68) / 0.32
        elevation = math.radians(-35.26438968) * (1 - t) + math.radians(-90.0) * t
    return direction_from_angle_elevation(angle, elevation)


def soft_mural_direction(x: float, y: float) -> Vec3:
    angle = (x - 0.5) * math.tau
    t = smoothstep(y)
    elevation = math.radians(45.0) * (1 - t) + math.radians(-90.0) * t
    return direction_from_angle_elevation(angle, elevation)


def rounded_square_direction(x: float, y: float) -> Vec3 | None:
    nx = x * 2.0 - 1.0
    ny = y * 2.0 - 1.0
    square_radius = max(abs(nx), abs(ny))
    if square_radius > 1.0:
        return None
    if square_radius <= 1e-6:
        return (0.0, -1.0, 0.0)
    bx = nx / square_radius
    by = ny / square_radius
    angle = square_boundary_angle(bx, by)
    t = smoothstep(square_radius)
    elevation = math.radians(-90.0) * (1 - t) + math.radians(45.0) * t
    return direction_from_angle_elevation(angle, elevation)


def square_boundary_angle(x: float, y: float) -> float:
    if abs(y + 1.0) < 1e-5:
        distance = (x + 1.0) * 0.25
    elif abs(x - 1.0) < 1e-5:
        distance = 0.5 + (-y) * 0.25
    elif abs(y - 1.0) < 1e-5:
        distance = 0.75 + (1.0 - x) * 0.25
    else:
        distance = 1.0 + y * 0.25
    return (distance - 0.5) * math.tau


def smoothstep(value: float) -> float:
    value = clamp(value, 0.0, 1.0)
    return value * value * (3.0 - 2.0 * value)


def render_content(source: Image.Image, size: int, mapper: Callable[[float, float], Vec3 | None]) -> Image.Image:
    output = Image.new("RGB", (size, size), (0, 0, 0))
    pixels = []
    for py in range(size):
        y = (py + 0.5) / size
        for px in range(size):
            x = (px + 0.5) / size
            direction = mapper(x, y)
            if direction is None:
                pixels.append((0, 0, 0))
                continue
            uv = direction_to_cave270_uv(direction)
            pixels.append(sample_bilinear(source, uv[0], uv[1]) if uv else (0, 0, 0))
    output.putdata(pixels)
    return output


def render_plate_sketch(
    plates: list[dict],
    placements: list[dict],
    width: int,
    height: int,
    mapper: Callable[[float, float], Vec3 | None],
    outside: tuple[int, int, int] = EMPTY_GREEN,
) -> Image.Image:
    prepared = [prepare_plate_placement(placement, plate.get("aspect", 1.0)) for plate, placement in zip(plates, placements)]
    images = [Image.open(DEFAULT_PLATE_DIR / plate["name"]).convert("RGB") for plate in plates]
    output = Image.new("RGB", (width, height), outside)
    pixels = []
    for py in range(height):
        y = (py + 0.5) / height
        for px in range(width):
            x = (px + 0.5) / width
            direction = mapper(x, y)
            if direction is None:
                pixels.append((0, 0, 0))
                continue
            color = EMPTY_GREEN
            for image, placement in zip(images, prepared):
                uv = direction_to_plate_uv(direction, placement)
                if uv is None:
                    continue
                color = sample_bilinear(image, uv[0], uv[1])
            pixels.append(color)
    output.putdata(pixels)
    return output


def add_cave_mural_coordinate_harness(image: Image.Image, hard_bands: bool = True) -> Image.Image:
    output = image.copy()
    draw = ImageDraw.Draw(output, "RGBA")
    width, height = output.size
    wall_floor = 0.68 if hard_bands else 0.78
    upper_wall = 0.42 if hard_bands else 0.5

    # Horizontal room-perimeter stations. These are the CAVE equivalent of spokes:
    # they mark front/right/back/left travel and reinforce left/right edge wrap.
    for index in range(17):
        x = index * width / 16
        major = index % 4 == 0
        draw.line((x, 0, x, height), fill=(255, 255, 255, 100 if major else 46), width=2 if major else 1)
    for y, color, line_width in [
        (upper_wall * height, (0, 235, 255, 150), 3),
        (wall_floor * height, (110, 255, 130, 160), 3),
    ]:
        draw.line((0, y, width, y), fill=color, width=line_width)

    # Floor-center continuity isolines. These replace concentric dome rings for CAVE:
    # they show the lower band collapsing toward the viewer/floor center.
    floor_top = wall_floor * height
    for fraction in [0.25, 0.5, 0.75, 1.0]:
        y = floor_top + (height - floor_top) * fraction
        draw.line((0, y, width, y), fill=(110, 255, 130, 80), width=1)

    # Edge wrap markers: same phase at left and right.
    for y in [upper_wall * height, wall_floor * height, height - 10]:
        draw.line((0, y, 28, y), fill=(255, 255, 255, 185), width=3)
        draw.line((width - 28, y, width, y), fill=(255, 255, 255, 185), width=3)

    return output


def add_rounded_square_coordinate_harness(image: Image.Image) -> Image.Image:
    output = image.copy()
    draw = ImageDraw.Draw(output, "RGBA")
    size = min(output.size)
    cx = output.width / 2
    cy = output.height / 2

    for frac, color, width in [
        (0.32, (110, 255, 130, 130), 2),
        (0.62, (0, 235, 255, 150), 3),
        (0.86, (255, 255, 255, 105), 2),
        (1.0, (255, 255, 255, 145), 3),
    ]:
        half = frac * size * 0.5
        draw.rounded_rectangle((cx - half, cy - half, cx + half, cy + half), radius=max(4, int(half * 0.18)), outline=color, width=width)
    for index in range(24):
        angle = index * math.tau / 24
        endpoint = square_boundary_from_angle(angle, size)
        ex = endpoint[0] + (output.width - size) * 0.5
        ey = endpoint[1] + (output.height - size) * 0.5
        draw.line((cx, cy, ex, ey), fill=(255, 255, 255, 50 if index % 6 else 105), width=1 if index % 6 else 2)
    return output


def render_polar_plate_sketch(plates: list[dict], placements: list[dict], size: int) -> Image.Image:
    def mapper(x: float, y: float) -> Vec3 | None:
        nx = (x - 0.5) * 2.0
        ny = (0.5 - y) * 2.0
        radial = math.hypot(nx, ny)
        if radial > 1.0:
            return None
        if radial <= 1e-6:
            return (0.0, -1.0, 0.0)
        theta = radial * THETA_MAX
        local_x = nx / radial
        local_y = ny / radial
        return normalize((local_x * math.sin(theta), -math.cos(theta), local_y * math.sin(theta)))

    return render_plate_sketch(plates, placements, size, size, mapper, outside=(0, 0, 0))


def render_rounded_square_plate_sketch(plates: list[dict], placements: list[dict], size: int) -> Image.Image:
    return render_plate_sketch(plates, placements, size, size, rounded_square_direction, outside=(0, 0, 0))


def prepare_plate_placement(placement: dict, aspect: float) -> dict:
    azimuth = math.radians(float(placement.get("azimuth", 0.0)))
    radius = clamp(float(placement.get("radius", 0.0)), 0.0, 1.0)
    scale = clamp(float(placement.get("scale", 0.72)), 0.08, 2.2)
    spin = math.radians(float(placement.get("spin", 0.0)))
    aspect = max(0.0001, float(aspect or placement.get("aspect", 1.0) or 1.0))
    theta = radius * THETA_MAX
    sin_azimuth = math.sin(azimuth)
    cos_azimuth = math.cos(azimuth)
    center_axis = (0.0, -1.0, 0.0)
    image_right = (1.0, 0.0, 0.0)
    image_up = (0.0, 0.0, 1.0)
    radial_tangent = normalize((image_right[0] * sin_azimuth + image_up[0] * cos_azimuth, 0.0, image_right[2] * sin_azimuth + image_up[2] * cos_azimuth))
    center = normalize((
        center_axis[0] * math.cos(theta) + radial_tangent[0] * math.sin(theta),
        center_axis[1] * math.cos(theta) + radial_tangent[1] * math.sin(theta),
        center_axis[2] * math.cos(theta) + radial_tangent[2] * math.sin(theta),
    ))
    right = normalize((image_right[0] * cos_azimuth - image_up[0] * sin_azimuth, 0.0, image_right[2] * cos_azimuth - image_up[2] * sin_azimuth))
    down = normalize((
        -center_axis[0] * math.sin(theta) + radial_tangent[0] * math.cos(theta),
        -center_axis[1] * math.sin(theta) + radial_tangent[1] * math.cos(theta),
        -center_axis[2] * math.sin(theta) + radial_tangent[2] * math.cos(theta),
    ))
    width = scale
    height = scale / aspect
    return {
        "center": center,
        "right": right,
        "down": down,
        "angular_width": 2.0 * math.atan(width * 0.5),
        "angular_height": 2.0 * math.atan(height * 0.5),
        "spin_sin": math.sin(spin),
        "spin_cos": math.cos(spin),
        "flip_x": bool(placement.get("flipX", False)),
        "flip_y": bool(placement.get("flipY", False)),
    }


def direction_to_plate_uv(direction: Vec3, placement: dict) -> tuple[float, float] | None:
    direction = normalize(direction)
    center = placement["center"]
    cosine = clamp(dot(direction, center), -1.0, 1.0)
    angle = math.acos(cosine)
    if angle > math.pi - 1e-4:
        return None
    map_x = 0.0
    map_y = 0.0
    if angle > 1e-6:
        scale = angle / max(math.sin(angle), 1e-6)
        map_x = dot(direction, placement["right"]) * scale
        map_y = dot(direction, placement["down"]) * scale
    local_x = map_x * placement["spin_cos"] + map_y * placement["spin_sin"]
    local_y = -map_x * placement["spin_sin"] + map_y * placement["spin_cos"]
    u = local_x / max(placement["angular_width"], 1e-6) + 0.5
    v = local_y / max(placement["angular_height"], 1e-6) + 0.5
    if u < 0.0 or u > 1.0 or v < 0.0 or v > 1.0:
        return None
    if placement["flip_x"]:
        u = 1.0 - u
    if placement["flip_y"]:
        v = 1.0 - v
    return (u, v)


def dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def load_default_plate_sketch() -> tuple[list[dict], list[dict]]:
    config = json.loads(DEFAULT_CONFIG.read_text())
    sketch = config.get("plateSketch", {})
    return sketch.get("plates", []), sketch.get("placements", [])


def render_polar_reference(source: Image.Image, size: int) -> Image.Image:
    return source.resize((size, size), Image.Resampling.LANCZOS).convert("RGB")


def draw_polar_guides(image: Image.Image, label: str) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    size = image.width
    cx = cy = size / 2
    radius = size * 0.5
    draw.rectangle((0, 0, size, 74), fill=(0, 0, 0, 150))
    text(draw, 22, 18, label)
    for frac, color, width in [(2 / 3, (0, 255, 220, 130), 3), (1.0, (255, 255, 255, 160), 3), (1 / 3, (80, 255, 120, 100), 2)]:
        r = radius * frac
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=width)
    for index in range(16):
        angle = index * math.tau / 16
        draw.line((cx, cy, cx + math.sin(angle) * radius, cy - math.cos(angle) * radius), fill=(255, 255, 255, 46), width=1)
    text(draw, cx + 12, cy + 12, "floor center / nadir")
    text(draw, cx + radius * 0.68, cy - 8, "horizon 2/3")
    text(draw, 24, size - 44, "Current circular carrier: good AI continuity, but wall travel is still polar in the flat image.")


def draw_mural_guides(image: Image.Image, label: str, hard_bands: bool) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    size = image.width
    bands = [(0.0, 0.42, (70, 150, 255, 82), "upper wall / overhead allowance"),
             (0.42, 0.68, (50, 255, 220, 82), "wall horizon + lower wall continuity"),
             (0.68, 1.0, (90, 255, 110, 92), "floor field compressed toward center")]
    if not hard_bands:
        bands = [(0.0, 0.5, (70, 150, 255, 62), "continuous upper wall"),
                 (0.5, 0.78, (50, 255, 220, 72), "continuous lower wall"),
                 (0.78, 1.0, (90, 255, 110, 82), "floor center collapse")]
    for y0, y1, color, name in bands:
        draw.rectangle((0, y0 * size, size, y1 * size), fill=color)
        text(draw, 24, y0 * size + 18, name)
    for frac in [0.125, 0.375, 0.625, 0.875]:
        x = frac * size
        draw.line((x, 0, x, size), fill=(255, 255, 255, 72), width=2)
    for y in [0.42, 0.68] if hard_bands else [0.5, 0.78]:
        draw.line((0, y * size, size, y * size), fill=(255, 255, 255, 120), width=3)
    draw.rectangle((0, 0, size, 78), fill=(0, 0, 0, 150))
    text(draw, 22, 18, label)
    text(draw, 24, size - 48, "Left and right edges wrap. Horizontal motion follows room perimeter, not circular polar radius.")
    labels = ["front", "right", "back", "left", "front wrap"]
    for i, name in enumerate(labels):
        x = i * size / 4 if i < 4 else size - 118
        text(draw, x + 14, 92, name)


def draw_rounded_square_guides(image: Image.Image, label: str) -> None:
    draw = ImageDraw.Draw(image, "RGBA")
    size = image.width
    cx = cy = size / 2
    draw.rectangle((0, 0, size, 78), fill=(0, 0, 0, 150))
    text(draw, 22, 18, label)
    for frac, color, width, name in [
        (0.36, (90, 255, 110, 120), 2, "floor"),
        (0.66, (50, 255, 220, 130), 3, "wall horizon"),
        (1.0, (255, 255, 255, 150), 3, "upper wall limit"),
    ]:
        half = frac * size * 0.5
        draw.rounded_rectangle((cx - half, cy - half, cx + half, cy + half), radius=max(2, int(half * 0.18)), outline=color, width=width)
        text(draw, cx + half + 8 if frac < 0.9 else 24, cy - half + 8 if frac < 0.9 else size - 48, name)
    for index in range(16):
        angle = index * math.tau / 16
        endpoint = square_boundary_from_angle(angle, size)
        draw.line((cx, cy, endpoint[0], endpoint[1]), fill=(255, 255, 255, 48), width=1)
    text(draw, 24, size - 80, "Continuous square carrier: still one promptable image, less circular wall compression than polar CAVE 270.")


def square_boundary_from_angle(angle: float, size: int) -> tuple[float, float]:
    dx = math.sin(angle)
    dy = -math.cos(angle)
    scale = 0.5 * size / max(abs(dx), abs(dy), 1e-6)
    return (size * 0.5 + dx * scale, size * 0.5 + dy * scale)


def guide_mural(size: int, hard_bands: bool) -> Image.Image:
    image = Image.new("RGB", (size, size), (20, 22, 24))
    draw_mural_guides(image, "CAVE continuity mural guide", hard_bands)
    return image


def guide_rounded_square(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size), (18, 20, 22))
    draw_rounded_square_guides(image, "CAVE rounded-square carrier guide")
    return image


def text(draw: ImageDraw.ImageDraw, x: float, y: float, value: str) -> None:
    font = ImageFont.load_default()
    draw.text((round(x), round(y)), value, fill=(255, 255, 255, 230), font=font)


def write_prompt_notes(output_dir: Path) -> None:
    notes = """CAVE carrier experiment prompts

Use these as GPT Image 2 / inpaint prompt starting points.

1. CAVE continuity mural
Use the image as a continuous CAVE room carrier map. The left and right edges wrap into each other. The horizontal axis is room perimeter travel across front, right, back, and left walls. The upper band is upper wall / overhead continuation. The middle band is wall and horizon continuity. The lower band is floor continuation compressed toward the viewer. Fill missing regions as one coherent CAVE environment. Preserve horizontal continuity across the full width. Do not create cube-face cuts, seams, labels, guides, borders, or polar circular distortion.

2. CAVE rounded-square carrier
Use the image as a continuous rounded-square CAVE carrier. The center is floor continuation below the viewer. Moving outward reaches lower wall, horizon, upper wall, and overhead allowance. The square perimeter wraps around the room horizontally. Preserve continuous geometry and object identity across all guide lines. Remove guide marks and output a clean image with no seams, labels, or construction marks.

3. Current CAVE 270 polar reference
Use this only as a baseline. It is a circular 270-degree CAVE source carrier with floor at center and horizon at two-thirds radius. Repair missing regions while preserving the circular source geometry. Compare against the mural and rounded-square carriers to see which prompt is easiest for the model to obey.
"""
    (output_dir / "PROMPTS.txt").write_text(notes)


def write_plate_prompt_notes(output_dir: Path) -> None:
    notes = """CAVE Plate Sketch carrier prompts

These images are real plate-composition handoffs: colored plate pixels are the fixed visual evidence, pure green means empty/missing area for inpaint, and pure black means outside the valid carrier where present.

Recommended first test: 03-cave-mural-16x9-plate-sketch-guided.png

Prompt: Use this image as a continuous CAVE room carrier map for inpaint. Preserve all plate content exactly as visual evidence: identity, style, scale, orientation, and local detail. Treat pure green regions as missing pixels to reconstruct, not objects. The faint white/cyan/green grid is a CAVE coordinate harness, not scene content: use it to understand the deformation profile, then remove it from the final image. The horizontal axis is continuous room perimeter travel across front, right, back, and left walls; the left and right edges wrap seamlessly. There is no ceiling face. The central/lower continuity is always the floor. The cyan horizontal line marks upper-wall transition; the green horizontal line marks wall-to-floor continuity; lower guide bands collapse toward floor center. Fill the green regions as one coherent CAVE environment with strong horizontal continuity and no cube-face cuts, seams, labels, borders, radial spokes, or visible construction marks.

Rounded-square prompt: Use this image as a continuous rounded-square CAVE carrier. Preserve all plate pixels as source evidence. The faint grid is a coordinate harness, not scene content: use it to understand the deformation, then remove it from the final image. The center/lower-center region is floor continuation below the viewer. Moving outward reaches lower wall, horizon, and upper wall. The square perimeter wraps around the room horizontally. There is no ceiling face. Fill green areas into a coherent CAVE room image without seams, polar circular distortion, guide marks, or labels.

Polar baseline prompt: Use this circular CAVE 270 source carrier as a baseline only. Preserve all non-green plate pixels. Treat pure green inside the circle as missing content and pure black outside the circle as outside the projection. The center is floor below the viewer and the horizon is two-thirds of the radius. Inpaint a coherent CAVE source image without visible green, seams, guide marks, or labels.
"""
    (output_dir / "PLATE_SKETCH_PROMPTS.txt").write_text(notes)


def generate_plate_sketches(out_dir: Path, size: int) -> None:
    plates, placements = load_default_plate_sketch()
    target = out_dir / "plate-sketch-maps"
    target.mkdir(parents=True, exist_ok=True)

    polar = render_polar_plate_sketch(plates, placements, size)
    polar.save(target / "01-current-cave270-polar-plate-sketch.png")

    mural_1x1 = render_plate_sketch(plates, placements, size, size, perimeter_mural_direction)
    mural_1x1.save(target / "02-cave-mural-1x1-plate-sketch.png")
    add_cave_mural_coordinate_harness(mural_1x1).save(target / "02-cave-mural-1x1-plate-sketch-guided.png")

    mural_16x9 = render_plate_sketch(plates, placements, 1536, 864, perimeter_mural_direction)
    mural_16x9.save(target / "03-cave-mural-16x9-plate-sketch.png")
    add_cave_mural_coordinate_harness(mural_16x9).save(target / "03-cave-mural-16x9-plate-sketch-guided.png")

    mural_21x9 = render_plate_sketch(plates, placements, 1792, 768, perimeter_mural_direction)
    mural_21x9.save(target / "04-cave-mural-21x9-plate-sketch.png")
    add_cave_mural_coordinate_harness(mural_21x9).save(target / "04-cave-mural-21x9-plate-sketch-guided.png")

    soft_mural = render_plate_sketch(plates, placements, 1536, 864, soft_mural_direction)
    soft_mural.save(target / "05-cave-soft-mural-16x9-plate-sketch.png")
    add_cave_mural_coordinate_harness(soft_mural, hard_bands=False).save(target / "05-cave-soft-mural-16x9-plate-sketch-guided.png")

    rounded = render_rounded_square_plate_sketch(plates, placements, size)
    rounded.save(target / "06-cave-rounded-square-1x1-plate-sketch.png")
    add_rounded_square_coordinate_harness(rounded).save(target / "06-cave-rounded-square-1x1-plate-sketch-guided.png")
    write_plate_prompt_notes(target)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE if DEFAULT_SOURCE.exists() else FALLBACK_SOURCE)
    parser.add_argument("--out", type=Path, default=Path("exports/cave-carrier-experiments"))
    parser.add_argument("--size", type=int, default=1536)
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    source = Image.open(args.source).convert("RGB")
    size = max(256, int(args.size))

    polar = render_polar_reference(source, size)
    polar.save(args.out / "00-current-cave270-polar-clean.png")
    draw_polar_guides(polar, "Current CAVE 270 polar reference")
    polar.save(args.out / "01-current-cave270-polar-reference.png")

    mural = render_content(source, size, perimeter_mural_direction)
    mural.save(args.out / "02-cave-continuity-mural-clean.png")
    draw_mural_guides(mural, "CAVE continuity mural from polar source", True)
    mural.save(args.out / "03-cave-continuity-mural-from-polar.png")

    soft_mural = render_content(source, size, soft_mural_direction)
    soft_mural.save(args.out / "04-cave-soft-mural-clean.png")
    draw_mural_guides(soft_mural, "CAVE soft vertical mural from polar source", False)
    soft_mural.save(args.out / "05-cave-soft-mural-from-polar.png")

    rounded = render_content(source, size, rounded_square_direction)
    rounded.save(args.out / "06-cave-rounded-square-clean.png")
    draw_rounded_square_guides(rounded, "CAVE rounded-square carrier from polar source")
    rounded.save(args.out / "07-cave-rounded-square-from-polar.png")

    guide_mural(size, True).save(args.out / "08-cave-continuity-mural-guide.png")
    guide_mural(size, False).save(args.out / "09-cave-soft-mural-guide.png")
    guide_rounded_square(size).save(args.out / "10-cave-rounded-square-guide.png")
    write_prompt_notes(args.out)
    generate_plate_sketches(args.out, size)

    print(f"Wrote CAVE carrier experiments to {args.out.resolve()}")


if __name__ == "__main__":
    main()
