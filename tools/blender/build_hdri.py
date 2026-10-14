"""
ALTIN SAAT GÖKYÜZÜ HDRI'Sİ → `apps/web/public/hdri/golden-hour.hdr`
(manifest `HDRI_SKY_REQUIRED`).

Blender'ın fiziksel Nishita gökyüzü + çim renginde uzak bir zemin, Cycles ile
360°×180° eşdikdörtgen (equirectangular) olarak render edilir. Güneş oyunun
gölge ışığıyla AYNI yöndedir: `config/lighting.config.json` → `sun.position`
okunur ve güneş diski görüntüde three.js'in eşdikdörtgen kuralına göre
(u = atan2(z, x)/2π + 0.5, v = asin(y)/π + 0.5) tam o yöne oturana dek
kalibre edilir. `apps/web/test/.../hdri-sun.spec.ts` sonucu denetler.

Son işlem: (1) parlaklık, güneşten uzak ufuk gökyüzü `HORIZON_TARGET`
olacak şekilde ölçeklenir (sahne pozlamasıyla uyum), (2) güneş diski
`SUN_CLAMP`e kırpılır — oyunda ayrıca yönlü güneş ışığı var; kırpılmamış
disk ortam ışığında ikinci, çok güçlü bir güneş yaratırdı.
"""

from __future__ import annotations

import math
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))

import bpy  # noqa: E402
import numpy as np  # noqa: E402

from at_common import load_config, normalized, public_path, reset_scene, save_source, srgb_to_linear  # noqa: E402

WIDTH = 2048
HEIGHT = 1024
SAMPLES = 128
CAMERA_HEIGHT_METERS = 1.7
GROUND_COLOR = '#2f4420'  # çim (uzak zemin; oyunda yakın zemin kendi çimidir)
AIR_DENSITY = 1.0
DUST_DENSITY = 1.4  # hafif altın saat pusu (fazlası gökyüzünü griye çeker)
OZONE_DENSITY = 1.0
SUN_SIZE_DEGREES = 0.55  # gerçek güneş ~0.53°
HORIZON_TARGET = 0.62  # güneşin karşısındaki ufuk gökyüzünün doğrusal parlaklığı (ACES pozlama 1.0 ile)
SUN_CLAMP = 48.0
OUTPUT = 'hdri/golden-hour.hdr'

# Bulut katmanı (gölgelendiricide): her bakış yönü sabit yükseklikteki bir
# düzleme izdüşürülür; gürültü → kümülüs örtüsü. Güneşe doğru kaydırılmış
# ikinci örnekle kenar aydınlatması ("gümüş astar") ve gölgeli taban.
CLOUD_SCALE = 0.55  # düzlemdeki gürültü ölçeği (büyük = küçük bulutlar)
CLOUD_COVERAGE = 0.52  # renk rampası eşiği (küçük = daha çok bulut)
CLOUD_SOFTNESS = 0.11
CLOUD_SHADE_OFFSET = 0.18  # aydınlatma örneğinin güneşe doğru kayması
CLOUD_HORIZON_FADE = (0.035, 0.22)  # ufka yakın bulut gerilmesini soldur (dir.z aralığı)
CLOUD_LIT_TINT = (1.0, 0.86, 0.70)
CLOUD_SHADOW_TINT = (0.50, 0.55, 0.66)
# Bulutu gökyüzü değil GÜNEŞ aydınlatır: parlaklık, bulutsuz gökyüzünün güneş
# karşısı ufuk parlaklığına göre sabittir; güneşe yakın ileri saçılım ek parlaklık.
CLOUD_LIT_SCALE = 1.25
CLOUD_SUN_GLOW = 2.5
CLOUD_SUN_GLOW_POWER = 6.0
SUN_CLEAR_COS = 0.9985  # güneş diskinin çevresi bulutsuz (kalibrasyon + görünürlük)


def target_direction() -> tuple[float, float, float]:
    """Güneş yönü (three.js koordinatı, birim vektör)."""
    return normalized(load_config('lighting')['sun']['position'])


def three_equirect_uv(direction: tuple[float, float, float]) -> tuple[float, float]:
    x, y, z = direction
    return math.atan2(z, x) / (2 * math.pi) + 0.5, math.asin(max(-1.0, min(1.0, y))) / math.pi + 0.5


