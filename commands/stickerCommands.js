import sharp from 'sharp';
import path from 'path';
import fs from 'fs-extra';
import { spawn } from 'child_process';
import ffmpeg from 'fluent-ffmpeg';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tempDir = path.join(__dirname, '../temp');

// Função para converter emoji para código unicode
function emojiToUnicode(emoji) {
    return emoji.codePointAt(0).toString(16);
}

// Função para buscar emoji combinado da API do Google
async function getMixedEmojiUrl(emoji1, emoji2) {
    // Timestamps disponíveis no Emoji Kitchen, do mais recente para o mais antigo
    const timestamps = [
        "20240101",
        "20230901",
        "20230601",
        "20230301",
        "20221101",
        "20220823",
        "20220506",
        "20211115",
        "20210831",
        "20201001"
    ];
    
    console.log('Iniciando busca de combinação de emojis:', emoji1, emoji2);
    const e1 = emojiToUnicode(emoji1);
    const e2 = emojiToUnicode(emoji2);
    const baseUrl = "https://www.gstatic.com/android/keyboard/emojikitchen/";
    
    // Tenta em ordem cada um dos possíveis URLs para diferentes timestamps
    for (const timestamp of timestamps) {
        try {
            // Tenta primeiro padrão (e1/e1_e2)
            const url1 = `${baseUrl}${timestamp}/u${e1}/u${e1}_u${e2}.png`;
            console.log('Tentando URL1:', url1);
            const response1 = await fetch(url1, { method: 'HEAD' });
            if (response1.ok) {
                console.log('URL1 encontrado:', url1);
                const response = await fetch(url1);
                return await response.buffer();
            }
            
            // Tenta segundo padrão (e2/e2_e1)
            const url2 = `${baseUrl}${timestamp}/u${e2}/u${e2}_u${e1}.png`;
            console.log('Tentando URL2:', url2);
            const response2 = await fetch(url2, { method: 'HEAD' });
            if (response2.ok) {
                console.log('URL2 encontrado:', url2);
                const response = await fetch(url2);
                return await response.buffer();
            }
        } catch (error) {
            console.log(`Tentativa falhou para timestamp ${timestamp}: ${error.message}`);
            continue;
        }
    }
    
    console.log('Nenhuma combinação encontrada para os emojis:', emoji1, emoji2);
    throw new Error('Combinação de emojis não disponível');
}

// Funções auxiliares
function calcularTamanhoFonte(texto) {
    // Tamanho base maior para melhor visibilidade
    const tamanhoBase = 100; // Aumentado de 60 para 100
    const caracteresBase = 15; // Reduzido de 20 para 15 para manter texto grande
    if (texto.length <= caracteresBase) return tamanhoBase;
    
    // Reduz mais suavemente para textos maiores
    const reducao = Math.floor((texto.length - caracteresBase) / 8); // Redução mais suave
    const novoTamanho = Math.max(45, tamanhoBase - (reducao * 8)); // Mínimo aumentado para 45px
    return novoTamanho;
}

function ajustarTexto(texto) {
    // Limita o texto a no máximo 2 linhas para manter texto maior
    const palavras = texto.split(' ');
    const linhas = [];
    let linhaAtual = '';
    
    for (const palavra of palavras) {
        if ((linhaAtual + palavra).length > 15) { // Reduzido de 20 para 15 caracteres por linha
            if (linhas.length >= 1) { // Reduzido para 1 linha antes de adicionar "..."
                linhas[linhas.length - 1] = linhas[linhas.length - 1].trim() + '...';
                break;
            }
            linhas.push(linhaAtual.trim());
            linhaAtual = palavra + ' ';
        } else {
            linhaAtual += palavra + ' ';
        }
    }
    if (linhaAtual && linhas.length < 2) { // Máximo de 2 linhas
        linhas.push(linhaAtual.trim());
    }
    
    // Retorna o texto formatado com quebras de linha para SVG
    return linhas.map((linha, i) => 
        `<tspan x="50%" dy="${i === 0 ? '0' : '1.2em'}">${linha}</tspan>`
    ).join('');
}

async function reagirMensagem(sock, msg, emoji) {
    await sock.sendMessage(msg.key.remoteJid, {
        react: {
            text: emoji,
            key: msg.key
        }
    });
}

