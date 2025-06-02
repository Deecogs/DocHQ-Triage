import axios from 'axios';

class ServiceGoogleSpeech {
    constructor() {
        // Update these with your actual API endpoints
        this.GOOGLE_STT_API = process.env.REACT_APP_GOOGLE_STT_API || 'http://localhost:8080/api/speech-to-text';
        this.GOOGLE_TTS_API = process.env.REACT_APP_GOOGLE_TTS_API || 'http://localhost:8080/api/text-to-speech';
        
        // Google Cloud API key (for direct API calls if needed)
        this.GOOGLE_API_KEY = process.env.REACT_APP_GOOGLE_API_KEY;
    }

    /**
     * Convert speech (audio blob) to text using Google Speech-to-Text API
     * @param {Blob} audioBlob - Audio data as blob
     * @param {string} languageCode - Language code (default: 'en-US')
     * @returns {Promise<string>} - Transcribed text
     */
    async speechToText(audioBlob, languageCode = 'en-US') {
        try {
            // Convert blob to base64
            const base64Audio = await this.blobToBase64(audioBlob);
            
            // Remove the data URL prefix to get pure base64
            const audioContent = base64Audio.split(',')[1];
            
            // Determine encoding based on audio type
            let encoding = 'OGG_OPUS';
            if (audioBlob.type.includes('webm')) {
                encoding = 'WEBM_OPUS';
            } else if (audioBlob.type.includes('mp4')) {
                encoding = 'MP4';
            }
            
            const requestBody = {
                config: {
                    encoding: encoding,
                    sampleRateHertz: 48000,
                    languageCode: languageCode,
                    enableAutomaticPunctuation: true,
                    model: 'medical_conversation', // Use medical model for better accuracy
                },
                audio: {
                    content: audioContent
                }
            };

            const response = await axios.post(this.GOOGLE_STT_API, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    // Add authorization header if using direct Google API
                    // 'Authorization': `Bearer ${this.GOOGLE_API_KEY}`
                }
            });

            if (response.data && response.data.results && response.data.results.length > 0) {
                return response.data.results[0].alternatives[0].transcript;
            }
            
            return '';
        } catch (error) {
            console.error('Speech-to-Text error:', error);
            throw error;
        }
    }

    /**
     * Convert text to speech using Google Text-to-Speech API with Chirp models
     * @param {string} text - Text to convert to speech
     * @param {Object} options - Voice options
     * @returns {Promise<Blob>} - Audio blob
     */
    async textToSpeech(text, options = {}) {
        try {
            const requestBody = {
                input: {
                    markup: text // Using markup field for Chirp models
                },
                voice: {
                    languageCode: options.languageCode || 'en-GB',
                    name: options.voiceName || 'en-GB-Chirp3-HD-Despina', // High-quality Chirp voice
                    voiceClone: {} // Enable voice cloning features
                },
                audioConfig: {
                    audioEncoding: options.audioEncoding || 'LINEAR16', // Better quality than MP3
                    speakingRate: options.speakingRate || 0.9,
                    pitch: options.pitch || 0,
                    volumeGainDb: options.volumeGainDb || 0
                }
            };

            const response = await axios.post(this.GOOGLE_TTS_API, requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    // Add authorization header if using direct Google API
                    // 'Authorization': `Bearer ${this.GOOGLE_API_KEY}`
                },
                responseType: 'json'
            });

            if (response.data && response.data.audioContent) {
                // Convert base64 to blob - LINEAR16 is WAV format
                const audioBlob = this.base64ToBlob(response.data.audioContent, 'audio/wav');
                return audioBlob;
            }
            
            throw new Error('No audio content received');
        } catch (error) {
            console.error('Text-to-Speech error:', error);
            throw error;
        }
    }

    /**
     * Play audio blob
     * @param {Blob} audioBlob - Audio blob to play
     * @returns {Promise<void>}
     */
    async playAudio(audioBlob) {
        return new Promise((resolve, reject) => {
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            audio.onended = () => {
                URL.revokeObjectURL(audioUrl);
                resolve();
            };
            
            audio.onerror = (error) => {
                URL.revokeObjectURL(audioUrl);
                reject(error);
            };
            
            audio.play().catch(reject);
        });
    }

    /**
     * Helper function to convert blob to base64
     */
    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Helper function to convert base64 to blob
     */
    base64ToBlob(base64, contentType) {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: contentType });
    }
}

export default ServiceGoogleSpeech;