def add_clouds(tree: bpy.types.NodeTree, sky: bpy.types.Node, brightness: float) -> None:
    """Gökyüzü + bulut karışımını Background'a bağlar (düğüm grafiği)."""
    nodes, links = tree.nodes, tree.links

    def math_node(operation: str, a, b=None):
        node = nodes.new('ShaderNodeMath')
        node.operation = operation
        for index, value in enumerate((a, b)):
            if value is None:
                continue
            if isinstance(value, (int, float)):
                node.inputs[index].default_value = value
            else:
                links.new(value, node.inputs[index])
        return node.outputs[0]

    direction = nodes.new('ShaderNodeTexCoord').outputs['Generated']
    split = nodes.new('ShaderNodeSeparateXYZ')
    links.new(direction, split.inputs[0])
    dz = math_node('MAXIMUM', split.outputs['Z'], 0.01)
    plane_x = math_node('DIVIDE', split.outputs['X'], dz)
    plane_y = math_node('DIVIDE', split.outputs['Y'], dz)

    # Güneşin yatay yönü (Blender ekseninde) — gölgelendirme kayması için.
    tx, ty, tz = target_direction()
    sun_x, sun_y = tx, -tz  # three (x, y, z) → Blender (x, -z, y)
    length = math.hypot(sun_x, sun_y) or 1.0
    sun_x, sun_y = sun_x / length, sun_y / length

    def cloud_noise(offset_x: float, offset_y: float):
        combine = nodes.new('ShaderNodeCombineXYZ')
        links.new(math_node('ADD', plane_x, offset_x), combine.inputs['X'])
        links.new(math_node('ADD', plane_y, offset_y), combine.inputs['Y'])
        noise = nodes.new('ShaderNodeTexNoise')
        noise.noise_dimensions = '3D'
        noise.inputs['Scale'].default_value = CLOUD_SCALE
        noise.inputs['Detail'].default_value = 7.0
        noise.inputs['Roughness'].default_value = 0.58
        links.new(combine.outputs[0], noise.inputs['Vector'])
        return noise.outputs['Fac']

    base = cloud_noise(0.0, 0.0)
    toward_sun = cloud_noise(sun_x * CLOUD_SHADE_OFFSET, sun_y * CLOUD_SHADE_OFFSET)

    ramp = nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = CLOUD_COVERAGE
    ramp.color_ramp.elements[1].position = CLOUD_COVERAGE + CLOUD_SOFTNESS
    links.new(base, ramp.inputs['Fac'])
    density = ramp.outputs['Color']

    # Ufka yakın gerilmiş bulutları soldur.
    fade = nodes.new('ShaderNodeMapRange')
    fade.inputs['From Min'].default_value = CLOUD_HORIZON_FADE[0]
    fade.inputs['From Max'].default_value = CLOUD_HORIZON_FADE[1]
    links.new(split.outputs['Z'], fade.inputs['Value'])
    coverage = nodes.new('ShaderNodeRGBToBW')
    links.new(density, coverage.inputs[0])
    mask = math_node('MULTIPLY', coverage.outputs[0], fade.outputs['Result'])

    # Güneşin hemen çevresi bulutsuz.
    sun_vec = nodes.new('ShaderNodeCombineXYZ')
    bx, by, bz = tx, -tz, ty
    sun_vec.inputs['X'].default_value, sun_vec.inputs['Y'].default_value, sun_vec.inputs['Z'].default_value = bx, by, bz
    dot = nodes.new('ShaderNodeVectorMath')
    dot.operation = 'DOT_PRODUCT'
    links.new(direction, dot.inputs[0])
    links.new(sun_vec.outputs[0], dot.inputs[1])
    clear = nodes.new('ShaderNodeMapRange')
    clear.inputs['From Min'].default_value = SUN_CLEAR_COS
    clear.inputs['From Max'].default_value = SUN_CLEAR_COS - 0.002
    links.new(dot.outputs['Value'], clear.inputs['Value'])
    mask = math_node('MULTIPLY', mask, clear.outputs['Result'])

    # Aydınlatma: güneşe doğru yoğunluk azalıyorsa kenar aydınlık.
    light = math_node('ADD', math_node('MULTIPLY', math_node('SUBTRACT', base, toward_sun), 4.0), 0.55)
    light = math_node('MINIMUM', math_node('MAXIMUM', light, 0.0), 1.0)
    tint = nodes.new('ShaderNodeMix')
    tint.data_type = 'RGBA'
    tint.inputs['A'].default_value = (*CLOUD_SHADOW_TINT, 1.0)
    tint.inputs['B'].default_value = (*CLOUD_LIT_TINT, 1.0)
    links.new(light, tint.inputs['Factor'])

    # Parlaklık: sabit (güneş aydınlatması) × güneşe yakın ileri saçılım.
    glow = math_node('POWER', math_node('MAXIMUM', dot.outputs['Value'], 0.0), CLOUD_SUN_GLOW_POWER)
    level = math_node('MULTIPLY', math_node('ADD', math_node('MULTIPLY', glow, CLOUD_SUN_GLOW), 1.0), brightness)
    gray = nodes.new('ShaderNodeCombineColor')
    for channel in ('Red', 'Green', 'Blue'):
        links.new(level, gray.inputs[channel])
    cloud_color = nodes.new('ShaderNodeMix')
    cloud_color.data_type = 'RGBA'
    cloud_color.blend_type = 'MULTIPLY'
    cloud_color.inputs['Factor'].default_value = 1.0
    links.new(tint.outputs['Result'], cloud_color.inputs['A'])
    links.new(gray.outputs[0], cloud_color.inputs['B'])

    final = nodes.new('ShaderNodeMix')
    final.data_type = 'RGBA'
    links.new(mask, final.inputs['Factor'])
    links.new(sky.outputs['Color'], final.inputs['A'])
    links.new(cloud_color.outputs['Result'], final.inputs['B'])
    links.new(final.outputs['Result'], nodes['Background'].inputs['Color'])


