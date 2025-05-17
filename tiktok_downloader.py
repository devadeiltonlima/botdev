import sys
import os
import json
import requests
import time
import re
from urllib.parse import urlparse, parse_qs
from moviepy.editor import VideoFileClip
from dotenv import load_dotenv

# Carrega variáveis de ambiente
load_dotenv()

def extrair_video_id(url):
    """Extrai o ID do vídeo de uma URL do TikTok"""
    print(f"Tentando extrair ID do vídeo da URL: {url}", file=sys.stderr)
    
    # Se a URL estiver vazia ou não for string
    if not url or not isinstance(url, str):
        print(json.dumps({'error': 'URL inválida'}), file=sys.stderr)
        return None

    # Lista de padrões de URL conhecidos do TikTok
    patterns = [
        r'\/video\/(\d+)',  # Padrão comum /video/123456
        r'[/@][^/]+\/video\/(\d+)',  # Padrão @user/video/123456
        r'[\?&]item_id=(\d+)',  # Padrão item_id na query string
        r'\/v\/(\d+)',  # Padrão curto /v/123456
        r'\/t\/(\d+)',  # Outro padrão curto
    ]
    
    try:
        # Para links encurtados, seguir redirecionamento
        if any(domain in url for domain in ['vm.tiktok.com', 'vt.tiktok.com']):
            print("Link encurtado detectado, seguindo redirecionamento...", file=sys.stderr)
            try:
                response = requests.head(url, allow_redirects=True, timeout=10)
                url = response.url
                print(f"URL após redirecionamento: {url}", file=sys.stderr)
            except Exception as e:
                print(json.dumps({'error': f'Erro ao seguir redirecionamento: {str(e)}'}), file=sys.stderr)
                return None

        # Tenta cada padrão de expressão regular
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                video_id = match.group(1)
                print(f"ID do vídeo encontrado usando padrão {pattern}: {video_id}", file=sys.stderr)
                return video_id

        # Se ainda não encontrou, tenta da URL parseada
        parsed_url = urlparse(url)
        path_parts = parsed_url.path.split('/')
        
        # Procura na estrutura da URL
        if 'tiktok.com' in parsed_url.netloc:
            for i, part in enumerate(path_parts):
                if part.isdigit() and len(part) > 5:  # IDs do TikTok geralmente são longos
                    print(f"ID do vídeo encontrado na estrutura da URL: {part}", file=sys.stderr)
                    return part

        print(json.dumps({'error': 'ID do vídeo não encontrado na URL'}), file=sys.stderr)
        return None

    except Exception as e:
        print(json.dumps({'error': f'Erro ao extrair ID do vídeo: {str(e)}'}), file=sys.stderr)
        return None

