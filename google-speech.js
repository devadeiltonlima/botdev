import 'dotenv/config';
import speech from '@google-cloud/speech';
import {Storage} from '@google-cloud/storage';
import fs from 'fs-extra';
import path from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Configuração do caminho das credenciais
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, 'google-speech-credentials.json');

// Inicializa os clientes do Google Cloud
const client = new speech.SpeechClient();
const storage = new Storage();
const bucketName = 'adeilton-bot-audio';

// Sistema de fila e controle de concorrência
const transcriptionQueue = [];
const maxConcurrentTranscriptions = 3; // Número máximo de transcrições simultâneas
let activeTranscriptions = 0;

/**
 * Faz upload do arquivo para o Google Cloud Storage
 * @param {string} filePath - Caminho do arquivo local 
 * @returns {Promise<string>} - URI do arquivo no GCS
 */
async function uploadToGCS(filePath) {
    console.log(`[GCS Upload] Iniciando upload do arquivo: ${filePath}`);
    const fileName = `audio_${Date.now()}_${Math.random().toString(36).substring(7)}.ogg`;
    
    try {
        console.log(`[GCS Upload] Enviando para bucket: ${bucketName} com nome: ${fileName}`);
        await storage.bucket(bucketName).upload(filePath, {
            destination: fileName,
            metadata: {
                contentType: 'audio/ogg'
            }
        });
        console.log('[GCS Upload] Upload concluído com sucesso');
        return `gs://${bucketName}/${fileName}`;
    } catch (error) {
        console.error('[GCS Upload] Erro no upload:', error);
        throw error;
    }
}

/**
 * Remove um arquivo do Google Cloud Storage
 * @param {string} gcsUri - URI do arquivo no GCS
 */
async function deleteFromGCS(gcsUri) {
    try {
        console.log(`[GCS Delete] Removendo arquivo: ${gcsUri}`);
        const fileName = gcsUri.split('/').pop();
        await storage.bucket(bucketName).file(fileName).delete();
        console.log('[GCS Delete] Arquivo removido com sucesso');
    } catch (error) {
        console.error('[GCS Delete] Erro ao deletar arquivo:', error);
    }
}

/**
 * Processa um item da fila de transcrição
 */
async function processNextInQueue() {
    console.log(`[Queue] Status da fila - Tamanho: ${transcriptionQueue.length}, Transcrições ativas: ${activeTranscriptions}`);
    if (transcriptionQueue.length === 0 || activeTranscriptions >= maxConcurrentTranscriptions) {
        console.log('[Queue] Fila vazia ou limite de transcrições ativas atingido');
        return;
    }

    console.log('[Queue] Iniciando processamento do próximo item da fila');
    activeTranscriptions++;
    const task = transcriptionQueue.shift();

    try {
        const result = await processTranscription(task.audioBuffer, task.events);
        console.log('[Queue] Transcrição concluída com sucesso');
        task.resolve(result);
    } catch (error) {
        console.error('[Queue] Erro no processamento:', error);
        task.reject(error);
    } finally {
        activeTranscriptions--;
        console.log(`[Queue] Transcrição finalizada. Transcrições ativas restantes: ${activeTranscriptions}`);
        process.nextTick(processNextInQueue);
    }
}

/**
 * Processa a transcrição de um áudio
 * @param {Buffer} audioBuffer - Buffer do áudio
 * @param {Object} events - Eventos de callback
 * @returns {Promise<string>} - Texto transcrito
 */