def setup_scene(
    sun_rotation: float, sun_elevation: float, with_ground: bool, cloud_brightness: float | None = None
) -> bpy.types.Scene:
    scene = reset_scene()
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    world = bpy.data.worlds.new('AltinSaat')
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    sky = nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'NISHITA'
    sky.sun_disc = True
    sky.sun_size = math.radians(SUN_SIZE_DEGREES)
    sky.sun_elevation = sun_elevation
    sky.sun_rotation = sun_rotation
    sky.altitude = 0.0
    sky.air_density = AIR_DENSITY
    sky.dust_density = DUST_DENSITY
    sky.ozone_density = OZONE_DENSITY
    if cloud_brightness is None:
        world.node_tree.links.new(sky.outputs['Color'], nodes['Background'].inputs['Color'])
    else:
        add_clouds(world.node_tree, sky, cloud_brightness)

    camera_data = bpy.data.cameras.new('Panorama')
    camera_data.type = 'PANO'
    camera_data.panorama_type = 'EQUIRECTANGULAR'
    camera = bpy.data.objects.new('Panorama', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    # Görüntü merkezi = Blender +X (= three.js +X); ufuk yatay.
    camera.rotation_euler = (math.radians(90), 0.0, math.radians(-90))
    camera.location = (0.0, 0.0, CAMERA_HEIGHT_METERS)

    if with_ground:
        bpy.ops.mesh.primitive_plane_add(size=40000.0, location=(0.0, 0.0, 0.0))
        ground = bpy.context.active_object
        ground.name = 'UzakZemin'
        material = bpy.data.materials.new('UzakZemin')
        material.use_nodes = True
        bsdf = material.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*srgb_to_linear(GROUND_COLOR), 1.0)
        bsdf.inputs['Roughness'].default_value = 1.0
        ground.data.materials.append(material)
    return scene


def render_pixels(scene: bpy.types.Scene, width: int, height: int, samples: int, denoise: bool) -> np.ndarray:
    """Render → (H, W, 3) doğrusal float dizi; satır 0 = görüntünün ÜSTÜ."""
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.cycles.samples = samples
    scene.cycles.use_denoising = denoise
    if denoise:
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
    scene.view_settings.view_transform = 'Standard'
    scene.render.image_settings.file_format = 'OPEN_EXR'
    scene.render.image_settings.color_depth = '32'
    with tempfile.TemporaryDirectory() as folder:
        path = str(Path(folder) / 'render.exr')
        scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        image = bpy.data.images.load(path)
        flat = np.empty(width * height * 4, dtype=np.float32)
        image.pixels.foreach_get(flat)
        bpy.data.images.remove(image)
    # Blender piksel dizisi alttan üste; üstten alta çevir.
    return flat.reshape(height, width, 4)[::-1, :, :3].copy()


def sun_uv(pixels: np.ndarray) -> tuple[float, float]:
    luminance = pixels @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    row, col = np.unravel_index(int(np.argmax(luminance)), luminance.shape)
    height, width = luminance.shape
    return (col + 0.5) / width, 1.0 - (row + 0.5) / height


def horizon_luminance(pixels: np.ndarray, target_u: float) -> float:
    """Güneşin karşısındaki ufuk bandının (yükseklik 3°–12°) ortalama parlaklığı."""
    height, width, _ = pixels.shape
    anti_u = (target_u + 0.5) % 1.0
    band_cols = [int(((anti_u + du) % 1.0) * width) for du in np.linspace(-0.08, 0.08, 33)]
    row_top = int((0.5 - 12 / 180) * height)
    row_bottom = int((0.5 - 3 / 180) * height)
    band = pixels[row_top:row_bottom][:, band_cols]
    return float((band @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).mean())


