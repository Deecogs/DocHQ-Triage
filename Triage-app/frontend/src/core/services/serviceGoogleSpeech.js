import axios from 'axios';

class ServiceGoogleSpeech {
    constructor() {
        // Use environment variable or fallback to localhost
        const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080';
        this.GOOGLE_STT_API = `${backendUrl}/api/speech-to-text`;
        this.GOOGLE_TTS_API = `${backendUrl}/api/text-to-speech`;
        this.HEALTH_API = `${backendUrl}/api/speech/health`;
        this.isConfigured = false;
    }

    async checkHealth() {
        try {
            const response = await axios.get(this.HEALTH_API);
            this.isConfigured = response.data?.data?.api_working || false;
            console.log('Speech API health check result:', this.isConfigured);
            return this.isConfigured;
        } catch (error) {
            console.warn('Speech API health check failed:', error.message);
            this.isConfigured = false;
            return false;
        }
    }

    async speechToText(audioBlob, languageCode = 'en-US') {
        try {
            const base64Audio = await this.blobToBase64(audioBlob);
            const audioContent = base64Audio.split(',')[1];
            
            const requestBody = {
                audio_content: audioContent,
                language_code: languageCode
            };

            console.log('Sending STT request, audio size:', audioContent.length);
            const response = await axios.post(this.GOOGLE_STT_API, requestBody, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.data?.success && response.data?.data?.transcript) {
                console.log('STT successful:', response.data.data.transcript);
                return response.data.data.transcript;
            }
            
            console.warn('STT returned no transcript');
            return null;
        } catch (error) {
            console.error('STT error:', error.response?.data || error.message);
            return null;
        }
    }

    async textToSpeech(text, options = {}) {
        try {
            const requestBody = {
                text: text,
                voice_name: options.voiceName || 'en-US-Neural2-F',
                language_code: options.languageCode || 'en-US',
                speaking_rate: options.speakingRate || 0.9
            };

            console.log('Sending TTS request for:', text.substring(0, 50) + '...');
            const response = await axios.post(this.GOOGLE_TTS_API, requestBody, {
                timeout: 30000,
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.data?.success && response.data?.data?.audio_content) {
                console.log('TTS successful');
                return this.base64ToBlob(response.data.data.audio_content, 'audio/wav');
            }
            
            throw new Error('No audio content in response');
        } catch (error) {
            console.warn('TTS API failed:', error.response?.data || error.message);
            throw error; // Let caller handle fallback
        }
    }

    async playAudio(audioBlob) {
        if (!audioBlob || audioBlob.size === 0) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                const audioUrl = URL.createObjectURL(audioBlob);
                const audio = new Audio(audioUrl);
                
                audio.volume = 1.0;
                
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                };
                
                audio.onerror = () => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                };
                
                audio.play().catch(() => {
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                });
            } catch (error) {
                console.warn('Audio playback error:', error);
                resolve();
            }
        });
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve('');
                reader.readAsDataURL(blob);
            } catch (error) {
                resolve('');
            }
        });
    }

    base64ToBlob(base64, contentType) {
        try {
            const byteCharacters = atob(base64);
            const byteNumbers = new Array(byteCharacters.length);
            
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            
            const byteArray = new Uint8Array(byteNumbers);
            return new Blob([byteArray], { type: contentType });
        } catch (error) {
            console.warn('base64ToBlob error:', error);
            return new Blob([''], { type: contentType });
        }
    }
}

export default ServiceGoogleSpeech;