// Função para criar figurinha de imagem
async function criarFigurinhaImagem(sock, msg) {
    let imageMsg = msg.message.imageMessage ||
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
    let quotedMsg = msg;
    
    if (!msg.message.imageMessage && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
        quotedMsg = {
            ...msg,
            message: msg.message.extendedTextMessage.contextInfo.quotedMessage
        };
    }
    
    if (!imageMsg) {
        await sock.sendMessage(msg.key.remoteJid, { text: 'Envie ou responda uma imagem com o comando !fig.' }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
        return;
    }
    
    try {
        const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, { reuploadRequest: sock });
        const stickerBuffer = await sharp(buffer)
            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .webp()
            .toBuffer();
        await sock.sendMessage(msg.key.remoteJid, { sticker: stickerBuffer }, { quoted: msg });
        await reagirMensagem(sock, msg, '✅');
    } catch (e) {
        console.error('Erro ao criar figurinha:', e);
        await sock.sendMessage(msg.key.remoteJid, { text: 'Erro ao criar figurinha. Tente novamente.' }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
    }
}

// Função para criar figurinha recortada
async function criarFigurinhaRecortada(sock, msg, textoAdicional = null) {
    try {
        await reagirMensagem(sock, msg, '⏳');
        
        let imageMsg = msg.message.imageMessage ||
            msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
        let quotedMsg = msg;
        
        if (!msg.message.imageMessage && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage) {
            quotedMsg = {
                ...msg,
                message: msg.message.extendedTextMessage.contextInfo.quotedMessage
            };
        }
        
        if (!imageMsg) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Envie ou responda uma imagem com o comando @fignow.' 
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }
        
        const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, { reuploadRequest: sock });
        
        const timestamp = Date.now();
        const inputPath = path.join(tempDir, `temp_${timestamp}.jpg`);
        const outputPath = path.join(tempDir, `sticker_${timestamp}.webp`);
        await fs.writeFile(inputPath, buffer);
        
        const args = [
            path.join(__dirname, '../remove_bg.py'),
            inputPath,
            outputPath
        ];
        
        if (textoAdicional) {
            args.push(textoAdicional);
        }
        
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Processando imagem... ✂️🖼️' 
        }, { quoted: msg });
        
        const pythonProcess = spawn('python', args);
        
        let outputData = '';
        pythonProcess.stdout.on('data', (data) => {
            outputData += data.toString();
        });
        
        await new Promise((resolve, reject) => {
            pythonProcess.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Processo Python terminou com código ${code}`));
            });
            pythonProcess.on('error', reject);
        });
        
        const result = JSON.parse(outputData);
        if (!result.success) {
            throw new Error(result.message);
        }
        
        const stickerBuffer = await fs.readFile(outputPath);
        await sock.sendMessage(msg.key.remoteJid, { 
            sticker: stickerBuffer 
        }, { quoted: msg });
        await reagirMensagem(sock, msg, '✅');
        
        fs.unlink(inputPath).catch(e => console.error('Erro ao remover arquivo temporário:', e));
        fs.unlink(outputPath).catch(e => console.error('Erro ao remover arquivo temporário:', e));
        
    } catch (error) {
        console.error('Erro ao criar figurinha recortada:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao processar imagem. Tente novamente.' 
        }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
    }
}

// Função para criar figurinha animada
async function criarFigurinhaAnimada(sock, msg) {
    try {
        await reagirMensagem(sock, msg, '⏳');
        
        // Verifica tanto videoMessage quanto mensagem citada
        let mediaMsg = msg.message.videoMessage || 
                      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage || 
                      msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.gifMessage;
        let quotedMsg = msg;
        
        // Se for mensagem citada, ajusta o quotedMsg
        if (!msg.message.videoMessage && msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
            quotedMsg = {
                ...msg,
                message: msg.message.extendedTextMessage.contextInfo.quotedMessage
            };
        }
        
        if (!mediaMsg) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Envie ou responda um vídeo/GIF com o comando !gif.' 
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }
        
        if (mediaMsg.fileLength > 10000000) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'O arquivo é muito grande! Envie um GIF ou vídeo de até 10MB.' 
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }
        
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Processando mídia... Isso pode levar alguns segundos ⏳' 
        }, { quoted: msg });
        
        const buffer = await downloadMediaMessage(quotedMsg, 'buffer', {}, { reuploadRequest: sock });
        
        const timestamp = Date.now();
        const inputPath = path.join(tempDir, `input_${timestamp}.mp4`);
        const outputPath = path.join(tempDir, `sticker_${timestamp}.webp`);
        await fs.writeFile(inputPath, buffer);
        
        // Converter diretamente para WebP animado usando ffmpeg
        await new Promise((resolve, reject) => {
            ffmpeg(inputPath)
                .fps(10)
                .videoFilters([
                    'scale=512:512:force_original_aspect_ratio=decrease',
                    'pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000'
                ])
                .outputOptions([
                    '-t', '10',
                    '-vcodec', 'libwebp',
                    '-lossless', '0',
                    '-compression_level', '6',
                    '-q:v', '50',
                    '-loop', '0',
                    '-preset', 'picture',
                    '-vsync', '0',
                    '-an'
                ])
                .toFormat('webp')
                .on('end', resolve)
                .on('error', reject)
                .save(outputPath);
        });

        await sock.sendMessage(msg.key.remoteJid, {
            sticker: await fs.readFile(outputPath)
        }, { quoted: msg });
        
        await reagirMensagem(sock, msg, '✅');
        
        // Limpar arquivos temporários
        setTimeout(async () => {
            try {
                await fs.remove(inputPath);
                await fs.remove(outputPath);
            } catch (e) {
                console.error('Erro ao limpar arquivos temporários:', e);
            }
        }, 5000);
        
    } catch (error) {
        console.error('Erro ao criar figurinha animada:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao processar a mídia. Verifique se o formato é válido e tente novamente.' 
        }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
    }
}

// Função para criar figurinha de texto
async function criarFigurinhaTexto(sock, msg, texto) {
    try {
        if (!texto) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Digite o texto que deseja transformar em figurinha. Ex: !txtfig Olá mundo!'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }
        
        if (texto.split(' ').length > 10) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'O texto deve ter no máximo 10 palavras!'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }
        
        await reagirMensagem(sock, msg, '⏳');
        
        // Calcular o tamanho da fonte baseado no comprimento do texto
        let fontSize = 120; // Tamanho base maior
        const palavras = texto.split(' ');
        
        // Reduzir o tamanho se o texto for muito longo
        if (texto.length > 15) {
            fontSize = Math.max(80, 120 - (texto.length - 15) * 2);
        }
        
        // Se tiver mais de uma palavra, quebrar em linhas
        let textoFormatado = texto;
        if (palavras.length > 1) {
            const metade = Math.ceil(palavras.length / 2);
            const primeiraLinha = palavras.slice(0, metade).join(' ');
            const segundaLinha = palavras.slice(metade).join(' ');
            textoFormatado = `${primeiraLinha}
${segundaLinha}`;
        }
        
        const svg = `
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="#000000" rx="15" ry="15"/>
            <text x="50%" y="50%" font-family="Impact, Arial, sans-serif" font-size="${fontSize}" 
                  fill="white" text-anchor="middle" dominant-baseline="middle" 
                  style="white-space: pre; font-weight: bold;">
                <tspan x="50%" dy="-0.6em">${textoFormatado.split('\n')[0]}</tspan>
                ${textoFormatado.split('\n')[1] ? `<tspan x="50%" dy="1.2em">${textoFormatado.split('\n')[1]}</tspan>` : ''}
            </text>
            <text x="50%" y="50%" font-family="Impact, Arial, sans-serif" font-size="${fontSize}" 
                  stroke="black" stroke-width="4" fill="none" text-anchor="middle" 
                  dominant-baseline="middle" style="white-space: pre; font-weight: bold;">
                <tspan x="50%" dy="-0.6em">${textoFormatado.split('\n')[0]}</tspan>
                ${textoFormatado.split('\n')[1] ? `<tspan x="50%" dy="1.2em">${textoFormatado.split('\n')[1]}</tspan>` : ''}
            </text>
        </svg>`;
        
        const timestamp = Date.now();
        const tempSvgPath = path.join(tempDir, `text_${timestamp}.svg`);
        const outputPath = path.join(tempDir, `sticker_${timestamp}.webp`);
        
        await fs.writeFile(tempSvgPath, svg);
        
        await sharp(Buffer.from(svg))
            .resize(512, 512)
            .webp({ quality: 100 })
            .toFile(outputPath);
        
        const stickerBuffer = await fs.readFile(outputPath);
        await sock.sendMessage(msg.key.remoteJid, { 
            sticker: stickerBuffer
        }, { quoted: msg });
        
        await reagirMensagem(sock, msg, '✅');
        
        fs.unlink(tempSvgPath).catch(e => console.error('Erro ao remover arquivo temporário:', e));
        fs.unlink(outputPath).catch(e => console.error('Erro ao remover arquivo temporário:', e));
        
    } catch (error) {
        console.error('Erro ao criar figurinha de texto:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao criar figurinha de texto. Tente novamente.'
        }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
    }
}

// Função para combinar emojis
async function combinarEmojis(sock, msg, texto) {
    let outputPath = null;
    
    try {
        const emojis = texto.match(/\p{Emoji}/gu);
        
        if (!emojis || emojis.length < 2) {
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Envie dois emojis para combinar. Ex: !emoji 😊 🎉'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }
        
        const emoji1 = emojis[0];
        const emoji2 = emojis[1];
        
        console.log('Tentando combinar emojis:', emoji1, emoji2);
        await reagirMensagem(sock, msg, '⏳');
        
        // Tentar buscar o emoji combinado
        const emojiBuffer = await getMixedEmojiUrl(emoji1, emoji2);
        
        // Criar a figurinha
        const timestamp = Date.now();
        outputPath = path.join(tempDir, `sticker_${timestamp}.webp`);

        // Converter para WebP
        await sharp(emojiBuffer)
            .resize(512, 512)
            .webp()
            .toFile(outputPath);

        // Ler o arquivo gerado
        const stickerBuffer = await fs.readFile(outputPath);
        await sock.sendMessage(msg.key.remoteJid, { 
            sticker: stickerBuffer
        }, { quoted: msg });
        
        await reagirMensagem(sock, msg, '✅');
        
    } catch (error) {
        console.error('Erro ao combinar emojis:', error);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: `Não foi possível combinar estes emojis. 
Algumas combinações conhecidas que funcionam:
- 😊 + 😎 = Emoji com óculos de sol sorrindo
- 🎉 + 🌟 = Emoji de celebração com estrelas
- 😍 + 🌹 = Emoji apaixonado com rosa
Tente uma dessas combinações!`
        }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
    } finally {
        if (outputPath) {
            fs.unlink(outputPath).catch(e => console.error('Erro ao remover arquivo temporário:', e));
        }
    }
}

// Função para adicionar texto a uma figurinha
async function adicionarTextoFigurinha(sock, msg, texto) {
    try {
        console.log('\n=== INÍCIO DO PROCESSO DE ADIÇÃO DE TEXTO EM FIGURINHA ===');
        console.log('Mensagem recebida:', {
            remoteJid: msg.key.remoteJid,
            messageType: 'command',
            command: '!figtxt',
            texto: texto
        });

        if (!texto) {
            console.log('❌ Texto não fornecido');
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Digite o texto que deseja adicionar à figurinha. Ex: !figtxt Olá mundo!'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }

        let stickerMsg = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage;
        if (!stickerMsg) {
            console.log('❌ Figurinha não encontrada na mensagem');
            await sock.sendMessage(msg.key.remoteJid, { 
                text: 'Responda a uma figurinha com o comando !figtxt seguido do texto.'
            }, { quoted: msg });
            await reagirMensagem(sock, msg, '❌');
            return;
        }

        console.log('✨ Iniciando processamento da figurinha...');
        await reagirMensagem(sock, msg, '⏳');

        console.log('📥 Baixando figurinha original...');
        const buffer = await downloadMediaMessage(
            { message: { stickerMessage: stickerMsg } },
            'buffer',
            {},
            { reuploadRequest: sock }
        );

        const timestamp = Date.now();
        const inputPath = path.join(tempDir, `temp_${timestamp}.webp`);
        const outputPath = path.join(tempDir, `sticker_${timestamp}.webp`);

        console.log('💾 Salvando figurinha temporária...');
        await fs.writeFile(inputPath, buffer);

        console.log('🎨 Processando imagem e adicionando texto...');
        await sharp(buffer)
            .resize(512, 512, { 
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 0 }
            })
            .composite([{
                input: Buffer.from(`
                    <svg width="512" height="512">
                        <style>
                            .texto {
                                font-family: Impact, Arial, sans-serif;
                                font-size: 100px;
                                font-weight: bold;
                                paint-order: stroke fill;
                                stroke: black;
                                stroke-width: 8;
                                stroke-linejoin: round;
                                fill: white;
                                text-anchor: middle;
                            }
                        </style>
                        <text class="texto" x="50%" y="85%" style="font-size: ${calcularTamanhoFonte(texto)}px">
                            ${ajustarTexto(texto)}
                        </text>
                    </svg>`
                ),
                top: 0,
                left: 0
            }])
            .webp()
            .toFile(outputPath);

        console.log('📤 Enviando figurinha com texto...');
        const stickerBuffer = await fs.readFile(outputPath);
        await sock.sendMessage(msg.key.remoteJid, { 
            sticker: stickerBuffer 
        }, { quoted: msg });

        console.log('✅ Figurinha enviada com sucesso');
        await reagirMensagem(sock, msg, '✅');

        // Limpar arquivos temporários
        fs.unlink(inputPath).catch(e => console.error('Erro ao remover arquivo temporário:', e));
        fs.unlink(outputPath).catch(e => console.error('Erro ao remover arquivo temporário:', e));

        console.log('=== FIM DO PROCESSO DE ADIÇÃO DE TEXTO EM FIGURINHA ===\n');

    } catch (error) {
        console.log('❌ Erro ao adicionar texto à figurinha:', error.message);
        await sock.sendMessage(msg.key.remoteJid, { 
            text: 'Erro ao adicionar texto à figurinha. Tente novamente.'
        }, { quoted: msg });
        await reagirMensagem(sock, msg, '❌');
    }
}

export {
    criarFigurinhaImagem,
    criarFigurinhaRecortada,
    criarFigurinhaAnimada,
    criarFigurinhaTexto,
    combinarEmojis,
    adicionarTextoFigurinha
};
