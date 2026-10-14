"""
AT SEVDALISI — Blender betik hattının ortak yardımcıları (Blender 4.5 LTS).

Her `build_*.py` betiği bir oyun varlığını SIFIRDAN üretir (14.10.2026,
sahibinin kararı: "her şeyi Blender'da sen tasarla"). Varlıklar özgündür,
dışarıdan model/doku indirilmez. Çıktılar:
  - oyunun yüklediği dosya → `apps/web/public/<manifest expectedPath>`
  - düzenlenebilir kaynak  → `tools/blender/sources/<ad>.blend`

Çalıştırma (ikisi de aynı sonucu verir):
  blender -b -P tools/blender/build_hdri.py      # kurulu Blender ile
  python tools/blender/build_hdri.py             # `pip install bpy==4.5.*` ile
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from typing import Iterable, Sequence

import bpy

Vec3 = tuple[float, float, float]


def repo_root() -> Path:
    """Depo kökü: `AT_SEVDALISI_ROOT` ya da bu dosyadan yukarı doğru `config/` + `apps/web`."""
    env = os.environ.get('AT_SEVDALISI_ROOT')
    if env:
        return Path(env).resolve()
    for parent in Path(__file__).resolve().parents:
        if (parent / 'config').is_dir() and (parent / 'apps' / 'web').is_dir():
            return parent
    raise RuntimeError('Depo kökü bulunamadı; AT_SEVDALISI_ROOT ortam değişkenini verin.')


def load_config(name: str) -> dict:
    """`config/<name>.config.json` — oyunla AYNI ayar dosyası (tek doğruluk kaynağı)."""
    return json.loads((repo_root() / 'config' / f'{name}.config.json').read_text(encoding='utf-8'))


def public_path(relative: str) -> Path:
    """Oyunun yüklediği yol (`apps/web/public/` altı); klasörü oluşturur."""
    path = repo_root() / 'apps' / 'web' / 'public' / relative
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def source_path(name: str) -> Path:
    path = repo_root() / 'tools' / 'blender' / 'sources' / name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def reset_scene() -> bpy.types.Scene:
    """Boş sahne (varsayılan küp/ışık/kamera YOK)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def three_to_blender(v: Sequence[float]) -> Vec3:
    """three.js (Y yukarı) → Blender (Z yukarı). glTF dışa aktarımı bunun tersini yapar."""
    x, y, z = v
    return (float(x), float(-z), float(y))


def normalized(v: Sequence[float]) -> Vec3:
    length = math.sqrt(sum(c * c for c in v))
    return (v[0] / length, v[1] / length, v[2] / length)


def save_source(name: str) -> Path:
    """Düzenlenebilir `.blend` kaynağını kaydeder (sıkıştırılmış, göreli yollar)."""
    path = source_path(name)
    bpy.context.preferences.filepaths.save_version = 0  # `.blend1` yedeği üretme
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True, relative_remap=True)
    return path


def principled(name: str, color: Iterable[float], roughness: float = 0.6, metallic: float = 0.0) -> bpy.types.Material:
    """Düz renkli PBR malzeme. Ad önemlidir: oyun bazı malzemeleri ADIYLA renklendirir."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes['Principled BSDF']
    rgba = list(color) + [1.0] if len(list(color)) == 3 else list(color)
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return material


def srgb_to_linear(hex_color: str) -> tuple[float, float, float]:
    """'#rrggbb' → Blender'ın beklediği doğrusal renk."""
    hex_color = hex_color.lstrip('#')
    out = []
    for i in range(0, 6, 2):
        c = int(hex_color[i : i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2])
