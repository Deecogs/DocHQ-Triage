// frontend/src/core/services/serviceGoogleSpeech.js
import axios from 'axios';

class ServiceGoogleSpeech {
    constructor() {
        this.GOOGLE_STT_API = `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080'}/api/speech-to-text`;
        this.GOOGLE_TTS_API = `${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080'}/api/text-to-speech`;
        this.isConfigured = false;
        // Don't check health in constructor - it can block initialization
    }

    async checkHealth() {
        try {
            const response = await axios.get(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080'}/api/speech/health`);
            this.isConfigured = response.data?.data?.api_working || false;
            return this.isConfigured;
        } catch (error) {
            console.warn('Speech API health check failed, using fallback:', error.message);
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

            console.log('Sending speech-to-text request, audio size:', audioContent.length);
            const response = await axios.post(this.GOOGLE_STT_API, requestBody, {
                timeout: 30000 // 30 second timeout
            });
            
            if (response.data?.success && response.data?.data?.transcript) {
                console.log('Speech-to-text successful:', response.data.data.transcript);
                return response.data.data.transcript;
            }
            
            console.warn('Speech-to-text returned no transcript');
            return null; // Return null instead of empty string to indicate failure
        } catch (error) {
            console.error('Speech-to-Text error:', error.response?.data || error.message);
            // Return null to indicate failure, let the caller handle retry
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

            console.log('Sending text-to-speech request for:', text.substring(0, 50) + '...');
            const response = await axios.post(this.GOOGLE_TTS_API, requestBody, {
                timeout: 30000 // 30 second timeout
            });
            
            if (response.data?.success && response.data?.data?.audio_content) {
                console.log('Text-to-speech successful');
                return this.base64ToBlob(response.data.data.audio_content, 'audio/wav');
            }
            
            // Fallback to browser TTS
            console.warn('No audio content in response, falling back to browser TTS');
            throw new Error('No audio content');
        } catch (error) {
            console.warn('Text-to-Speech API failed, using browser TTS:', error.response?.data || error.message);
            return this.browserTextToSpeech(text);
        }
    }

    async browserTextToSpeech(text) {
        // Return a promise that resolves with a dummy blob
        return new Promise((resolve) => {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.rate = 0.9;
                window.speechSynthesis.speak(utterance);
            }
            // Return dummy blob for consistency
            resolve(new Blob([''], { type: 'audio/wav' }));
        });
    }

    async playAudio(audioBlob) {
        // Check if it's a dummy blob
        if (!audioBlob || audioBlob.size === 0) {
            // Wait for browser TTS to finish
            return new Promise((resolve) => {
                if ('speechSynthesis' in window) {
                    const checkSpeaking = setInterval(() => {
                        if (!window.speechSynthesis.speaking) {
                            clearInterval(checkSpeaking);
                            resolve();
                        }
                    }, 100);
                    // Timeout after 10 seconds
                    setTimeout(() => {
                        clearInterval(checkSpeaking);
                        resolve();
                    }, 10000);
                } else {
                    resolve();
                }
            });
        }

        // Normal audio playback
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
                    resolve(); // Resolve instead of reject to prevent app crash
                };
                
                audio.play().then(() => {
                    // Playing successfully
                }).catch(() => {
                    // Can't play, just resolve
                    URL.revokeObjectURL(audioUrl);
                    resolve();
                });
            } catch (error) {
                console.warn('Audio playback error:', error);
                resolve(); // Always resolve to prevent blocking
            }
        });
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            try {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(''); // Return empty string on error
                reader.readAsDataURL(blob);
            } catch (error) {
                resolve(''); // Return empty string on error
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