def baixar_tiktok(url, tipo='video'):
    """
    Baixa vídeo ou áudio do TikTok usando a API RapidAPI
    
    Args:
        url (str): URL do vídeo do TikTok
        tipo (str): 'video' ou 'audio'
        
    Returns:
        dict: Dicionário com o caminho do arquivo baixado e seu tipo
    """
    try:
        print("\n=== INÍCIO DO PROCESSO DE DOWNLOAD DO TIKTOK ===", file=sys.stderr)
        print(f"📥 Requisição recebida:", file=sys.stderr)
        print(f"  - Tipo: {tipo}", file=sys.stderr)
        print(f"  - URL: {url}", file=sys.stderr)
        print(f"  - Timestamp: {int(time.time())}", file=sys.stderr)

        # Extrai o ID do vídeo da URL
        video_id = extrair_video_id(url)
        if not video_id:
            print(json.dumps({'error': 'Não foi possível extrair o ID do vídeo'}), file=sys.stderr)
            return None
        
        print(f"ID do vídeo: {video_id}", file=sys.stderr)
        
        # Configura a API do TikTok da RapidAPI
        api_url = "https://tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com/index"
        querystring = {"url": url}
        
        rapidapi_key = os.getenv('RAPIDAPI_KEY')
        if not rapidapi_key:
            print(json.dumps({'error': 'Chave da API não encontrada nas variáveis de ambiente'}), file=sys.stderr)
            return None
            
        headers = {
            "x-rapidapi-key": rapidapi_key,
            "x-rapidapi-host": "tiktok-downloader-download-tiktok-videos-without-watermark.p.rapidapi.com"
        }
        
        print("Fazendo requisição para a API correta...", file=sys.stderr)
        
        # Faz a requisição para a API
        response = requests.get(api_url, headers=headers, params=querystring)
        
        if response.status_code != 200:
            print(json.dumps({'error': f'Erro na requisição: Status {response.status_code}'}), file=sys.stderr)
            return None
        
        try:
            data = response.json()
            print(f"Resposta da API recebida, processando dados...", file=sys.stderr)
            
            video_url = None
            audio_url = None
            
            # Extrai o link do vídeo sem marca d'água
            if 'video' in data and isinstance(data['video'], list) and len(data['video']) > 0:
                video_url = data['video'][0]
                print(f"URL encontrada no campo 'video': {video_url}", file=sys.stderr)
            
            # Extrai o link do áudio se solicitado
            if tipo == 'audio' and 'music' in data and isinstance(data['music'], list) and len(data['music']) > 0:
                audio_url = data['music'][0]
                print(f"URL encontrada no campo 'music': {audio_url}", file=sys.stderr)
            
            # Se não encontrou, retorna erro
            if tipo == 'audio' and not audio_url:
                print(json.dumps({'error': 'URL do áudio não encontrada na resposta da API'}), file=sys.stderr)
                return None
            
            if tipo == 'video' and not video_url:
                print(json.dumps({'error': 'URL do vídeo não encontrada na resposta da API'}), file=sys.stderr)
                return None
            
            # Cria pasta de downloads se não existir
            pasta = os.path.join(os.getcwd(), 'downloads')
            os.makedirs(pasta, exist_ok=True)
            
            # Define o nome do arquivo baseado no timestamp atual
            timestamp = int(time.time())
            
            if tipo == 'audio':
                audio_path = os.path.join(pasta, f'tiktok_{timestamp}.mp3')
                print(f"Baixando áudio de: {audio_url}", file=sys.stderr)
                audio_response = requests.get(audio_url)
                if audio_response.status_code != 200:
                    print(json.dumps({'error': f'Erro ao baixar áudio: Status {audio_response.status_code}'}), file=sys.stderr)
                    return None
                
                with open(audio_path, 'wb') as f:
                    f.write(audio_response.content)
                
                print(f"Áudio salvo em: {audio_path}", file=sys.stderr)
                
                resultado = {
                    'filePath': audio_path,
                    'type': 'audio',
                    'timestamp': int(time.time()),
                    'fileSize': os.path.getsize(audio_path),
                    'status': 'success'
                }
                print("\n=== FIM DO PROCESSO DE DOWNLOAD DO TIKTOK ===", file=sys.stderr)
                print(json.dumps(resultado))
                return resultado
            
            else:
                video_path = os.path.join(pasta, f'tiktok_{timestamp}.mp4')
                print(f"Baixando vídeo de: {video_url}", file=sys.stderr)
                video_response = requests.get(video_url)
                if video_response.status_code != 200:
                    print(json.dumps({'error': f'Erro ao baixar vídeo: Status {video_response.status_code}'}), file=sys.stderr)
                    return None
                
                with open(video_path, 'wb') as f:
                    f.write(video_response.content)
                
                print(f"Vídeo salvo em: {video_path}", file=sys.stderr)
                
                resultado = {
                    'filePath': video_path,
                    'type': 'video',
                    'timestamp': int(time.time()),
                    'fileSize': os.path.getsize(video_path),
                    'status': 'success'
                }
                print("\n=== FIM DO PROCESSO DE DOWNLOAD DO TIKTOK ===", file=sys.stderr)
                print(json.dumps(resultado))
                return resultado
            
        except Exception as e:
            print(f"Erro ao processar resposta JSON: {str(e)}", file=sys.stderr)
            print(f"Resposta bruta: {response.text[:500]}", file=sys.stderr)  # Mostra os primeiros 500 caracteres da resposta
            return None
            
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        return None

def main():
    """Função principal que processa os argumentos da linha de comando"""
    # Se não tiver argumentos suficientes
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Argumentos insuficientes. Use uma URL"}))
        sys.exit(1)
    
    # Se o primeiro argumento parece ser uma URL, é um download
    primeiro_arg = sys.argv[1]
    if primeiro_arg.startswith('http'):
        tipo = sys.argv[2] if len(sys.argv) > 2 else 'video'
        resultado = baixar_tiktok(primeiro_arg, tipo)
        if resultado:
            sys.exit(0)
        else:
            sys.exit(1)
    else:
        print(json.dumps({"error": "URL inválida"}))
        sys.exit(1)

if __name__ == "__main__":
    main()