async function processTranscription(audioBuffer, events = {}) {
    console.log('\n=== INÍCIO DO PROCESSO DE TRANSCRIÇÃO ===');
    const tempDir = path.join(__dirname, 'temp');
    const tempInputFile = path.join(tempDir, `input_${Date.now()}_${Math.random().toString(36).substring(7)}.opus`);
    const tempOutputFile = path.join(tempDir, `output_${Date.now()}_${Math.random().toString(36).substring(7)}.ogg`);
    
    console.log(`[Files] Arquivos temporários:\nInput: ${tempInputFile}\nOutput: ${tempOutputFile}`);
    await fs.ensureDir(tempDir);
    let gcsUri = null;
    
    try {
        console.log('[Start] Iniciando processo de transcrição');
        if (events.onStart) {
            console.log('[Events] Executando evento onStart');
            await events.onStart();
        }
        
        console.log('[Files] Salvando buffer de áudio em arquivo temporário');
        await fs.writeFile(tempInputFile, audioBuffer);
        
        if (events.onConvert) {
            console.log('[Events] Executando evento onConvert');
            await events.onConvert();
        }
        
        console.log('[FFmpeg] Iniciando conversão de áudio');
        await new Promise((resolve, reject) => {
            ffmpeg(tempInputFile)
                .toFormat('ogg')
                .audioCodec('libopus')
                .audioChannels(1)
                .audioFrequency(48000)
                .outputOptions([
                    '-c:a libopus',
                    '-b:a 128k',
                    '-application voip'
                ])
                .on('start', (cmd) => console.log('[FFmpeg] Comando:', cmd))
                .on('progress', (progress) => console.log('[FFmpeg] Progresso:', progress))
                .on('end', () => {
                    console.log('[FFmpeg] Conversão concluída');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('[FFmpeg] Erro na conversão:', err);
                    reject(err);
                })
                .save(tempOutputFile);
        });
        
        const stats = await fs.stat(tempOutputFile);
        const fileSizeInMB = stats.size / (1024 * 1024);
        console.log(`[Files] Tamanho do arquivo convertido: ${fileSizeInMB.toFixed(2)}MB`);

        const config = {
            encoding: 'OGG_OPUS',
            sampleRateHertz: 48000,
            audioChannelCount: 1,
            enableAutomaticPunctuation: true,
            languageCode: 'pt-BR',
            model: 'latest_long',
            useEnhanced: true,
            enableWordTimeOffsets: true,
            profanityFilter: false,
            enableWordConfidence: true
        };
        console.log('[Config] Configuração da transcrição:', config);

        let transcricao;
        
        if (fileSizeInMB > 0.5) {
            console.log('[Process] Áudio longo detectado, usando upload para GCS');
            
            if (events.onUpload) {
                console.log('[Events] Executando evento onUpload');
                await events.onUpload();
            }
            
            try {
                let retries = 3;
                while (retries > 0) {
                    try {
                        console.log(`[GCS] Tentativa ${4-retries} de upload`);
                        gcsUri = await uploadToGCS(tempOutputFile);
                        console.log('[GCS] Upload bem-sucedido:', gcsUri);
                        break;
                    } catch (error) {
                        retries--;
                        console.error(`[GCS] Erro no upload. Tentativas restantes: ${retries}`, error);
                        if (retries === 0) throw error;
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
                
                if (events.onProcess) {
                    console.log('[Events] Executando evento onProcess');
                    await events.onProcess();
                }
                
                const request = {
                    audio: { uri: gcsUri },
                    config: config
                };
                console.log('[API] Enviando requisição de transcrição longa');

                const [operation] = await client.longRunningRecognize(request);
                console.log('[API] Aguardando conclusão da transcrição longa');
                
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Timeout na transcrição')), 300000);
                });
                
                const [response] = await Promise.race([
                    operation.promise(),
                    timeoutPromise
                ]);
                
                console.log('[API] Resposta recebida:', 
                    response?.results ? 'Com resultados' : 'Sem resultados');
                
                if (!response?.results?.length) {
                    throw new Error('Nenhum resultado encontrado na transcrição');
                }
                
                transcricao = response.results
                    .filter(result => result?.alternatives?.[0]?.transcript)
                    .map(result => result.alternatives[0].transcript)
                    .join('\n');
                
            } catch (error) {
                console.error('[Process] Erro específico na transcrição:', error);
                throw error;
            }
            
        } else {
            console.log('[Process] Áudio curto detectado, usando reconhecimento síncrono');
            const audioBytes = await fs.readFile(tempOutputFile);
            const request = {
                audio: { content: audioBytes.toString('base64') },
                config: config
            };
            console.log('[API] Enviando requisição de transcrição curta');
            
            const [response] = await client.recognize(request);
            console.log('[API] Resposta recebida:', 
                response?.results ? 'Com resultados' : 'Sem resultados');
            
            if (!response?.results?.length) {
                throw new Error('Nenhum resultado encontrado na transcrição');
            }
            
            transcricao = response.results
                .filter(result => result?.alternatives?.[0]?.transcript)
                .map(result => result.alternatives[0].transcript)
                .join('\n');
        }
        
        if (!transcricao) {
            throw new Error('Transcrição retornou vazia');
        }
        console.log('[Process] Transcrição concluída com sucesso');

        if (events.onComplete) {
            console.log('[Events] Executando evento onComplete');
            await events.onComplete();
        }

        console.log('[Cleanup] Removendo arquivos temporários');
        await fs.remove(tempInputFile);
        await fs.remove(tempOutputFile);
        if (gcsUri) {
            await deleteFromGCS(gcsUri);
        }
        
        console.log('=== FIM DO PROCESSO DE TRANSCRIÇÃO ===\n');
        return transcricao;
        
    } catch (error) {
        console.error('\n[ERROR] Erro ao transcrever áudio:', error);
        
        try {
            console.log('[Cleanup] Tentando limpar arquivos após erro');
            await fs.remove(tempInputFile);
            await fs.remove(tempOutputFile);
            if (gcsUri) {
                await deleteFromGCS(gcsUri);
            }
        } catch (cleanupError) {
            console.error('[Cleanup] Erro ao limpar arquivos:', cleanupError);
        }
        
        if (error.message === 'Timeout na transcrição') {
            throw new Error('A transcrição está demorando muito. Por favor, tente novamente com um áudio menor.');
        } else if (error.message === 'Nenhum resultado encontrado na transcrição' || error.message === 'Transcrição retornou vazia') {
            throw new Error('Não foi possível reconhecer o áudio. Verifique se o áudio está claro e tente novamente.');
        } else if (error.code === 7) {
            throw new Error('O serviço de transcrição está desativado. Por favor, ative o Cloud Speech-to-Text API no console do Google Cloud.');
        } else if (error.code === 3 && error.details?.includes('audio exceeds')) {
            throw new Error('O áudio é muito longo. Por favor, envie um áudio mais curto.');
        } else if (error.code === 'ENOENT') {
            throw new Error('Erro ao processar o arquivo de áudio. Tente novamente.');
        } else {
            console.error('[ERROR] Erro detalhado:', error);
            throw new Error('Ocorreu um erro ao transcrever o áudio. Por favor, tente novamente.');
        }
    }
}

/**
 * Função principal que gerencia a fila de transcrição
 * @param {Buffer} audioBuffer - Buffer do áudio a ser transcrito
 * @param {Object} events - Eventos de callback
 * @returns {Promise<string>} - Texto transcrito
 */
async function transcreverAudio(audioBuffer, events = {}) {
    console.log('[Queue] Adicionando nova transcrição à fila');
    return new Promise((resolve, reject) => {
        transcriptionQueue.push({
            audioBuffer,
            events,
            resolve,
            reject
        });
        
        console.log('[Queue] Item adicionado à fila, iniciando processamento');
        processNextInQueue();
    });
}

export {
    transcreverAudio
};
