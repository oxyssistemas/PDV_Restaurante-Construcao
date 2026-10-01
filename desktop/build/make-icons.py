"""Gera os ícones do app (Windows, Mac, Android e iOS) a partir do logo em src/assets/oxys-logo.png.
Uso: python3 desktop/build/make-icons.py  (precisa do Pillow)"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageChops

ROOT = Path(__file__).resolve().parents[2]
logo = Image.open(ROOT / 'src/assets/oxys-logo.png').convert('RGB')

# Recorta só o símbolo (o círculo com os pixels) e torna o fundo branco transparente.
mark = logo.crop((410, 130, 870, 590))
bg = Image.new('RGB', mark.size, (255, 255, 255))
diff = ImageChops.difference(mark, bg).convert('L').point(lambda v: max(0, min(255, (v - 10) * 8)))
mark = mark.convert('RGBA'); mark.putalpha(diff)
mark = mark.crop(mark.getbbox())

def fit(img, box):
    k = box / max(img.size)  # amplia ou reduz (thumbnail só reduz)
    return img.resize((round(img.width * k), round(img.height * k)), Image.LANCZOS)

def compose(size, scale, rounded, background=(255, 255, 255, 255), margin=0.1):
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if background:
        plate = Image.new('RGBA', (size, size), background)
        mask = Image.new('L', (size, size), 0)
        r = int(size * 0.2237) if rounded else 0
        inset = int(size * margin) if rounded else 0  # 0.1 = margem padrão dos ícones de Mac
        ImageDraw.Draw(mask).rounded_rectangle((inset, inset, size - inset, size - inset), r, fill=255)
        canvas.paste(plate, (0, 0), mask)
    m = fit(mark, int(size * scale))
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas

out = ROOT / 'desktop/build'
# Placa branca arredondada: o azul-escuro do logo some na barra de tarefas escura.
win = compose(1024, 0.74, rounded=True, margin=0.02)
win.save(out / 'icon.png')
win.save(out / 'icon.ico', sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
compose(1024, 0.6, rounded=True).save(out / 'icon.icns')

# Fontes para o @capacitor/assets (Android e iOS)
res = ROOT / 'resources'; res.mkdir(exist_ok=True)
compose(1024, 0.72, rounded=False).convert('RGB').save(res / 'icon-only.png')
compose(1024, 0.6, rounded=False, background=None).save(res / 'icon-foreground.png')
Image.new('RGB', (1024, 1024), (255, 255, 255)).save(res / 'icon-background.png')
# Tela de abertura no mesmo fundo escuro do sistema (#0f1729), com o símbolo numa placa branca.
splash = Image.new('RGBA', (2732, 2732), (15, 23, 41, 255))
badge = compose(720, 0.72, rounded=True, margin=0)
splash.alpha_composite(badge, ((2732 - 720) // 2, (2732 - 720) // 2))
splash.convert('RGB').save(res / 'splash.png')
splash.convert('RGB').save(res / 'splash-dark.png')
print('ok')