def calibrate_rotation(elevation: float, target_u: float) -> float:
    """Güneş diskinin görüntüdeki yatay konumunu hedefe oturtan `sun_rotation`."""
    def measure(rotation: float) -> float:
        scene = setup_scene(rotation, elevation, with_ground=False)
        return sun_uv(render_pixels(scene, 512, 256, 1, denoise=False))[0]

    def wrap(du: float) -> float:
        return (du + 0.5) % 1.0 - 0.5

    r0, r1 = 0.0, 0.5
    u0, u1 = measure(r0), measure(r1)
    slope = wrap(u1 - u0) / (r1 - r0)  # ±1/2π beklenir
    rotation = r0 + wrap(target_u - u0) / slope
    for _ in range(3):
        u = measure(rotation)
        error = wrap(target_u - u)
        if abs(error) < 0.5 / 512:
            break
        rotation += error / slope
    return rotation


def _rle_channel(values: np.ndarray) -> bytes:
    """Radiance "yeni RLE" — bir tarama satırının tek kanalı."""
    out = bytearray()
    n = len(values)
    i = 0
    while i < n:
        # Aynı değerden en az 4'lük koşu: (128 + uzunluk, değer).
        run = 1
        while i + run < n and run < 127 and values[i + run] == values[i]:
            run += 1
        if run >= 4:
            out += bytes((128 + run, int(values[i])))
            i += run
            continue
        # Değişmez (literal) dizi: sonraki ≥4'lük koşuya kadar, en fazla 128.
        start = i
        while i < n and i - start < 128:
            ahead = 1
            while i + ahead < n and ahead < 4 and values[i + ahead] == values[i]:
                ahead += 1
            if ahead >= 4:
                break
            i += 1
        out += bytes((i - start,)) + bytes(values[start:i].tolist())
    return bytes(out)


def write_hdr(pixels: np.ndarray, path: Path) -> None:
    """Radiance RGBE (.hdr) yazar. Blender'ın `image.save()` yolu HDR'de değerleri
    kırpıyor (100 → 7.1, 14.10.2026'da ölçüldü) — bu yüzden dosya burada yazılır."""
    height, width, _ = pixels.shape
    rgb = np.maximum(pixels.astype(np.float64), 0.0)
    brightest = rgb.max(axis=2)
    mantissa, exponent = np.frexp(brightest)
    scale = np.where(brightest > 1e-32, mantissa * 256.0 / np.maximum(brightest, 1e-32), 0.0)
    rgbe = np.zeros((height, width, 4), dtype=np.uint8)
    rgbe[:, :, :3] = np.clip(rgb * scale[:, :, None], 0, 255).astype(np.uint8)
    rgbe[:, :, 3] = np.where(brightest > 1e-32, exponent + 128, 0).astype(np.uint8)
    header = f'#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y {height} +X {width}\n'.encode('ascii')
    body = bytearray()
    for row in rgbe:
        body += bytes((2, 2, width >> 8, width & 0xFF))
        for channel in range(4):
            body += _rle_channel(row[:, channel])
    path.write_bytes(header + bytes(body))


def main() -> None:
    direction = target_direction()
    target_u, target_v = three_equirect_uv(direction)
    elevation = math.asin(direction[1])
    rotation = calibrate_rotation(elevation, target_u)

    # Bulutsuz gökyüzünde güneş karşısı ufuk parlaklığı (ham birim) → bulut parlaklığı.
    clear_sky = render_pixels(setup_scene(rotation, elevation, with_ground=False), 1024, 512, 1, denoise=False)
    horizon_raw = horizon_luminance(clear_sky, target_u)
    scene = setup_scene(rotation, elevation, with_ground=True, cloud_brightness=horizon_raw * CLOUD_LIT_SCALE)
    scene.cycles.samples = SAMPLES
    save_source('golden-hour-sky.blend')
    pixels = render_pixels(scene, WIDTH, HEIGHT, SAMPLES, denoise=True)

    # Pozlama: BULUTSUZ gökyüzünde güneş karşısı ufuk bandı HORIZON_TARGET olsun
    # (bulut örtüsü ölçümü oynatmasın diye ölçek bulutsuz render'dan).
    pixels *= HORIZON_TARGET / horizon_raw
    horizon = horizon_raw
    np.minimum(pixels, SUN_CLAMP, out=pixels)

    measured_u, measured_v = sun_uv(pixels)
    output = public_path(OUTPUT)
    write_hdr(pixels, output)
    print(
        f'[hdri] {output} {WIDTH}x{HEIGHT} | güneş hedef u={target_u:.4f} v={target_v:.4f} '
        f'ölçülen u={measured_u:.4f} v={measured_v:.4f} | ufuk ölçeği {HORIZON_TARGET / horizon:.4f}'
    )


if __name__ == '__main__':
    main()
