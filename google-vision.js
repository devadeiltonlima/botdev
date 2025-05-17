import vision from '@google-cloud/vision';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuração do caminho das credenciais
process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(__dirname, 'google-vision-credentials.json');

const client = new vision.ImageAnnotatorClient({
    keyFilename: path.join(__dirname, 'google-vision-credentials.json')
});

/**
 * Analisa uma imagem usando o Google Vision API
 * @param {string} imagePath - Caminho para a imagem ou URL da imagem
 * @returns {Promise<Object>} - Resultados da análise
 */
async function analyzeImage(imagePath) {
    try {
        const [result] = await client.annotateImage({
            image: {
                source: {
                    filename: imagePath
                }
            },
            features: [
                { type: 'LABEL_DETECTION' },
                { type: 'TEXT_DETECTION' },
                { type: 'FACE_DETECTION' },
                { type: 'LANDMARK_DETECTION' },
                { type: 'LOGO_DETECTION' },
                { type: 'SAFE_SEARCH_DETECTION' },
                { type: 'IMAGE_PROPERTIES' }
            ]
        });

        return {
            labels: result.labelAnnotations,
            text: result.textAnnotations,
            faces: result.faceAnnotations,
            landmarks: result.landmarkAnnotations,
            logos: result.logoAnnotations,
            safeSearch: result.safeSearchAnnotation,
            properties: result.imagePropertiesAnnotation,
        };
    } catch (error) {
        console.error('Erro ao analisar imagem:', error);
        throw error;
    }
}

/**
 * Analisa uma imagem através de uma URL usando o Google Vision API
 * @param {string} imageUrl - URL da imagem
 * @returns {Promise<Object>} - Resultados da análise
 */
async function analyzeImageFromUrl(imageUrl) {
    try {
        const [result] = await client.annotateImage({
            image: {
                source: {
                    imageUri: imageUrl
                }
            },
            features: [
                { type: 'LABEL_DETECTION' },
                { type: 'TEXT_DETECTION' },
                { type: 'FACE_DETECTION' },
                { type: 'LANDMARK_DETECTION' },
                { type: 'LOGO_DETECTION' },
                { type: 'SAFE_SEARCH_DETECTION' },
                { type: 'IMAGE_PROPERTIES' }
            ]
        });

        return {
            labels: result.labelAnnotations,
            text: result.textAnnotations,
            faces: result.faceAnnotations,
            landmarks: result.landmarkAnnotations,
            logos: result.logoAnnotations,
            safeSearch: result.safeSearchAnnotation,
            properties: result.imagePropertiesAnnotation,
        };
    } catch (error) {
        console.error('Erro ao analisar imagem da URL:', error);
        throw error;
    }
}

/**
 * Analisa rapidamente uma imagem (ideal para figurinhas e respostas rápidas)
 * Apenas LABEL_DETECTION e TEXT_DETECTION para maior velocidade
 * @param {string|Buffer} image - Caminho para a imagem local ou buffer da imagem
 * @returns {Promise<Object>} - Resultados da análise
 */
async function analyzeImageFast(image) {
    try {
        console.log('\n[Vision API] Iniciando análise rápida da imagem...');
        console.log(`[Vision API] Tipo de entrada: ${Buffer.isBuffer(image) ? 'Buffer' : 'Arquivo'}`);

        console.log('[Vision API] Configurando requisição...');
        const request = {
            image: Buffer.isBuffer(image) 
                ? { content: image } 
                : { source: { filename: image } },
            features: [
                { type: 'LABEL_DETECTION' },
                { type: 'TEXT_DETECTION' }
            ]
        };

        console.log('[Vision API] Enviando requisição para análise...');
        const [result] = await client.annotateImage(request);
        
        console.log('[Vision API] Análise concluída, processando resultados...');
        console.log('[Vision API] Labels encontradas:', result.labelAnnotations?.length || 0);
        console.log('[Vision API] Texto detectado:', result.textAnnotations ? 'Sim' : 'Não');
        return {
            labels: result.labelAnnotations,
            text: result.textAnnotations
        };
    } catch (error) {
        console.error('Erro ao analisar imagem rápida:', error);
        throw error;
    }
}

export {
    analyzeImage,
    analyzeImageFromUrl,
    analyzeImageFast
};
