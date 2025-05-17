import sys
import json
from rembg import remove
from PIL import Image, ImageOps
import io
import os

def remove_background(input_path, output_path, add_text=None, border_size=10, border_color=(255, 255, 255)):
    try:
        # Abrir a imagem
        with open(input_path, 'rb') as f:
            input_data = f.read()
            
        # Remover o fundo usando o modelo padrão (não especificar model_name)
        output_data = remove(input_data)
        img = Image.open(io.BytesIO(output_data))
        
        # Adicionar borda branca
        if border_size > 0:
            # Usamos expand que segue o contorno da imagem com canal alfa
            img = ImageOps.expand(img, border=border_size, fill=border_color)
        
        # Adicionar texto, se necessário
        if add_text:
            from PIL import ImageDraw, ImageFont
            draw = ImageDraw.Draw(img)
            
            # Configurar a fonte (tenta usar Arial, caso contrário usa a fonte padrão)
            try:
                # Calcular o tamanho da fonte com base na largura da imagem
                font_size = int(img.width * 0.07)  # 7% da largura da imagem
                font = ImageFont.truetype("arial.ttf", font_size)
            except IOError:
                # Se não encontrar a fonte, usa a fonte padrão
                font_size = int(img.width * 0.07)
                font = ImageFont.load_default()
            
            # Calcular a posição do texto (centralizado na parte inferior)
            text_width, text_height = draw.textbbox((0, 0), add_text, font=font)[2:4]
            position = ((img.width - text_width) // 2, img.height - border_size - text_height - 10)
            
            # Desenhar contorno preto (sombra)
            for offset in [(1, 1), (-1, 1), (1, -1), (-1, -1), (0, 2), (2, 0), (-2, 0), (0, -2)]:
                draw.text((position[0] + offset[0], position[1] + offset[1]), add_text, (0, 0, 0), font=font)
            
            # Desenhar texto branco por cima
            draw.text(position, add_text, (255, 255, 255), font=font)
        
        # Salvar a imagem resultante
        img.save(output_path)
        return True, "Processamento concluído com sucesso"
    except Exception as e:
        return False, str(e)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(json.dumps({"success": False, "error": "Uso: python remove_bg.py input_path output_path [texto]"}))
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    text = sys.argv[3] if len(sys.argv) > 3 else None
    
    success, message = remove_background(input_path, output_path, text)
    # Garante que apenas a saída JSON é enviada para o stdout
    print(json.dumps({"success": success, "message": message, "output_path": output_path if success else None}))